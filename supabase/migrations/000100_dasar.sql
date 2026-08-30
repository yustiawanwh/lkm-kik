-- 000100_dasar.sql
-- Enum dasar, tabel profil, trigger pengguna baru.
-- Idempoten: aman dijalankan ulang.

-- ============ ENUM ============
do $$ begin
  create type peran_pengguna as enum ('murid', 'guru', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type jenis_tugas as enum ('inti', 'tantangan', 'tutor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_tugas as enum ('backlog', 'dikerjakan', 'review', 'selesai');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sumber_xp as enum ('task', 'badge', 'manual', 'kontribusi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sifat_kerja as enum ('mandiri', 'kelompok');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kendali_murid as enum ('aktif', 'dijeda', 'dikunci');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipe_lembar as enum (
    'matriks', 'daftar', 'formulir', 'referensi',
    'kanvas', 'tahapan', 'kalkulator', 'instrumen',
    'kesepakatan', 'sejawat', 'refleksi', 'sikap'
  );
exception when duplicate_object then null; end $$;

-- ============ TABEL PROFIL ============
create table if not exists profil (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  email text,
  peran peran_pengguna not null default 'murid',
  nis text,
  no_absen int,
  avatar text,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now()
);

comment on table profil is 'Profil pengguna, terkait 1:1 dengan auth.users.';

-- ============ TRIGGER PENGGUNA BARU ============
-- KEAMANAN: peran SELALU 'murid' untuk pendaftaran mandiri, tanpa
-- terkecuali. TIDAK dibaca dari raw_user_meta_data yang dikirim klien —
-- kalau dipercaya, siapa pun bisa memanggil auth.signUp langsung dengan
-- {"peran":"guru"} dan mendapat akses guru. Akun guru/admin hanya naik
-- peran lewat SQL manual oleh admin (PANDUAN_SETUP_SUPABASE.md bagian 9).
create or replace function tangani_pengguna_baru()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profil (id, nama, email, peran)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)),
    new.email,
    'murid'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tangani_pengguna_baru();

alter table profil enable row level security;
