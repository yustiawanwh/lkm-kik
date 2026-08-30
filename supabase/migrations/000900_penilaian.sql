-- 000900_penilaian.sql
-- Fase 5 — Penilaian: tabel faktor kontribusi per anggota kelompok, skala
-- huruf fleksibel (pengaturan), kolom penanda penalti susulan, dan fungsi
-- RPC utama nilai_tugas() yang: menghitung nilai huruf, menerapkan penalti
-- susulan bila relevan, dan memberi XP (sesuai P1 — XP baru diberikan
-- SETELAH dinilai guru).

-- ============ Skala huruf fleksibel (pengaturan) ============
insert into pengaturan (kunci, nilai) values
  ('skala_huruf', '[{"huruf":"A","min":90},{"huruf":"B","min":80},{"huruf":"C","min":70},{"huruf":"D","min":60},{"huruf":"E","min":0}]'::jsonb)
on conflict (kunci) do nothing;

-- ============ Faktor kontribusi individu (misi kelompok) ============
create table if not exists kontribusi_individu (
  id uuid primary key default gen_random_uuid(),
  progres_tugas_id uuid not null references progres_tugas(id) on delete cascade,
  murid_id uuid not null references profil(id) on delete cascade,
  faktor numeric not null default 1.0 check (faktor >= 0 and faktor <= 1.5),
  catatan text,
  diatur_oleh uuid references profil(id),
  diubah_pada timestamptz not null default now(),
  unique (progres_tugas_id, murid_id)
);

alter table kontribusi_individu enable row level security;

drop policy if exists kontribusi_baca on kontribusi_individu;
create policy kontribusi_baca on kontribusi_individu for select
  using (
    murid_id = auth.uid() or saya_admin() or
    exists (select 1 from progres_tugas pt where pt.id = progres_tugas_id and saya_guru_penugasan(pt.penugasan_id))
  );

drop policy if exists kontribusi_tulis_guru on kontribusi_individu;
create policy kontribusi_tulis_guru on kontribusi_individu for all
  using (exists (select 1 from progres_tugas pt where pt.id = progres_tugas_id and saya_guru_penugasan(pt.penugasan_id)) or saya_admin())
  with check (exists (select 1 from progres_tugas pt where pt.id = progres_tugas_id and saya_guru_penugasan(pt.penugasan_id)) or saya_admin());

-- ============ Penanda penalti susulan pada progres_tugas ============
alter table progres_tugas add column if not exists kena_penalti_susulan boolean not null default false;

-- ============ Fungsi bantu: hitung huruf dari nilai numerik ============
create or replace function huruf_dari_nilai(p_nilai numeric)
returns text
language plpgsql stable
as $$
declare
  v_skala jsonb;
  v_item jsonb;
  v_huruf text := 'E';
begin
  select nilai into v_skala from pengaturan where kunci = 'skala_huruf';
  if v_skala is null then return 'E'; end if;
  for v_item in select * from jsonb_array_elements(v_skala) order by (value->>'min')::numeric desc
  loop
    if p_nilai >= (v_item->>'min')::numeric then
      return v_item->>'huruf';
    end if;
  end loop;
  return v_huruf;
end;
$$;

-- ============ RPC utama: nilai_tugas ============
-- SECURITY DEFINER: perlu menulis ke buku_xp & statistik_murid yang murid
-- sendiri tidak boleh tulis, dan guru pun sengaja tidak diberi izin RLS
-- langsung ke sana (XP HARUS lewat jalur penilaian ini, P1 di PRD).
create or replace function nilai_tugas(p_progres_id uuid, p_nilai numeric, p_umpan_balik text default null)
returns progres_tugas
language plpgsql
security definer set search_path = public
as $$
declare
  v_progres progres_tugas;
  v_tugas tugas;
  v_penugasan penugasan;
  v_huruf text;
  v_kena_susulan boolean := false;
  v_penalti numeric := 0;
  v_nilai_akhir numeric;
  v_anggota record;
  v_xp_dasar int;
  v_xp_anggota int;
  v_faktor numeric;
begin
  select * into v_progres from progres_tugas where id = p_progres_id;
  if v_progres.id is null then raise exception 'Progres tugas tidak ditemukan.'; end if;

  select * into v_penugasan from penugasan where id = v_progres.penugasan_id;
  if not (saya_guru_penugasan(v_progres.penugasan_id) or saya_admin()) then
    raise exception 'Anda tidak punya izin menilai tugas ini.';
  end if;

  select * into v_tugas from tugas where id = v_progres.tugas_id;

  -- Cek susulan: kalau murid/kelompok ini punya kelonggaran_sprint dengan
  -- susulan=true untuk sprint tugas ini, kenakan penalti dari pengaturan.
  if v_progres.murid_id is not null then
    select exists (
      select 1 from kelonggaran_sprint ks
      where ks.penugasan_id = v_progres.penugasan_id and ks.sprint_id = v_tugas.sprint_id
        and ks.murid_id = v_progres.murid_id and ks.susulan = true
    ) into v_kena_susulan;
  end if;

  if v_kena_susulan then
    select coalesce((nilai->>'penalti')::numeric, 0) into v_penalti from pengaturan where kunci = 'susulan';
  end if;

  v_nilai_akhir := greatest(0, least(100, p_nilai - v_penalti));
  v_huruf := huruf_dari_nilai(v_nilai_akhir);
  v_xp_dasar := round(v_tugas.xp * v_nilai_akhir / 100.0);

  update progres_tugas set
    nilai_huruf = v_huruf,
    umpan_balik = p_umpan_balik,
    status = 'selesai',
    disetujui_pada = now(),
    kena_penalti_susulan = v_kena_susulan,
    xp_diberikan = v_xp_dasar
  where id = p_progres_id
  returning * into v_progres;

  -- ===== Beri XP =====
  if v_progres.murid_id is not null then
    -- Misi mandiri: XP langsung ke satu murid.
    insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
    values (v_progres.murid_id, v_xp_dasar, 'task', v_progres.id, 'Misi: ' || v_tugas.judul);

    update statistik_murid set
      total_xp = total_xp + v_xp_dasar,
      tugas_selesai = tugas_selesai + 1,
      diperbarui_pada = now()
    where murid_id = v_progres.murid_id;
  elsif v_progres.kelompok_id is not null then
    -- Misi kelompok: XP tiap anggota disesuaikan faktor kontribusi
    -- (default 1.0 kalau guru belum mengatur secara manual).
    for v_anggota in select murid_id from anggota_kelompok where kelompok_id = v_progres.kelompok_id
    loop
      select coalesce(faktor, 1.0) into v_faktor
        from kontribusi_individu where progres_tugas_id = v_progres.id and murid_id = v_anggota.murid_id;
      if v_faktor is null then v_faktor := 1.0; end if;
      v_xp_anggota := round(v_xp_dasar * v_faktor);

      insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
      values (v_anggota.murid_id, v_xp_anggota, 'kontribusi', v_progres.id, 'Misi kelompok: ' || v_tugas.judul);

      update statistik_murid set
        total_xp = total_xp + v_xp_anggota,
        tugas_selesai = tugas_selesai + 1,
        diperbarui_pada = now()
      where murid_id = v_anggota.murid_id;
    end loop;
  end if;

  return v_progres;
end;
$$;

grant execute on function nilai_tugas(uuid, numeric, text) to authenticated;
