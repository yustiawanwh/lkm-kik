-- 000210_data_awal.sql
-- Data awal: mata pelajaran KIK + tahun ajaran aktif, supaya guru bisa
-- langsung membuat Program Inkubasi tanpa menunggu admin mengisi data
-- master lebih dulu. Idempoten (aman dijalankan ulang).

insert into mata_pelajaran (kode, nama, konsentrasi, fase)
select 'KIK', 'Kreativitas, Inovasi, dan Kewirausahaan', null, 'F'
where not exists (select 1 from mata_pelajaran where kode = 'KIK');

insert into tahun_ajaran (nama, mulai, selesai, aktif)
select
  extract(year from current_date)::text || '/' || (extract(year from current_date) + 1)::text,
  make_date(extract(year from current_date)::int, 7, 1),
  make_date(extract(year from current_date)::int + 1, 6, 30),
  true
where not exists (select 1 from tahun_ajaran where aktif = true);
