-- 000700_realtime_sel.sql
-- Fungsi untuk memperbarui SATU sel di isian_lembar.data secara atomik
-- (pakai jsonb_set), supaya beberapa anggota kelompok yang mengedit sel
-- berbeda pada saat bersamaan tidak saling menimpa perubahan satu sama
-- lain (yang akan terjadi kalau menyimpan seluruh objek "data" setiap kali).
--
-- TANPA SECURITY DEFINER — sengaja berjalan dengan hak akses pemanggil,
-- supaya kebijakan RLS isian_tulis_murid / isian_tulis_kelompok (000500,
-- 000600) tetap berlaku dan tidak dilewati.

create or replace function perbarui_sel_lembar(p_isian_id uuid, p_path text[], p_nilai text)
returns isian_lembar
language plpgsql
as $$
declare
  v_hasil isian_lembar;
begin
  update isian_lembar
  set data = jsonb_set(coalesce(data, '{}'::jsonb), p_path, to_jsonb(p_nilai), true),
      versi = versi + 1,
      diubah_oleh = auth.uid(),
      diubah_pada = now()
  where id = p_isian_id
  returning * into v_hasil;

  if v_hasil.id is null then
    raise exception 'Isian lembar tidak ditemukan atau Anda tidak punya akses.';
  end if;

  return v_hasil;
end;
$$;

grant execute on function perbarui_sel_lembar(uuid, text[], text) to authenticated;
