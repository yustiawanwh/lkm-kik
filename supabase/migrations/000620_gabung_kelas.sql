-- 000620_gabung_kelas.sql
-- PERBAIKAN BUG: kebijakan kelas_baca (000500) hanya mengizinkan murid
-- membaca baris kelas yang SUDAH mereka ikuti — jadi pencarian kelas
-- berdasarkan kode_gabung (untuk BERGABUNG) selalu gagal karena diblokir
-- RLS sebelum baris ditemukan, walau kodenya benar.
--
-- Solusi: fungsi RPC SECURITY DEFINER yang melakukan pencarian +
-- pendaftaran dalam satu langkah terkontrol, TANPA perlu melonggarkan izin
-- baca tabel kelas secara luas ke semua pengguna.

create or replace function gabung_kelas(p_kode text)
returns kelas
language plpgsql
security definer set search_path = public
as $$
declare
  v_kelas kelas;
begin
  select * into v_kelas from kelas where kode_gabung = upper(trim(p_kode)) and terbuka = true;

  if v_kelas.id is null then
    raise exception 'Kode kelas tidak ditemukan atau kelas sudah ditutup.';
  end if;

  insert into pendaftaran (kelas_id, murid_id) values (v_kelas.id, auth.uid());

  return v_kelas;
exception
  when unique_violation then
    raise exception 'Anda sudah tergabung di kelas ini.';
end;
$$;

-- Semua pengguna yang sudah login boleh MEMANGGIL fungsi ini (fungsi sendiri
-- yang membatasi apa yang boleh terjadi di dalamnya — insert selalu pakai
-- auth.uid() milik pemanggil, tidak bisa didaftarkan atas nama orang lain).
grant execute on function gabung_kelas(text) to authenticated;
