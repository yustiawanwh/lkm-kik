-- 001400_likert_rubrik.sql
-- Fitur untuk mengakomodasi LKPD berbasis instrumen berskala & rubrik
-- (mis. TP 11.1 Talent Mapping, TP 11.2 Eksplorasi Ide).
--
--  1. prompt_refleksi pada tujuan_pembelajaran — guru menentukan sendiri
--     pertanyaan refleksi (sebelumnya terkunci 3 butir bawaan).
--  2. rubrik pada tujuan_pembelajaran + nilai_rubrik pada penilaian —
--     guru menilai per kriteria, nilai akhir dihitung otomatis.
--
-- Prasyarat: jalankan 001350_tipe_likert.sql lebih dulu.

-- CATATAN: nilai enum 'likert' ditambahkan di migrasi TERPISAH
-- 001350_tipe_likert.sql, yang harus dijalankan LEBIH DULU. Perintah
-- ALTER TYPE ... ADD VALUE tidak boleh berada satu transaksi dengan
-- perintah lain, jadi tidak bisa digabung ke berkas ini.

-- ============ 1. Pertanyaan refleksi kustom ============
alter table tujuan_pembelajaran add column if not exists prompt_refleksi jsonb;

comment on column tujuan_pembelajaran.prompt_refleksi is
  'Daftar pertanyaan refleksi kustom: [{"key":"pelajaran","label":"..."}]. NULL = pakai 3 pertanyaan bawaan.';

-- ============ 2. Rubrik penilaian ============
alter table tujuan_pembelajaran add column if not exists rubrik jsonb;

comment on column tujuan_pembelajaran.rubrik is
  'Rubrik penilaian: {"skor_maks":4,"kriteria":[{"nama":"...","bagian":"D","level":{"4":"Sangat Baik ...","3":"Baik ...","1":"Perlu Bimbingan ..."}}]}. NULL = penilaian angka biasa 0-100.';

-- nilai_tugas menerima rincian rubrik supaya jejak penilaian tersimpan.
create or replace function nilai_tugas(
  p_progres_id uuid,
  p_nilai numeric,
  p_umpan_balik text default null,
  p_nilai_rubrik jsonb default null
)
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

  if v_progres.disetujui_pada is not null then
    raise exception 'Tugas ini sudah dinilai. Gunakan fitur Perbaiki Nilai untuk mengubahnya.';
  end if;

  select * into v_tugas from tugas where id = v_progres.tugas_id;

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
    nilai_rubrik = coalesce(p_nilai_rubrik, nilai_rubrik),
    umpan_balik = p_umpan_balik,
    status = 'selesai',
    disetujui_pada = now(),
    kena_penalti_susulan = v_kena_susulan,
    xp_diberikan = v_xp_dasar,
    terkunci = true
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

grant execute on function nilai_tugas(uuid, numeric, text, jsonb) to authenticated;

-- perbaiki_nilai ikut meneruskan rincian rubrik.
create or replace function perbaiki_nilai(
  p_progres_id uuid,
  p_nilai numeric,
  p_umpan_balik text default null,
  p_nilai_rubrik jsonb default null
)
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

  update progres_tugas set disetujui_pada = null, xp_diberikan = 0, terkunci = false
    where id = p_progres_id;

  return nilai_tugas(p_progres_id, p_nilai, p_umpan_balik, p_nilai_rubrik);
end;
$$;

grant execute on function perbaiki_nilai(uuid, numeric, text, jsonb) to authenticated;
