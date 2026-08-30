-- 000110_perkuat_pendaftaran.sql
-- PERBAIKAN KEAMANAN: trigger tangani_pengguna_baru (000100) sebelumnya
-- mempercayai peran dari raw_user_meta_data pengguna sendiri. Ini berbahaya:
-- siapa pun yang memanggil endpoint auth.signUp secara langsung (di luar
-- tampilan web) bisa menyisipkan {"peran":"guru"} dan mendapat akses guru.
--
-- Perbaikan: peran SELALU 'murid' untuk pendaftaran mandiri, TANPA
-- terkecuali, apa pun isi metadata yang dikirim klien. Akun guru/admin
-- hanya boleh naik peran lewat SQL manual oleh admin (lihat
-- PANDUAN_SETUP_SUPABASE.md bagian 9) — bukan lewat form pendaftaran.

create or replace function tangani_pengguna_baru()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profil (id, nama, email, peran)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)),
    new.email,
    'murid' -- dikunci: TIDAK pernah dibaca dari metadata yang dikirim klien
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
-- Trigger on_auth_user_created (000100) tetap dipakai tanpa perubahan;
-- CREATE OR REPLACE di atas otomatis berlaku untuknya.
