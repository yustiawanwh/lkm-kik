-- 000600_kelompok.sql
-- Tabel kelompok (kelas dibagi jadi kelompok kerja) + anggota_kelompok, dan
-- pemasangan FK kelompok_id yang sebelumnya "dilepas" (tanpa FK) di migrasi
-- 000300 & 000400 karena tabel kelompok belum ada.

create table if not exists kelompok (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references kelas(id) on delete cascade,
  nama text not null,
  dibuat_pada timestamptz not null default now()
);

do $$ begin
  create type peran_anggota as enum ('ketua', 'anggota');
exception when duplicate_object then null; end $$;

create table if not exists anggota_kelompok (
  id uuid primary key default gen_random_uuid(),
  kelompok_id uuid not null references kelompok(id) on delete cascade,
  murid_id uuid not null references profil(id) on delete cascade,
  peran_dalam_kelompok peran_anggota not null default 'anggota',
  bergabung_pada timestamptz not null default now(),
  unique (kelompok_id, murid_id)
);

-- Satu murid hanya boleh berada di satu kelompok per kelas (dicek via
-- trigger, karena constraint unik lintas tabel tidak bisa langsung dengan FK).
create or replace function cegah_kelompok_ganda()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_kelas_id uuid;
  v_sudah_ada int;
begin
  select kelas_id into v_kelas_id from kelompok where id = new.kelompok_id;
  select count(*) into v_sudah_ada
    from anggota_kelompok ak join kelompok k on k.id = ak.kelompok_id
    where k.kelas_id = v_kelas_id and ak.murid_id = new.murid_id and ak.kelompok_id <> new.kelompok_id;
  if v_sudah_ada > 0 then
    raise exception 'Murid ini sudah tergabung di kelompok lain pada kelas yang sama.';
  end if;
  return new;
end;
$$;

drop trigger if exists sebelum_anggota_kelompok_masuk on anggota_kelompok;
create trigger sebelum_anggota_kelompok_masuk
  before insert on anggota_kelompok
  for each row execute function cegah_kelompok_ganda();

-- ============ Pasang FK yang sebelumnya dilepas ============
alter table progres_tugas
  drop constraint if exists progres_tugas_kelompok_id_fkey,
  add constraint progres_tugas_kelompok_id_fkey
    foreign key (kelompok_id) references kelompok(id) on delete cascade;

alter table isian_lembar
  drop constraint if exists isian_lembar_kelompok_id_fkey,
  add constraint isian_lembar_kelompok_id_fkey
    foreign key (kelompok_id) references kelompok(id) on delete cascade;

alter table lampiran
  drop constraint if exists lampiran_kelompok_id_fkey,
  add constraint lampiran_kelompok_id_fkey
    foreign key (kelompok_id) references kelompok(id) on delete cascade;

alter table perolehan_badge
  drop constraint if exists perolehan_badge_kelompok_id_fkey,
  add constraint perolehan_badge_kelompok_id_fkey
    foreign key (kelompok_id) references kelompok(id) on delete cascade;

alter table kelompok enable row level security;
alter table anggota_kelompok enable row level security;

-- ============ Fungsi bantu RLS baru ============
create or replace function saya_guru_kelompok(p_kelompok uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from kelompok k join kelas ke on ke.id = k.kelas_id
    where k.id = p_kelompok and ke.guru_id = auth.uid()
  );
$$;

create or replace function saya_anggota_kelompok(p_kelompok uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from anggota_kelompok where kelompok_id = p_kelompok and murid_id = auth.uid()
  );
$$;

-- ============ Kebijakan: KELOMPOK ============
drop policy if exists kelompok_baca on kelompok;
create policy kelompok_baca on kelompok for select
  using (saya_guru_kelas(kelas_id) or saya_admin() or
         exists (select 1 from pendaftaran d where d.kelas_id = kelompok.kelas_id and d.murid_id = auth.uid()));

drop policy if exists kelompok_tulis_guru on kelompok;
create policy kelompok_tulis_guru on kelompok for all
  using (saya_guru_kelas(kelas_id) or saya_admin())
  with check (saya_guru_kelas(kelas_id) or saya_admin());

-- ============ Kebijakan: ANGGOTA_KELOMPOK ============
drop policy if exists anggota_baca on anggota_kelompok;
create policy anggota_baca on anggota_kelompok for select
  using (murid_id = auth.uid() or saya_guru_kelompok(kelompok_id) or saya_admin() or saya_anggota_kelompok(kelompok_id));

drop policy if exists anggota_tulis_guru on anggota_kelompok;
create policy anggota_tulis_guru on anggota_kelompok for all
  using (saya_guru_kelompok(kelompok_id) or saya_admin())
  with check (saya_guru_kelompok(kelompok_id) or saya_admin());

-- ============ Perluas kebijakan PROGRES_TUGAS & ISIAN_LEMBAR untuk misi
-- kelompok. Ini MENAMBAH policy baru (OR dengan yang sudah ada di 000500),
-- BUKAN menggantinya. Lihat catatan di 000500_rls.sql. ============
drop policy if exists progres_buat_kelompok on progres_tugas;
create policy progres_buat_kelompok on progres_tugas for insert
  with check (kelompok_id is not null and saya_anggota_kelompok(kelompok_id) and saya_murid_penugasan(penugasan_id));

drop policy if exists progres_baca_kelompok on progres_tugas;
create policy progres_baca_kelompok on progres_tugas for select
  using (kelompok_id is not null and saya_anggota_kelompok(kelompok_id));

drop policy if exists progres_ubah_kelompok on progres_tugas;
create policy progres_ubah_kelompok on progres_tugas for update
  using (kelompok_id is not null and saya_anggota_kelompok(kelompok_id) and not terkunci)
  with check (kelompok_id is not null and saya_anggota_kelompok(kelompok_id));

drop policy if exists isian_tulis_kelompok on isian_lembar;
create policy isian_tulis_kelompok on isian_lembar for all
  using (kelompok_id is not null and saya_anggota_kelompok(kelompok_id))
  with check (kelompok_id is not null and saya_anggota_kelompok(kelompok_id) and saya_murid_penugasan(penugasan_id));

drop policy if exists lampiran_tulis_kelompok on lampiran;
create policy lampiran_tulis_kelompok on lampiran for all
  using (kelompok_id is not null and saya_anggota_kelompok(kelompok_id))
  with check (kelompok_id is not null and saya_anggota_kelompok(kelompok_id));
