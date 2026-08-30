// src/lib/kesalahan.js — Menerjemahkan pesan galat Supabase/Postgres ke Bahasa Indonesia.

const PETA_PESAN = [
  [/invalid login credentials/i, 'Email atau kata sandi salah.'],
  [/user already registered/i, 'Email ini sudah terdaftar. Silakan masuk.'],
  [/email not confirmed/i, 'Email belum dikonfirmasi. Periksa kotak masuk Anda.'],
  [/password should be at least/i, 'Kata sandi minimal 6 karakter.'],
  [/JWT expired/i, 'Sesi Anda berakhir. Silakan masuk kembali.'],
  [/duplicate key value/i, 'Data ini sudah ada sebelumnya.'],
  [/row-level security/i, 'Anda tidak memiliki izin untuk melakukan aksi ini.'],
  [/network/i, 'Gagal terhubung ke server. Periksa koneksi internet Anda.'],
  // Jangan berbunyi "sudah dihapus" — galat ini justru berarti penghapusan
  // DITOLAK karena datanya masih dipakai di tempat lain.
  [/violates foreign key/i, 'Data ini masih dipakai di bagian lain, jadi belum bisa dihapus.'],
  [/violates check constraint/i, 'Data yang dimasukkan tidak sesuai aturan.'],
  [/kode kelas tidak ditemukan/i, 'Kode kelas tidak ditemukan atau kelas sudah ditutup.'],
  [/anda sudah tergabung di kelas ini/i, 'Anda sudah tergabung di kelas ini.'],
  [/tenggat untuk tahap ini sudah lewat/i, 'Tenggat untuk tahap ini sudah lewat. Hubungi guru Anda bila perlu susulan.'],
  [/tenggat sudah lewat/i, 'Tenggat sudah lewat — lembar ini tidak bisa diubah lagi.'],
  [/sudah dinilai\. gunakan fitur perbaiki nilai/i, 'Tugas ini sudah dinilai. Gunakan tombol "Perbaiki" di tab Sudah Dinilai.']
];

export function pesanGalat(err) {
  const asli = err?.message || String(err) || 'Terjadi kesalahan tak dikenal.';
  for (const [pola, pesan] of PETA_PESAN) {
    if (pola.test(asli)) return pesan;
  }
  return `Terjadi kesalahan: ${asli}`;
}
