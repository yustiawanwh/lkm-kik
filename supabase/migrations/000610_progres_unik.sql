-- 000610_progres_unik.sql
-- Cegah baris progres_tugas ganda untuk kombinasi yang sama (murid atau
-- kelompok) pada satu penugasan+tugas. Dipakai papan misi Fase 3 untuk
-- "ambil-atau-buat" progres secara aman.

create unique index if not exists progres_tugas_unik_murid
  on progres_tugas (penugasan_id, tugas_id, murid_id)
  where murid_id is not null;

create unique index if not exists progres_tugas_unik_kelompok
  on progres_tugas (penugasan_id, tugas_id, kelompok_id)
  where kelompok_id is not null;

create index if not exists progres_tugas_idx_penugasan on progres_tugas (penugasan_id);
create index if not exists anggota_kelompok_idx_murid on anggota_kelompok (murid_id);
