-- 001100_kendali_murid.sql
-- Fase 8 — Pengawasan real-time: kolom kendali pada pendaftaran (murid per
-- kelas), guru bisa Aktifkan/Jeda/Kunci akses murid secara langsung.
-- Kebijakan RLS TIDAK perlu ditambah — pendaftaran_baca (000500) sudah
-- mengizinkan murid membaca baris pendaftaran miliknya sendiri, dan
-- pendaftaran_tulis_guru sudah mengizinkan guru mengubahnya (termasuk kolom
-- baru ini). Realtime memakai tabel yang SUDAH diaktifkan sejak Fase 3
-- (lihat PANDUAN_SETUP_SUPABASE.md bagian 4).

alter table pendaftaran add column if not exists kendali kendali_murid not null default 'aktif';
