-- 001700_badge_hitung_kelompok.sql
-- PERBAIKAN: syarat lencana otomatis tidak pernah terpicu pada program yang
-- misinya berkelompok.
--
-- cek_badge_otomatis (001000) menghitung dengan syarat `pt.murid_id = murid`.
-- Padahal misi kelompok menyimpan kelompok_id dan membiarkan murid_id NULL,
-- sehingga untuk program seperti TP 11.2 — yang seluruh misinya berkelompok —
-- hitungannya selalu 0 dan rata-ratanya selalu NULL. Lencana otomatis jadi
-- mustahil diraih, tanpa pesan galat apa pun.
--
-- Perbaikan: hitung juga misi kelompok yang murid tersebut menjadi anggotanya.

create or replace function cek_badge_otomatis(p_murid_id uuid, p_tujuan_pembelajaran_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_badge record;
  v_jenis text;
  v_ambang numeric;
  v_hitung numeric;
  v_sudah_punya boolean;
begin
  for v_badge in
    select * from badge where tujuan_pembelajaran_id = p_tujuan_pembelajaran_id and lingkup = 'individu'
  loop
    select exists (select 1 from perolehan_badge where murid_id = p_murid_id and badge_id = v_badge.id)
      into v_sudah_punya;
    if v_sudah_punya then continue; end if;

    v_jenis := v_badge.syarat->>'jenis';
    v_ambang := (v_badge.syarat->>'nilai')::numeric;
    if v_jenis is null or v_ambang is null then continue; end if; -- lencana manual

    if v_jenis = 'jumlah_misi_selesai' then
      select count(*) into v_hitung
        from progres_tugas pt
        join penugasan p on p.id = pt.penugasan_id
        where pt.status = 'selesai'
          and p.tujuan_pembelajaran_id = p_tujuan_pembelajaran_id
          and (
            pt.murid_id = p_murid_id
            or (pt.kelompok_id is not null and exists (
                  select 1 from anggota_kelompok ak
                  where ak.kelompok_id = pt.kelompok_id and ak.murid_id = p_murid_id))
          );

    elsif v_jenis = 'nilai_rata_rata_min' then
      select avg(pt.nilai_angka) into v_hitung
        from progres_tugas pt
        join penugasan p on p.id = pt.penugasan_id
        where pt.status = 'selesai' and pt.nilai_angka is not null
          and p.tujuan_pembelajaran_id = p_tujuan_pembelajaran_id
          and (
            pt.murid_id = p_murid_id
            or (pt.kelompok_id is not null and exists (
                  select 1 from anggota_kelompok ak
                  where ak.kelompok_id = pt.kelompok_id and ak.murid_id = p_murid_id))
          );
    else
      continue;
    end if;

    if v_hitung is not null and v_hitung >= v_ambang then
      insert into perolehan_badge (murid_id, badge_id) values (p_murid_id, v_badge.id)
        on conflict do nothing;
      insert into buku_xp (murid_id, jumlah, sumber, referensi, keterangan)
        values (p_murid_id, v_badge.xp, 'badge', v_badge.id, 'Lencana: ' || v_badge.nama);
      update statistik_murid set
        total_xp = total_xp + v_badge.xp, jumlah_badge = jumlah_badge + 1, diperbarui_pada = now()
        where murid_id = p_murid_id;
    end if;
  end loop;
end;
$$;
