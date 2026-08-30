-- 000810_susulan.sql
-- Kelonggaran per murid per sprint (susulan): guru bisa memberi perpanjangan
-- tenggat untuk murid tertentu. Penalti nilai akan dihitung di Fase 5
-- (Penilaian) saat logika nilai dibangun — tabel ini baru menyimpan
-- keputusan kelonggarannya.

create table if not exists kelonggaran_sprint (
  id uuid primary key default gen_random_uuid(),
  penugasan_id uuid not null references penugasan(id) on delete cascade,
  sprint_id uuid not null references sprint(id) on delete cascade,
  murid_id uuid not null references profil(id) on delete cascade,
  tenggat_khusus timestamptz not null,
  susulan boolean not null default true, -- true = kena penalti_susulan saat dinilai
  diberikan_oleh uuid references profil(id),
  dibuat_pada timestamptz not null default now(),
  unique (penugasan_id, sprint_id, murid_id)
);

alter table kelonggaran_sprint enable row level security;

drop policy if exists kelonggaran_baca on kelonggaran_sprint;
create policy kelonggaran_baca on kelonggaran_sprint for select
  using (murid_id = auth.uid() or saya_guru_penugasan(penugasan_id) or saya_admin());

drop policy if exists kelonggaran_tulis_guru on kelonggaran_sprint;
create policy kelonggaran_tulis_guru on kelonggaran_sprint for all
  using (saya_guru_penugasan(penugasan_id) or saya_admin())
  with check (saya_guru_penugasan(penugasan_id) or saya_admin());
