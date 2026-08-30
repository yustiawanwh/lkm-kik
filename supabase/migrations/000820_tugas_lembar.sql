-- 000820_tugas_lembar.sql
-- Kolom lembar_kode pada tugas: kode lembar_kerja yang tertaut ke misi ini
-- (boleh lebih dari satu, dipisah koma, mis. "C1,C2"), supaya lembar kerja
-- bisa ditampilkan LANGSUNG di dalam dialog misi (bukan halaman terpisah)
-- dan dikunci mengikuti status timer misi tersebut.

alter table tugas add column if not exists lembar_kode text;

comment on column tugas.lembar_kode is
  'Kode lembar_kerja yang tertaut ke misi ini, dipisah koma (mis. "C1,C2"). Cocokkan case-insensitive terhadap lembar_kerja.kode dalam tujuan_pembelajaran yang sama.';
