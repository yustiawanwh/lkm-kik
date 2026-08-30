-- 000200_kurikulum.sql
-- mata_pelajaran, tujuan_pembelajaran (Program Inkubasi), sprint (Tahap Inkubasi),
-- tugas (Misi), lembar_kerja, kktp_indikator, badge.

create table if not exists mata_pelajaran (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  nama text not null,
  konsentrasi text,
  fase text,
  dibuat_pada timestamptz not null default now()
);

create table if not exists tahun_ajaran (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  mulai date not null,
  selesai date not null,
  aktif boolean not null default false
);

create table if not exists tujuan_pembelajaran (
  id uuid primary key default gen_random_uuid(),
  mata_pelajaran_id uuid not null references mata_pelajaran(id) on delete cascade,
  kode text not null,
  judul text not null,
  deskripsi text,
  petunjuk_umum text,
  materi_awal text,
  sifat_pengerjaan text,
  total_jp int,
  terbit boolean not null default false,
  urutan int not null default 0,
  dpl int[] default '{}',
  dibuat_pada timestamptz not null default now()
);

create table if not exists sprint (
  id uuid primary key default gen_random_uuid(),
  tujuan_pembelajaran_id uuid not null references tujuan_pembelajaran(id) on delete cascade,
  nomor int not null,
  nama text not null,
  hari text,
  jp int,
  durasi_menit int,
  menit_inti int,
  tujuan text,
  kktp_terkait text,
  unique (tujuan_pembelajaran_id, nomor)
);

create table if not exists tugas (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references sprint(id) on delete cascade,
  kode text not null,
  judul text not null,
  deskripsi text,
  bukti_diminta text,
  jenis jenis_tugas not null default 'inti',
  sifat_kerja sifat_kerja not null default 'mandiri',
  level int default 1,
  estimasi_menit int,
  xp int not null default 10,
  wajib_bukti boolean not null default false,
  izin_tautan boolean not null default false,
  lembar_kode text,
  urutan int not null default 0,
  unique (sprint_id, kode)
);

create table if not exists lembar_kerja (
  id uuid primary key default gen_random_uuid(),
  tujuan_pembelajaran_id uuid references tujuan_pembelajaran(id) on delete cascade,
  sprint_id uuid references sprint(id) on delete cascade,
  kode text not null,
  judul text not null,
  keterangan text,
  tipe tipe_lembar not null,
  struktur jsonb not null default '{}'::jsonb,
  baris_dinamis boolean not null default false,
  milik_kelompok boolean not null default false,
  kunci_skor jsonb,
  perlu_persetujuan boolean not null default false,
  sumber_lembar_kode text,
  urutan int not null default 0,
  unique (tujuan_pembelajaran_id, kode)
);

create table if not exists kktp_indikator (
  id uuid primary key default gen_random_uuid(),
  tujuan_pembelajaran_id uuid not null references tujuan_pembelajaran(id) on delete cascade,
  nomor int not null,
  indikator text not null
);

create table if not exists badge (
  id uuid primary key default gen_random_uuid(),
  tujuan_pembelajaran_id uuid references tujuan_pembelajaran(id) on delete cascade,
  kode text not null,
  nama text not null,
  emoji text,
  deskripsi text,
  xp int not null default 0,
  syarat jsonb default '{}'::jsonb,
  lingkup text not null default 'individu' check (lingkup in ('individu','kelompok'))
);

alter table mata_pelajaran enable row level security;
alter table tahun_ajaran enable row level security;
alter table tujuan_pembelajaran enable row level security;
alter table sprint enable row level security;
alter table tugas enable row level security;
alter table lembar_kerja enable row level security;
alter table kktp_indikator enable row level security;
alter table badge enable row level security;
