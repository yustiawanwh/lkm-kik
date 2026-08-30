-- 001900_nilai_ranah.sql
-- Pengaturan penilaian tiga ranah (kognitif, psikomotor, afektif).
--
-- Tidak ada perubahan skema: bahannya sudah tersimpan sejak Fase 5–6 —
-- rincian skor tiap kriteria ada di progres_tugas.nilai_rubrik, definisi
-- rubriknya di tujuan_pembelajaran.rubrik, dan observasi sikap di tabel
-- observasi_sikap. Yang kurang selama ini hanya pemetaan kriteria ke ranah
-- dan perhitungannya.
--
-- sumber_afektif:
--   'gabungan' (bawaan) — pakai rubrik dan observasi sikap; bila hanya satu
--                          yang terisi, pakai yang ada; bila keduanya ada,
--                          dirata-rata.
--   'rubrik'            — hanya kriteria rubrik bertanda afektif.
--   'sikap'             — hanya observasi sikap guru.
insert into pengaturan (kunci, nilai) values
  ('ranah', '{
     "tampilkan": true,
     "sumber_afektif": "gabungan",
     "pakai_bobot": false,
     "bobot": {"kognitif": 50, "psikomotor": 25, "afektif": 25}
   }'::jsonb)
on conflict (kunci) do nothing;

-- Pengaturan 'bobot_nilai' (Review/Badge/Kecepatan) dari migrasi 000800
-- TIDAK PERNAH dipakai menghitung apa pun. Dibiarkan ada agar tidak memutus
-- data yang mungkin sudah diubah admin, tetapi kartunya dihapus dari
-- halaman Pengaturan supaya tidak lagi memberi kesan berpengaruh.
comment on table pengaturan is
  'Pengaturan global. Catatan: kunci "bobot_nilai" adalah sisa rancangan lama dan tidak dipakai perhitungan mana pun.';
