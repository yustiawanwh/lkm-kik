-- 000300_progres.sql
-- kelas, pendaftaran, penugasan, progres_tugas, isian_lembar, lampiran.

create table if not exists kelas (
  id uuid primary key default gen_random_uuid(),
  tahun_ajaran_id uuid references tahun_ajaran(id),
  mata_pelajaran_id uuid references mata_pelajaran(id),
  guru_id uuid not null references profil(id),
  nama text not null,
  kode_gabung text unique,
  terbuka boolean not null default true,
  dibuat_pada timestamptz not null default now()
);

create table if not exists pendaftaran (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references kelas(id) on delete cascade,
  murid_id uuid not null references profil(id) on delete cascade,
  tim text, -- DIPENSIUNKAN: keanggotaan tim pindah ke kelompok/anggota_kelompok (lihat migrasi 002400)
  aktif boolean not null default true,
  bergabung_pada timestamptz not null default now(),
  unique (kelas_id, murid_id)
);

create table if not exists penugasan (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references kelas(id) on delete cascade,
  tujuan_pembelajaran_id uuid not null references tujuan_pembelajaran(id),
  mulai date, -- ditafsirkan 00:00 WIB; null = langsung dapat dikerjakan
  tenggat timestamptz not null,
  tenggat_sprint jsonb default '{}'::jsonb, -- {"sprint_id":"ISO"}
  mode_kelompok text default 'sejak_awal', -- diperluas 003800: 'sejak_awal' | 'di_tengah'
  dibuka boolean not null default true,
  dibuat_pada timestamptz not null default now()
);

create table if not exists progres_tugas (
  id uuid primary key default gen_random_uuid(),
  penugasan_id uuid not null references penugasan(id) on delete cascade,
  murid_id uuid references profil(id), -- misi mandiri: terisi
  kelompok_id uuid, -- FK ditambahkan di migrasi 002400 (kelompok kolaborasi)
  tugas_id uuid not null references tugas(id) on delete cascade,
  status status_tugas not null default 'backlog',
  nilai_huruf text,
  nilai_rubrik jsonb,
  catatan text,
  detik_terpakai int not null default 0,
  dimulai_pada timestamptz,
  diserahkan_pada timestamptz,
  disetujui_pada timestamptz,
  umpan_balik text,
  terkunci boolean not null default false,
  xp_diberikan int not null default 0,
  dibuat_pada timestamptz not null default now()
);

create table if not exists isian_lembar (
  id uuid primary key default gen_random_uuid(),
  penugasan_id uuid not null references penugasan(id) on delete cascade,
  murid_id uuid references profil(id),
  kelompok_id uuid, -- FK ditambahkan di migrasi 002400
  lembar_kerja_id uuid not null references lembar_kerja(id),
  data jsonb not null default '{}'::jsonb,
  versi int not null default 1,
  diubah_oleh uuid references profil(id),
  diubah_pada timestamptz not null default now(),
  dikunci_ketua boolean not null default false,
  constraint satu_pemilik check (
    (murid_id is not null and kelompok_id is null) or
    (murid_id is null and kelompok_id is not null)
  )
);

create table if not exists lampiran (
  id uuid primary key default gen_random_uuid(),
  murid_id uuid references profil(id),
  kelompok_id uuid, -- FK ditambahkan di migrasi 002400
  progres_tugas_id uuid references progres_tugas(id) on delete cascade,
  nama_asli text,
  path text not null,
  mime text,
  ukuran int,
  sidik text, -- perceptual hash, ditambahkan penuh di migrasi 001700
  dibuat_pada timestamptz not null default now()
);

alter table kelas enable row level security;
alter table pendaftaran enable row level security;
alter table penugasan enable row level security;
alter table progres_tugas enable row level security;
alter table isian_lembar enable row level security;
alter table lampiran enable row level security;
