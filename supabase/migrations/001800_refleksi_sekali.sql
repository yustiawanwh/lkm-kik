-- 001800_refleksi_sekali.sql
-- Refleksi kini SEKALI PER PROGRAM secara bawaan, dengan pilihan per tahap.
--
-- Latar: refleksi dulu selalu per tahap, sehingga murid melihat pertanyaan
-- yang persis sama berulang kali dalam satu TP. LKPD sendiri menempatkan
-- refleksi sekali di akhir (TP 11.2 Bagian G, TP 11.1 Bagian H) dengan
-- pertanyaan yang retrospektif atas keseluruhan proses, dan rubriknya hanya
-- menilai kedalaman refleksi satu kali. Pengulangan justru mendorong murid
-- menyalin jawabannya sendiri.
--
-- Mode per tahap tetap tersedia bagi program yang tiap tahapnya memang
-- punya pelajaran berbeda.

alter table tujuan_pembelajaran
  add column if not exists refleksi_per_tahap boolean not null default false;

comment on column tujuan_pembelajaran.refleksi_per_tahap is
  'false (bawaan) = satu refleksi untuk seluruh program; true = refleksi terpisah tiap tahap.';

-- sprint_id boleh kosong: baris dengan sprint_id NULL adalah refleksi
-- tingkat program.
alter table refleksi alter column sprint_id drop not null;

-- Batasan unik lama mensyaratkan sprint_id terisi. Diganti dua indeks
-- parsial: satu untuk refleksi per tahap, satu untuk refleksi program.
alter table refleksi drop constraint if exists refleksi_penugasan_id_sprint_id_murid_id_key;

create unique index if not exists refleksi_unik_tahap
  on refleksi (penugasan_id, sprint_id, murid_id)
  where sprint_id is not null;

create unique index if not exists refleksi_unik_program
  on refleksi (penugasan_id, murid_id)
  where sprint_id is null;
