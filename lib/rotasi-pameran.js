// src/lib/rotasi-pameran.js — Rotasi tetap pada Papan Tanggapan Pameran.
//
// Tanpa rotasi, murid bebas menanggapi kelompok mana pun — dan yang terjadi
// di kelas biasanya kelompok yang karyanya paling menarik menerima belasan
// tanggapan sementara satu-dua kelompok tidak menerima apa pun. LKM
// menyiasatinya dengan rantai tetap K1 → K2 → … → K7 → K1.
//
// Urutannya diambil dari urutan pembuatan kelompok (itulah urutan yang
// dipakai daftarKelompok), jadi guru dan murid melihat rantai yang SAMA
// tanpa perlu kolom urutan tersendiri.

/** Kelompok yang harus ditanggapi oleh `kelompokId`. null bila tidak
 *  ketemu atau kelasnya baru punya satu kelompok. */
export function sasaranRotasi(daftarKelompok, kelompokId) {
  if (!kelompokId || daftarKelompok.length < 2) return null;
  const i = daftarKelompok.findIndex(k => k.id === kelompokId);
  if (i < 0) return null;
  return daftarKelompok[(i + 1) % daftarKelompok.length];
}

/** Kelompok yang menanggapi `kelompokId` — dipakai untuk menjelaskan kepada
 *  murid dari mana tanggapan yang masuk berasal. */
export function penanggapRotasi(daftarKelompok, kelompokId) {
  if (!kelompokId || daftarKelompok.length < 2) return null;
  const i = daftarKelompok.findIndex(k => k.id === kelompokId);
  if (i < 0) return null;
  return daftarKelompok[(i - 1 + daftarKelompok.length) % daftarKelompok.length];
}

/**
 * Rekap pelaksanaan rotasi untuk guru.
 *
 * @returns {{kelompok, sasaran, jumlah, sudah}[]} satu baris per kelompok,
 *   dengan `jumlah` = banyaknya tanggapan yang IA kirim ke sasarannya.
 *   Tanggapan yang disembunyikan tidak dihitung: kalau dihitung, kelompok
 *   yang tanggapannya dihapus karena melanggar akan tampak sudah bertugas.
 */
export function rekapRotasi(daftarKelompok, tanggapan) {
  return daftarKelompok.map(k => {
    const sasaran = sasaranRotasi(daftarKelompok, k.id);
    const jumlah = sasaran
      ? tanggapan.filter(t =>
          t.kelompok_penulis === k.id &&
          t.kelompok_tujuan === sasaran.id &&
          !t.disembunyikan).length
      : 0;
    return { kelompok: k, sasaran, jumlah, sudah: jumlah > 0 };
  });
}
