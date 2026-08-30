-- 001600_status_selesai_terkunci.sql
-- Status 'selesai' hanya boleh ditetapkan oleh fungsi penilaian.
--
-- Celah yang ditutup: trigger jaga_kolom_progres (001200) mencegah murid
-- mengubah status DARI 'selesai', tetapi tidak mencegah murid menyetelnya
-- KE 'selesai'. Akibatnya murid bisa menandai misinya sendiri "Selesai";
-- pekerjaan itu lalu hilang dari antrean penilaian guru (yang menyaring
-- status='review') dan muncul di daftar "Sudah Dinilai" tanpa nilai.
--
-- Lewat tampilan lama celah ini tidak terjangkau, tetapi tetap bisa dipakai
-- lewat pemanggilan API langsung — dan menjadi terjangkau begitu papan
-- kanban bisa diseret. Karena itu dikunci di database, bukan di tampilan.

create or replace function jaga_kolom_progres()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_guru boolean;
begin
  v_guru := saya_guru_penugasan(new.penugasan_id) or saya_admin();

  if not v_guru then
    -- Murid TIDAK boleh menyentuh kolom hasil penilaian.
    new.nilai_angka := old.nilai_angka;
    new.nilai_huruf := old.nilai_huruf;
    new.nilai_rubrik := old.nilai_rubrik;
    new.xp_diberikan := old.xp_diberikan;
    new.umpan_balik := old.umpan_balik;
    new.disetujui_pada := old.disetujui_pada;
    new.kena_penalti_susulan := old.kena_penalti_susulan;
    new.terkunci := old.terkunci;
    new.penugasan_id := old.penugasan_id;
    new.tugas_id := old.tugas_id;
    new.murid_id := old.murid_id;
    new.kelompok_id := old.kelompok_id;

    -- Sekali dinilai, murid tidak boleh mengembalikan status.
    if old.status = 'selesai' then
      new.status := old.status;
    end if;

    -- BARU: murid juga tidak boleh MENETAPKAN status 'selesai'.
    -- 'selesai' hanya sah bila ditulis oleh nilai_tugas() milik guru.
    if new.status = 'selesai' and old.status <> 'selesai' then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

-- Berlaku juga untuk baris baru: murid tidak boleh membuat progres yang
-- langsung berstatus 'selesai' atau membawa nilai bawaan.
create or replace function jaga_kolom_progres_masuk()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not (saya_guru_penugasan(new.penugasan_id) or saya_admin()) then
    if new.status = 'selesai' then new.status := 'backlog'; end if;
    new.nilai_angka := null;
    new.nilai_huruf := null;
    new.nilai_rubrik := null;
    new.xp_diberikan := 0;
    new.umpan_balik := null;
    new.disetujui_pada := null;
    new.terkunci := false;
  end if;
  return new;
end;
$$;

drop trigger if exists sebelum_progres_masuk_kolom on progres_tugas;
create trigger sebelum_progres_masuk_kolom
  before insert on progres_tugas
  for each row execute function jaga_kolom_progres_masuk();
