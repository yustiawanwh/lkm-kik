-- 000400_gamifikasi.sql
-- perolehan_badge, buku_xp, statistik_murid.

create table if not exists perolehan_badge (
  id uuid primary key default gen_random_uuid(),
  murid_id uuid not null references profil(id) on delete cascade,
  kelompok_id uuid, -- FK ditambahkan 002400; diisi utk badge lingkup kelompok
  badge_id uuid not null references badge(id) on delete cascade,
  penugasan_id uuid references penugasan(id),
  diraih_pada timestamptz not null default now(),
  unique (murid_id, badge_id, penugasan_id)
);

create table if not exists buku_xp (
  id uuid primary key default gen_random_uuid(),
  murid_id uuid not null references profil(id) on delete cascade,
  jumlah int not null, -- boleh negatif (koreksi/penarikan)
  sumber sumber_xp not null,
  referensi uuid, -- id progres_tugas / badge / dsb, longgar (tanpa FK) agar fleksibel antar sumber
  keterangan text,
  dibuat_pada timestamptz not null default now()
);

create table if not exists statistik_murid (
  murid_id uuid primary key references profil(id) on delete cascade,
  total_xp int not null default 0,
  jumlah_badge int not null default 0,
  tugas_selesai int not null default 0,
  skor_kontribusi numeric default 0,
  diperbarui_pada timestamptz not null default now()
);

alter table perolehan_badge enable row level security;
alter table buku_xp enable row level security;
alter table statistik_murid enable row level security;

-- Trigger dasar: jaga statistik_murid tetap ada (baris kosong) saat profil dibuat
create or replace function pastikan_statistik_murid()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.peran = 'murid' then
    insert into public.statistik_murid (murid_id) values (new.id)
    on conflict (murid_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profil_murid_baru on profil;
create trigger on_profil_murid_baru
  after insert on profil
  for each row execute function pastikan_statistik_murid();
