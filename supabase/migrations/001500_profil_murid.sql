-- 001500_profil_murid.sql
-- Guru boleh memperbaiki data administratif murid di kelasnya.
--
-- Latar: kolom nis & no_absen ada sejak migrasi 000100 tapi tidak pernah
-- punya antarmuka, sehingga selalu kosong — kolom "No Absen" pada Rekap
-- Nilai dan ekspor CSV ikut kosong. Murid kini bisa mengisi profilnya
-- sendiri (sudah dijamin kebijakan profil_ubah_sendiri di 000500), dan guru
-- bisa membetulkan bila murid salah ketik atau belum mengisi.
--
-- Keamanan: kolom "peran" TETAP terkunci oleh trigger jaga_kolom_profil
-- (migrasi 001200) — guru tidak bisa menaikkan peran siapa pun; hanya admin
-- yang bisa. Jadi kebijakan ini hanya membuka data administratif.

drop policy if exists profil_ubah_guru on profil;
create policy profil_ubah_guru on profil for update
  using (murid_di_kelas_saya(id) or saya_admin())
  with check (murid_di_kelas_saya(id) or saya_admin());

-- Indeks untuk pengurutan daftar murid berdasarkan nomor absen.
create index if not exists profil_idx_no_absen on profil (no_absen);
