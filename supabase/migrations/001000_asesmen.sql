-- 001000_asesmen.sql
-- Fase 6 — Asesmen non-tes: penilaian sejawat, refleksi, observasi sikap,
-- dan pemberian badge OTOMATIS berdasarkan kriteria sederhana + manual oleh guru.

-- ============ Kolom nilai numerik (dibutuhkan kriteria badge "nilai_rata_rata_min") ============
alter table progres_tugas add column if not exists nilai_angka numeric;

-- ============ Penilaian Sejawat ============
create table if not exists penilaian_sejawat (
  id uuid primary key default gen_random_uuid(),
  penugasan_id uuid not null references penugasan(id) on delete cascade,
  sprint_id uuid not null references sprint(id) on delete cascade,
  kelompok_id uuid not null references kelompok(id) on delete cascade,
  penilai_id uuid not null references profil(id) on delete cascade,
  dinilai_id uuid not null references profil(id) on delete cascade,
  skor jsonb not null default '{}'::jsonb, -- {"kerjasama":4,"kontribusi":5,"komunikasi":4}
  komentar text,
  dibuat_pada timestamptz not null default now(),
  unique (penugasan_id, sprint_id, penilai_id, dinilai_id),
  check (penilai_id <> dinilai_id)
);

alter table penilaian_sejawat enable row level security;

drop policy if exists sejawat_baca on penilaian_sejawat;
create policy sejawat_baca on penilaian_sejawat for select
  using (penilai_id = auth.uid() or saya_guru_penugasan(penugasan_id) or saya_admin());
-- Catatan sengaja: dinilai_id (yang dinilai) TIDAK bisa membaca skor sejawat
-- tentang dirinya sendiri secara langsung — sejalan prinsip "tanpa pesan
-- privat/penilaian terbuka antar murid" di PRD. Guru yang menyampaikan
-- rangkumannya kalau relevan.

drop policy if exists sejawat_tulis_sendiri on penilaian_sejawat;
create policy sejawat_tulis_sendiri on penilaian_sejawat for all
  using (penilai_id = auth.uid() and saya_anggota_kelompok(kelompok_id))
  with check (penilai_id = auth.uid() and saya_anggota_kelompok(kelompok_id));

-- ============ Refleksi ============
create table if not exists refleksi (
  id uuid primary key default gen_random_uuid(),
  penugasan_id uuid not null references penugasan(id) on delete cascade,
  sprint_id uuid not null references sprint(id) on delete cascade,
  murid_id uuid not null references profil(id) on delete cascade,
  jawaban jsonb not null default '{}'::jsonb,
  diubah_pada timestamptz not null default now(),
  unique (penugasan_id, sprint_id, murid_id)
);

alter table refleksi enable row level security;

drop policy if exists refleksi_baca on refleksi;
create policy refleksi_baca on refleksi for select
  using (murid_id = auth.uid() or saya_guru_penugasan(penugasan_id) or saya_admin());

drop policy if exists refleksi_tulis_sendiri on refleksi;
create policy refleksi_tulis_sendiri on refleksi for all
  using (murid_id = auth.uid()) with check (murid_id = auth.uid());

-- ============ Observasi Sikap (guru → murid) ============
create table if not exists observasi_sikap (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references kelas(id) on delete cascade,
  murid_id uuid not null references profil(id) on delete cascade,
  sprint_id uuid references sprint(id) on delete set null,
  guru_id uuid not null references profil(id),
  skor jsonb not null default '{}'::jsonb, -- {"disiplin":4,"kerjasama":5,"tanggung_jawab":4,"inisiatif":3}
  catatan text,
  dibuat_pada timestamptz not null default now()
);

alter table observasi_sikap enable row level security;

drop policy if exists sikap_baca on observasi_sikap;
create policy sikap_baca on observasi_sikap for select
  using (murid_id = auth.uid() or saya_guru_kelas(kelas_id) or saya_admin());

drop policy if exists sikap_tulis_guru on observasi_sikap;
create policy sikap_tulis_guru on observasi_sikap for all
  using (saya_guru_kelas(kelas_id) or saya_admin())
  with check (saya_guru_kelas(kelas_id) or saya_admin());

-- ============ Pemberian badge: otomatis + manual ============
create or replace function cek_badge_otomatis(p_murid_id uuid, p_tujuan_pembelajaran_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_badge record;
  v_jenis text;
  v_ambang numeric;
  v_hitung numeric;
  v_sudah_punya boolean;
begin
  for v_badge in
    select * from badge where tujuan_pembelajaran_id = p_tujuan_pembelajaran_id and lingkup = 'individu'
  loop
    select exists (select 1 from perolehan_badge where murid_id = p_murid_id and badge_id = v_badge.id)
      into v_sudah_punya;
    if v_sudah_punya then continue; end if;

    v_jenis := v_badge.syarat->>'jenis';
    v_ambang := (v_badge.syarat->>'nilai')::numeric;
    if v_jenis is null or v_ambang is null then continue; end if; -- badge manual-only

    if v_jenis = 'jumlah_misi_selesai' then
      select count(*) into v_hitung
        from progres_tugas pt
        join penugasan p on p.id = pt.penugasan_id
        where pt.murid_id = p_murid_id and pt.status = 'selesai'
          and p.tujuan_pembelajaran_id = p_tujuan_pembelajaran_id;
    elsif v_jenis = 'nilai_rata_rata_min' then
      select avg(pt.nilai_angka) into v_hitung
        from progres_tugas pt
        join penugasan p on p.id = pt.penugasan_id
        where pt.murid_id = p_murid_id and pt.status = 'selesai' and pt.nilai_angka is not null
          and p.tujuan_pembelajaran_id = p_tujuan_pembelajaran_id;
    else
      continue;
    end if;

    if v_hitung is not null and v_hitung >= v_ambang then
      insert into perolehan_badge (murid_id, badge_id) values (p_murid_id, v_badge.id)
        on conflict do nothing;
      insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
        values (p_murid_id, v_badge.xp, 'badge', v_badge.id, 'Lencana: ' || v_badge.nama);
      update statistik_murid set
        total_xp = total_xp + v_badge.xp, jumlah_badge = jumlah_badge + 1, diperbarui_pada = now()
        where murid_id = p_murid_id;
    end if;
  end loop;
end;
$$;

-- Guru memberi badge manual (badge lingkup individu ATAU kelompok).
create or replace function beri_badge_manual(p_badge_id uuid, p_murid_id uuid default null, p_kelompok_id uuid default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_badge badge;
  v_anggota record;
begin
  select * into v_badge from badge where id = p_badge_id;
  if v_badge.id is null then raise exception 'Lencana tidak ditemukan.'; end if;

  if not (saya_guru() or saya_admin()) then
    raise exception 'Hanya guru/admin yang bisa memberi lencana.';
  end if;

  if p_murid_id is not null then
    insert into perolehan_badge (murid_id, badge_id) values (p_murid_id, p_badge_id) on conflict do nothing;
    insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
      values (p_murid_id, v_badge.xp, 'badge', v_badge.id, 'Lencana (manual): ' || v_badge.nama);
    update statistik_murid set total_xp = total_xp + v_badge.xp, jumlah_badge = jumlah_badge + 1, diperbarui_pada = now()
      where murid_id = p_murid_id;
  elsif p_kelompok_id is not null then
    for v_anggota in select murid_id from anggota_kelompok where kelompok_id = p_kelompok_id loop
      insert into perolehan_badge (murid_id, kelompok_id, badge_id) values (v_anggota.murid_id, p_kelompok_id, p_badge_id) on conflict do nothing;
      insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
        values (v_anggota.murid_id, v_badge.xp, 'badge', v_badge.id, 'Lencana kelompok (manual): ' || v_badge.nama);
      update statistik_murid set total_xp = total_xp + v_badge.xp, jumlah_badge = jumlah_badge + 1, diperbarui_pada = now()
        where murid_id = v_anggota.murid_id;
    end loop;
  else
    raise exception 'Tentukan murid atau kelompok penerima.';
  end if;
end;
$$;

grant execute on function cek_badge_otomatis(uuid, uuid) to authenticated;
grant execute on function beri_badge_manual(uuid, uuid, uuid) to authenticated;

-- ============ Perluas nilai_tugas(): simpan nilai_angka + cek badge otomatis ============
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

  select * into v_tugas from tugas where id = v_progres.tugas_id;

  if v_progres.murid_id is not null then
    select exists (
      select 1 from kelonggaran_sprint ks
      where ks.penugasan_id = v_progres.penugasan_id and ks.sprint_id = v_tugas.sprint_id
        and ks.murid_id = v_progres.murid_id and ks.susulan = true
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
    xp_diberikan = v_xp_dasar
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
