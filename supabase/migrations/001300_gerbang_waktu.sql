-- 001300_gerbang_waktu.sql
-- Penegakan TENGGAT (prinsip P6 di PRD: gerbang waktu WIB). Sebelum ini
-- tenggat hanya ditampilkan sebagai teks — murid tetap bisa mengerjakan
-- setelah lewat tenggat, dan penugasan yang "ditutup" pun masih bisa ditulis
-- lewat pemanggilan API langsung.
--
-- Urutan tenggat yang berlaku untuk seorang murid pada satu tahap:
--   1. kelonggaran_sprint.tenggat_khusus (kalau ada) — paling diutamakan
--   2. penugasan.tenggat_sprint->>sprint_id (kalau guru mengatur per tahap)
--   3. penugasan.tenggat (tenggat umum penugasan)
--
-- Guru & admin TIDAK dibatasi (mereka masih perlu menilai setelah tenggat).

create or replace function tenggat_berlaku(p_penugasan_id uuid, p_sprint_id uuid, p_murid_id uuid)
returns timestamptz
language plpgsql stable security definer set search_path = public
as $$
declare
  v_penugasan penugasan;
  v_khusus timestamptz;
  v_per_sprint text;
begin
  select tenggat_khusus into v_khusus from kelonggaran_sprint
    where penugasan_id = p_penugasan_id and sprint_id = p_sprint_id and murid_id = p_murid_id;
  if v_khusus is not null then return v_khusus; end if;

  select * into v_penugasan from penugasan where id = p_penugasan_id;
  if v_penugasan.id is null then return null; end if;

  v_per_sprint := v_penugasan.tenggat_sprint->>p_sprint_id::text;
  if v_per_sprint is not null then return v_per_sprint::timestamptz; end if;

  return v_penugasan.tenggat;
end;
$$;

/* Apakah murid ini masih boleh mengerjakan tugas pada tahap tsb? */
create or replace function boleh_kerjakan(p_penugasan_id uuid, p_sprint_id uuid, p_murid_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_penugasan penugasan;
  v_tenggat timestamptz;
begin
  select * into v_penugasan from penugasan where id = p_penugasan_id;
  if v_penugasan.id is null then return false; end if;

  -- Penugasan ditutup guru → tidak bisa dikerjakan sama sekali.
  if not v_penugasan.dibuka then return false; end if;

  -- Belum waktunya mulai (mulai ditafsirkan 00:00 WIB).
  if v_penugasan.mulai is not null
     and now() < (v_penugasan.mulai::timestamp at time zone 'Asia/Jakarta') then
    return false;
  end if;

  v_tenggat := tenggat_berlaku(p_penugasan_id, p_sprint_id, p_murid_id);
  if v_tenggat is not null and now() > v_tenggat then return false; end if;

  return true;
end;
$$;

grant execute on function tenggat_berlaku(uuid, uuid, uuid) to authenticated;
grant execute on function boleh_kerjakan(uuid, uuid, uuid) to authenticated;

-- ============ Tegakkan pada progres_tugas ============
create or replace function jaga_gerbang_progres()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_sprint_id uuid;
  v_murid uuid;
  v_boleh boolean;
begin
  -- Guru/admin bebas (perlu menilai setelah tenggat).
  if saya_guru_penugasan(new.penugasan_id) or saya_admin() then
    return new;
  end if;

  select sprint_id into v_sprint_id from tugas where id = new.tugas_id;
  v_murid := coalesce(new.murid_id, auth.uid());

  select boleh_kerjakan(new.penugasan_id, v_sprint_id, v_murid) into v_boleh;
  if not v_boleh then
    raise exception 'Tenggat untuk tahap ini sudah lewat atau penugasan belum/tidak dibuka. Hubungi guru Anda bila perlu susulan.';
  end if;
  return new;
end;
$$;

drop trigger if exists sebelum_progres_masuk on progres_tugas;
create trigger sebelum_progres_masuk
  before insert on progres_tugas
  for each row execute function jaga_gerbang_progres();

drop trigger if exists sebelum_progres_gerbang on progres_tugas;
create trigger sebelum_progres_gerbang
  before update on progres_tugas
  for each row execute function jaga_gerbang_progres();

-- ============ Tegakkan pada isian_lembar ============
-- Lembar kerja bisa terkait sprint tertentu (lembar_kerja.sprint_id). Kalau
-- lembar tidak terikat sprint, tenggat umum penugasan yang dipakai.
create or replace function jaga_gerbang_isian()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_sprint_id uuid;
  v_murid uuid;
  v_boleh boolean;
begin
  if saya_guru_penugasan(new.penugasan_id) or saya_admin() then
    return new;
  end if;

  select sprint_id into v_sprint_id from lembar_kerja where id = new.lembar_kerja_id;
  v_murid := coalesce(new.murid_id, auth.uid());

  select boleh_kerjakan(new.penugasan_id, v_sprint_id, v_murid) into v_boleh;
  if not v_boleh then
    raise exception 'Tenggat sudah lewat atau penugasan belum/tidak dibuka — lembar ini tidak bisa diubah lagi.';
  end if;
  return new;
end;
$$;

drop trigger if exists sebelum_isian_masuk on isian_lembar;
create trigger sebelum_isian_masuk
  before insert on isian_lembar
  for each row execute function jaga_gerbang_isian();

drop trigger if exists sebelum_isian_gerbang on isian_lembar;
create trigger sebelum_isian_gerbang
  before update on isian_lembar
  for each row execute function jaga_gerbang_isian();

-- ============ Kesepakatan: cegah menyetujui atas nama anggota lain ============
-- Sebelumnya UI mencegah, tapi RLS tidak — sesama anggota kelompok bisa
-- menulis seluruh objek data isian_lembar, termasuk blok "persetujuan"
-- milik orang lain. Trigger ini memaksa blok persetujuan anggota LAIN tetap
-- seperti semula; hanya milik diri sendiri yang boleh berubah.
create or replace function jaga_persetujuan_kesepakatan()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_tipe tipe_lembar;
  v_lama jsonb;
  v_baru jsonb;
  v_kunci text;
  v_hasil jsonb;
begin
  select tipe into v_tipe from lembar_kerja where id = new.lembar_kerja_id;
  if v_tipe is distinct from 'kesepakatan' then return new; end if;
  if saya_guru_penugasan(new.penugasan_id) or saya_admin() then return new; end if;

  v_lama := coalesce(old.data->'persetujuan', '{}'::jsonb);
  v_baru := coalesce(new.data->'persetujuan', '{}'::jsonb);
  v_hasil := v_lama;

  -- Ambil HANYA persetujuan milik pengguna yang sedang menulis.
  v_kunci := auth.uid()::text;
  if v_baru ? v_kunci then
    v_hasil := jsonb_set(v_hasil, array[v_kunci], v_baru->v_kunci, true);
  end if;

  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{persetujuan}', v_hasil, true);
  return new;
end;
$$;

drop trigger if exists sebelum_kesepakatan_diubah on isian_lembar;
create trigger sebelum_kesepakatan_diubah
  before update on isian_lembar
  for each row execute function jaga_persetujuan_kesepakatan();
