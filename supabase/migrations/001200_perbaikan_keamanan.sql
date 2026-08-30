-- 001200_perbaikan_keamanan.sql
-- PERBAIKAN KEAMANAN KRITIS (hasil audit menyeluruh).
--
-- Masalah yang ditutup:
--  1. profil_ubah_sendiri (000500) mengizinkan murid mengubah SELURUH kolom
--     barisnya sendiri — termasuk "peran". Murid bisa memanggil API langsung
--     dari Console browser dan menjadikan dirinya admin, membatalkan seluruh
--     pengamanan pendaftaran di migrasi 000110.
--  2. progres_ubah_murid (000500) & progres_ubah_kelompok (000600) juga
--     mengizinkan murid menulis SEMUA kolom progres_tugas miliknya —
--     termasuk nilai_angka/nilai_huruf/xp_diberikan. Karena Rekap Nilai
--     membaca nilai_angka langsung, murid bisa memalsukan nilainya sendiri.
--  3. nilai_tugas() tidak memeriksa apakah tugas sudah pernah dinilai, jadi
--     penilaian ulang menambah XP & tugas_selesai berkali-kali.
--
-- Catatan pendekatan: RLS Postgres tidak bisa membatasi KOLOM mana yang
-- boleh di-UPDATE (hanya baris). Jadi pembatasan kolom dilakukan lewat
-- trigger BEFORE UPDATE yang memaksa kolom sensitif kembali ke nilai lama.

-- ============ 1. Kunci kolom "peran" pada profil ============
create or replace function jaga_kolom_profil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Admin boleh mengubah peran siapa pun. Selain admin, peran DIPAKSA tetap.
  if not saya_admin() then
    new.peran := old.peran;
    new.id := old.id;
    new.dibuat_pada := old.dibuat_pada;
  end if;
  return new;
end;
$$;

drop trigger if exists sebelum_profil_diubah on profil;
create trigger sebelum_profil_diubah
  before update on profil
  for each row execute function jaga_kolom_profil();

-- ============ 2. Kunci kolom penilaian pada progres_tugas ============
create or replace function jaga_kolom_progres()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_guru boolean;
begin
  v_guru := saya_guru_penugasan(new.penugasan_id) or saya_admin();

  if not v_guru then
    -- Murid TIDAK boleh menyentuh kolom hasil penilaian.
    new.nilai_angka := old.nilai_angka;
    new.nilai_huruf := old.nilai_huruf;
    new.nilai_rubrik := old.nilai_rubrik;
    new.xp_diberikan := old.xp_diberikan;
    new.umpan_balik := old.umpan_balik;
    new.disetujui_pada := old.disetujui_pada;
    new.kena_penalti_susulan := old.kena_penalti_susulan;
    new.terkunci := old.terkunci;
    new.penugasan_id := old.penugasan_id;
    new.tugas_id := old.tugas_id;
    new.murid_id := old.murid_id;
    new.kelompok_id := old.kelompok_id;

    -- Sekali dinilai, murid tidak boleh mengembalikan status untuk
    -- "menilai ulang" (jalur utama penambahan XP ganda).
    if old.status = 'selesai' then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sebelum_progres_diubah on progres_tugas;
create trigger sebelum_progres_diubah
  before update on progres_tugas
  for each row execute function jaga_kolom_progres();

-- ============ 3. Cegah penilaian ganda di nilai_tugas() ============
create or replace function nilai_tugas(p_progres_id uuid, p_nilai numeric, p_umpan_balik text default null)
returns progres_tugas
language plpgsql
security definer set search_path = public
as $$
declare
  v_progres progres_tugas;
  v_tugas tugas;
  v_penugasan penugasan;
  v_huruf text;
  v_kena_susulan boolean := false;
  v_penalti numeric := 0;
  v_nilai_akhir numeric;
  v_anggota record;
  v_xp_dasar int;
  v_xp_anggota int;
  v_faktor numeric;
begin
  select * into v_progres from progres_tugas where id = p_progres_id;
  if v_progres.id is null then raise exception 'Progres tugas tidak ditemukan.'; end if;

  select * into v_penugasan from penugasan where id = v_progres.penugasan_id;
  if not (saya_guru_penugasan(v_progres.penugasan_id) or saya_admin()) then
    raise exception 'Anda tidak punya izin menilai tugas ini.';
  end if;

  -- PENJAGA PENILAIAN GANDA: kalau sudah pernah dinilai, XP sudah terlanjur
  -- diberikan. Perbaikan nilai dilakukan lewat perbaiki_nilai() agar XP
  -- lama dikoreksi dulu, bukan ditumpuk.
  if v_progres.disetujui_pada is not null then
    raise exception 'Tugas ini sudah dinilai. Gunakan fitur Perbaiki Nilai untuk mengubahnya.';
  end if;

  select * into v_tugas from tugas where id = v_progres.tugas_id;

  -- Cek susulan — untuk misi mandiri (murid) MAUPUN misi kelompok (cek
  -- apakah ADA anggota kelompok yang diberi kelonggaran bertanda penalti).
  if v_progres.murid_id is not null then
    select exists (
      select 1 from kelonggaran_sprint ks
      where ks.penugasan_id = v_progres.penugasan_id and ks.sprint_id = v_tugas.sprint_id
        and ks.murid_id = v_progres.murid_id and ks.susulan = true
    ) into v_kena_susulan;
  elsif v_progres.kelompok_id is not null then
    select exists (
      select 1 from kelonggaran_sprint ks
      join anggota_kelompok ak on ak.murid_id = ks.murid_id
      where ks.penugasan_id = v_progres.penugasan_id and ks.sprint_id = v_tugas.sprint_id
        and ak.kelompok_id = v_progres.kelompok_id and ks.susulan = true
    ) into v_kena_susulan;
  end if;

  if v_kena_susulan then
    select coalesce((nilai->>'penalti')::numeric, 0) into v_penalti from pengaturan where kunci = 'susulan';
  end if;

  v_nilai_akhir := greatest(0, least(100, p_nilai - v_penalti));
  v_huruf := huruf_dari_nilai(v_nilai_akhir);
  v_xp_dasar := round(v_tugas.xp * v_nilai_akhir / 100.0);

  update progres_tugas set
    nilai_huruf = v_huruf,
    nilai_angka = v_nilai_akhir,
    umpan_balik = p_umpan_balik,
    status = 'selesai',
    disetujui_pada = now(),
    kena_penalti_susulan = v_kena_susulan,
    xp_diberikan = v_xp_dasar,
    terkunci = true   -- kunci dari perubahan murid setelah dinilai
  where id = p_progres_id
  returning * into v_progres;

  if v_progres.murid_id is not null then
    insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
    values (v_progres.murid_id, v_xp_dasar, 'task', v_progres.id, 'Misi: ' || v_tugas.judul);

    update statistik_murid set
      total_xp = total_xp + v_xp_dasar, tugas_selesai = tugas_selesai + 1, diperbarui_pada = now()
    where murid_id = v_progres.murid_id;

    perform cek_badge_otomatis(v_progres.murid_id, v_penugasan.tujuan_pembelajaran_id);
  elsif v_progres.kelompok_id is not null then
    for v_anggota in select murid_id from anggota_kelompok where kelompok_id = v_progres.kelompok_id
    loop
      select coalesce(faktor, 1.0) into v_faktor
        from kontribusi_individu where progres_tugas_id = v_progres.id and murid_id = v_anggota.murid_id;
      if v_faktor is null then v_faktor := 1.0; end if;
      v_xp_anggota := round(v_xp_dasar * v_faktor);

      insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
      values (v_anggota.murid_id, v_xp_anggota, 'kontribusi', v_progres.id, 'Misi kelompok: ' || v_tugas.judul);

      update statistik_murid set
        total_xp = total_xp + v_xp_anggota, tugas_selesai = tugas_selesai + 1, diperbarui_pada = now()
      where murid_id = v_anggota.murid_id;

      perform cek_badge_otomatis(v_anggota.murid_id, v_penugasan.tujuan_pembelajaran_id);
    end loop;
  end if;

  return v_progres;
end;
$$;

-- ============ 4. Perbaiki nilai (koreksi setelah dinilai) ============
-- Menarik XP lama (entri negatif di buku_xp agar jejaknya tetap terlihat),
-- lalu menilai ulang dari awal. Ini jalur RESMI untuk mengubah nilai.
create or replace function perbaiki_nilai(p_progres_id uuid, p_nilai numeric, p_umpan_balik text default null)
returns progres_tugas
language plpgsql
security definer set search_path = public
as $$
declare
  v_progres progres_tugas;
  v_tugas tugas;
  v_anggota record;
  v_xp_lama int;
  v_faktor numeric;
begin
  select * into v_progres from progres_tugas where id = p_progres_id;
  if v_progres.id is null then raise exception 'Progres tugas tidak ditemukan.'; end if;
  if not (saya_guru_penugasan(v_progres.penugasan_id) or saya_admin()) then
    raise exception 'Anda tidak punya izin menilai tugas ini.';
  end if;
  if v_progres.disetujui_pada is null then
    raise exception 'Tugas ini belum pernah dinilai. Gunakan penilaian biasa.';
  end if;

  select * into v_tugas from tugas where id = v_progres.tugas_id;
  v_xp_lama := coalesce(v_progres.xp_diberikan, 0);

  -- Tarik XP lama.
  if v_progres.murid_id is not null then
    insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
    values (v_progres.murid_id, -v_xp_lama, 'manual', v_progres.id, 'Koreksi nilai: ' || v_tugas.judul);
    update statistik_murid set
      total_xp = total_xp - v_xp_lama, tugas_selesai = greatest(0, tugas_selesai - 1), diperbarui_pada = now()
    where murid_id = v_progres.murid_id;
  elsif v_progres.kelompok_id is not null then
    for v_anggota in select murid_id from anggota_kelompok where kelompok_id = v_progres.kelompok_id loop
      select coalesce(faktor, 1.0) into v_faktor
        from kontribusi_individu where progres_tugas_id = v_progres.id and murid_id = v_anggota.murid_id;
      if v_faktor is null then v_faktor := 1.0; end if;
      insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
      values (v_anggota.murid_id, -round(v_xp_lama * v_faktor), 'manual', v_progres.id, 'Koreksi nilai kelompok: ' || v_tugas.judul);
      update statistik_murid set
        total_xp = total_xp - round(v_xp_lama * v_faktor), tugas_selesai = greatest(0, tugas_selesai - 1), diperbarui_pada = now()
      where murid_id = v_anggota.murid_id;
    end loop;
  end if;

  -- Kembalikan ke keadaan "belum dinilai", lalu nilai ulang lewat jalur normal.
  update progres_tugas set disetujui_pada = null, xp_diberikan = 0, terkunci = false
    where id = p_progres_id;

  return nilai_tugas(p_progres_id, p_nilai, p_umpan_balik);
end;
$$;

grant execute on function perbaiki_nilai(uuid, numeric, text) to authenticated;
