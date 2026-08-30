-- 000500_rls.sql
-- Fungsi bantu RLS (SECURITY DEFINER) + kebijakan dasar bagian 4.
-- Kolaborasi kelompok, gerbang waktu, dsb ditambahkan di migrasi lanjutan
-- (002100+), tetapi pola dasarnya diletakkan di sini.

-- ============ FUNGSI BANTU ============
create or replace function peran_saya()
returns peran_pengguna
language sql stable security definer set search_path = public
as $$
  select peran from profil where id = auth.uid();
$$;

create or replace function saya_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select peran_saya() = 'admin'; $$;

create or replace function saya_guru()
returns boolean language sql stable security definer set search_path = public
as $$ select peran_saya() = 'guru'; $$;

create or replace function saya_guru_kelas(p_kelas uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from kelas where id = p_kelas and guru_id = auth.uid());
$$;

create or replace function saya_guru_penugasan(p_penugasan uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from penugasan p join kelas k on k.id = p.kelas_id
    where p.id = p_penugasan and k.guru_id = auth.uid()
  );
$$;

create or replace function saya_murid_penugasan(p_penugasan uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from penugasan p
    join pendaftaran d on d.kelas_id = p.kelas_id
    where p.id = p_penugasan and d.murid_id = auth.uid() and d.aktif
  );
$$;

create or replace function murid_di_kelas_saya(p_murid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from pendaftaran d join kelas k on k.id = d.kelas_id
    where d.murid_id = p_murid and k.guru_id = auth.uid()
  );
$$;

create or replace function teman_sekelas_saya(p_murid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from pendaftaran d1
    join pendaftaran d2 on d1.kelas_id = d2.kelas_id
    where d1.murid_id = auth.uid() and d2.murid_id = p_murid
  );
$$;

-- ============ KEBIJAKAN: PROFIL ============
drop policy if exists profil_baca_sendiri on profil;
create policy profil_baca_sendiri on profil for select
  using (id = auth.uid() or saya_admin() or saya_guru() or teman_sekelas_saya(id));

drop policy if exists profil_ubah_sendiri on profil;
create policy profil_ubah_sendiri on profil for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ============ KEBIJAKAN: KURIKULUM (baca luas, tulis guru/admin) ============
drop policy if exists mp_baca on mata_pelajaran;
create policy mp_baca on mata_pelajaran for select using (true);
drop policy if exists mp_tulis on mata_pelajaran;
create policy mp_tulis on mata_pelajaran for all
  using (saya_admin()) with check (saya_admin());

drop policy if exists ta_baca on tahun_ajaran;
create policy ta_baca on tahun_ajaran for select using (true);
drop policy if exists ta_tulis on tahun_ajaran;
create policy ta_tulis on tahun_ajaran for all
  using (saya_admin()) with check (saya_admin());

drop policy if exists tp_baca on tujuan_pembelajaran;
create policy tp_baca on tujuan_pembelajaran for select using (true);
drop policy if exists tp_tulis on tujuan_pembelajaran;
create policy tp_tulis on tujuan_pembelajaran for all
  using (saya_guru() or saya_admin()) with check (saya_guru() or saya_admin());

drop policy if exists sprint_baca on sprint;
create policy sprint_baca on sprint for select using (true);
drop policy if exists sprint_tulis on sprint;
create policy sprint_tulis on sprint for all
  using (saya_guru() or saya_admin()) with check (saya_guru() or saya_admin());

drop policy if exists tugas_baca on tugas;
create policy tugas_baca on tugas for select using (true);
drop policy if exists tugas_tulis on tugas;
create policy tugas_tulis on tugas for all
  using (saya_guru() or saya_admin()) with check (saya_guru() or saya_admin());

drop policy if exists lembar_baca on lembar_kerja;
create policy lembar_baca on lembar_kerja for select using (true);
drop policy if exists lembar_tulis on lembar_kerja;
create policy lembar_tulis on lembar_kerja for all
  using (saya_guru() or saya_admin()) with check (saya_guru() or saya_admin());

drop policy if exists kktp_baca on kktp_indikator;
create policy kktp_baca on kktp_indikator for select using (true);
drop policy if exists kktp_tulis on kktp_indikator;
create policy kktp_tulis on kktp_indikator for all
  using (saya_guru() or saya_admin()) with check (saya_guru() or saya_admin());

drop policy if exists badge_baca on badge;
create policy badge_baca on badge for select using (true);
drop policy if exists badge_tulis on badge;
create policy badge_tulis on badge for all
  using (saya_guru() or saya_admin()) with check (saya_guru() or saya_admin());

-- ============ KEBIJAKAN: KELAS & PENDAFTARAN ============
drop policy if exists kelas_baca on kelas;
create policy kelas_baca on kelas for select
  using (guru_id = auth.uid() or saya_admin() or
         exists (select 1 from pendaftaran d where d.kelas_id = kelas.id and d.murid_id = auth.uid()));
drop policy if exists kelas_tulis_guru on kelas;
create policy kelas_tulis_guru on kelas for all
  using (guru_id = auth.uid() or saya_admin())
  with check (guru_id = auth.uid() or saya_admin());

drop policy if exists pendaftaran_baca on pendaftaran;
create policy pendaftaran_baca on pendaftaran for select
  using (murid_id = auth.uid() or saya_guru_kelas(kelas_id) or saya_admin());
drop policy if exists pendaftaran_tulis_guru on pendaftaran;
create policy pendaftaran_tulis_guru on pendaftaran for all
  using (saya_guru_kelas(kelas_id) or saya_admin())
  with check (saya_guru_kelas(kelas_id) or saya_admin());

-- ============ KEBIJAKAN: PENUGASAN ============
drop policy if exists penugasan_baca on penugasan;
create policy penugasan_baca on penugasan for select
  using (saya_guru_kelas(kelas_id) or saya_admin() or
         exists (select 1 from pendaftaran d where d.kelas_id = penugasan.kelas_id and d.murid_id = auth.uid()));
drop policy if exists penugasan_tulis_guru on penugasan;
create policy penugasan_tulis_guru on penugasan for all
  using (saya_guru_kelas(kelas_id) or saya_admin())
  with check (saya_guru_kelas(kelas_id) or saya_admin());

-- ============ KEBIJAKAN: PROGRES_TUGAS (murid mandiri) ============
-- Catatan penting (bagian 4.3 & 15 PRD): saat migrasi lanjutan menambah
-- kunci tahap / jalur kelompok, MODIFIKASI kedua policy tulis murid di
-- bawah ini (progres_buat_murid, progres_ubah_murid) — JANGAN membuat
-- policy FOR ALL baru yang bisa bentrok, dan JANGAN hapus syarat "not terkunci".

drop policy if exists progres_baca on progres_tugas;
create policy progres_baca on progres_tugas for select
  using (murid_id = auth.uid() or saya_guru_penugasan(penugasan_id) or saya_admin());

drop policy if exists progres_buat_murid on progres_tugas;
create policy progres_buat_murid on progres_tugas for insert
  with check (murid_id = auth.uid() and saya_murid_penugasan(penugasan_id));

drop policy if exists progres_ubah_murid on progres_tugas;
create policy progres_ubah_murid on progres_tugas for update
  using (murid_id = auth.uid() and not terkunci)
  with check (murid_id = auth.uid());

drop policy if exists progres_tulis_guru on progres_tugas;
create policy progres_tulis_guru on progres_tugas for all
  using (saya_guru_penugasan(penugasan_id) or saya_admin())
  with check (saya_guru_penugasan(penugasan_id) or saya_admin());

-- ============ KEBIJAKAN: ISIAN_LEMBAR (murid mandiri) ============
drop policy if exists isian_baca on isian_lembar;
create policy isian_baca on isian_lembar for select
  using (murid_id = auth.uid() or saya_guru_penugasan(penugasan_id) or saya_admin());

drop policy if exists isian_tulis_murid on isian_lembar;
create policy isian_tulis_murid on isian_lembar for all
  using (murid_id = auth.uid() and saya_murid_penugasan(penugasan_id))
  with check (murid_id = auth.uid() and saya_murid_penugasan(penugasan_id));

drop policy if exists isian_tulis_guru on isian_lembar;
create policy isian_tulis_guru on isian_lembar for all
  using (saya_guru_penugasan(penugasan_id) or saya_admin())
  with check (saya_guru_penugasan(penugasan_id) or saya_admin());

-- ============ KEBIJAKAN: LAMPIRAN ============
drop policy if exists lampiran_baca on lampiran;
create policy lampiran_baca on lampiran for select
  using (murid_id = auth.uid() or saya_admin() or
         exists (select 1 from progres_tugas pt where pt.id = lampiran.progres_tugas_id and saya_guru_penugasan(pt.penugasan_id)));
drop policy if exists lampiran_tulis_murid on lampiran;
create policy lampiran_tulis_murid on lampiran for all
  using (murid_id = auth.uid()) with check (murid_id = auth.uid());

-- ============ KEBIJAKAN: GAMIFIKASI (baca sendiri, tulis via trigger/RPC) ============
drop policy if exists badge_diraih_baca on perolehan_badge;
create policy badge_diraih_baca on perolehan_badge for select
  using (murid_id = auth.uid() or saya_admin() or saya_guru());

drop policy if exists xp_baca on buku_xp;
create policy xp_baca on buku_xp for select
  using (murid_id = auth.uid() or saya_admin() or saya_guru());

drop policy if exists statistik_baca on statistik_murid;
create policy statistik_baca on statistik_murid for select
  using (murid_id = auth.uid() or saya_admin() or saya_guru());
