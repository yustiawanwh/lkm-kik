-- 000800_pengaturan.sql
-- Tabel pengaturan global (key-value jsonb), dipakai admin untuk mengatur
-- bobot nilai, KKM, penalti susulan, durasi target kecepatan, dan sakelar
-- anti salin-tempel. Nilai penilaian belum dipakai perhitungan (menyusul
-- Fase 5) tapi disimpan sekarang supaya bentuknya siap.

create table if not exists pengaturan (
  kunci text primary key,
  nilai jsonb not null,
  diubah_pada timestamptz not null default now()
);

insert into pengaturan (kunci, nilai) values
  ('bobot_nilai', '{"review": 65, "badge": 20, "kecepatan": 15, "porsi_tantangan": 10}'::jsonb),
  ('ambang', '{"kkm": 75, "hijau": 85}'::jsonb),
  ('susulan', '{"penalti": 10}'::jsonb),
  ('kecepatan', '{"durasi_target_jam": 24}'::jsonb),
  ('anti_salin', '{"aktif": false}'::jsonb)
on conflict (kunci) do nothing;

alter table pengaturan enable row level security;

drop policy if exists pengaturan_baca on pengaturan;
create policy pengaturan_baca on pengaturan for select using (true);

drop policy if exists pengaturan_tulis_admin on pengaturan;
create policy pengaturan_tulis_admin on pengaturan for all
  using (saya_admin()) with check (saya_admin());
