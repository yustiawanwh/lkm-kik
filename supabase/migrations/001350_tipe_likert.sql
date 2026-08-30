-- 001350_tipe_likert.sql
-- Menambah nilai 'likert' ke enum tipe_lembar.
--
-- WAJIB DIJALANKAN SENDIRI, TERPISAH dari migrasi lain.
-- Alasannya: PostgreSQL melarang ALTER TYPE ... ADD VALUE dijalankan di
-- dalam blok transaksi (termasuk di dalam blok "do $$ ... $$"). Kalau
-- digabung, perintah ini gagal — dan bila kegagalannya tertangkap penangkap
-- exception, kegagalan itu tidak terlihat sama sekali sementara migrasi
-- berikutnya ikut batal.
--
-- Cara menjalankan: buka SQL Editor Supabase, tempel HANYA baris di bawah
-- ini, klik Run. Setelah sukses, barulah jalankan 001400_likert_rubrik.sql.

alter type tipe_lembar add value if not exists 'likert';
