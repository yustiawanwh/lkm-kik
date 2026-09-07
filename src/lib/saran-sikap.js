// src/lib/saran-sikap.js — Mengubah hasil penilaian sejawat menjadi SARAN
// nilai untuk keempat indikator sikap.
//
// Rekan menilai tiga aspek (Kerja Sama, Kontribusi, Komunikasi), sedangkan
// observasi sikap memakai empat indikator (Disiplin, Kerja Sama, Tanggung
// Jawab, Inisiatif). Pemetaan di bawah menghubungkan keduanya.
//
// Hasilnya SARAN, bukan nilai jadi. Guru tetap yang memutuskan — rekan
// sekelompok tidak berada dalam posisi menilai semua hal.

export const RENTANG_BAWAAN = { aktif: true, min: 75, maks: 95 };

/**
 * Pemetaan aspek sejawat → indikator sikap.
 * `dari` berisi aspek sejawat yang dirata-rata untuk indikator tersebut.
 * `yakin` menandai seberapa kuat dasarnya — dipakai untuk memberi peringatan
 * pada indikator yang sebenarnya tidak bisa dinilai rekan.
 */
export const PEMETAAN = [
  {
    key: 'kerjasama', label: 'Kerja Sama',
    dari: ['kerjasama'], yakin: 'kuat',
    alasan: 'Diambil langsung dari aspek Kerja Sama yang dinilai rekan.'
  },
  {
    key: 'tanggung_jawab', label: 'Tanggung Jawab',
    dari: ['kontribusi'], yakin: 'kuat',
    alasan: 'Diambil dari aspek Kontribusi — sejauh mana ia menjalankan bagiannya.'
  },
  {
    key: 'inisiatif', label: 'Inisiatif',
    dari: ['kontribusi', 'komunikasi'], yakin: 'sedang',
    alasan: 'Rata-rata Kontribusi dan Komunikasi — dua penanda terdekat untuk keaktifan menyumbang gagasan.'
  },
  {
    key: 'disiplin', label: 'Disiplin',
    dari: ['kerjasama', 'kontribusi', 'komunikasi'], yakin: 'lemah',
    alasan: 'Tidak ada padanan langsung. Rekan tidak mengamati ketepatan waktu dan kepatuhan aturan — angka ini hanya cerminan kesan umum, sebaiknya Anda tentukan sendiri.'
  }
];

/** Rata-rata sederhana, mengabaikan nilai yang tidak sah. */
function rata(daftar) {
  const angka = daftar.filter(n => typeof n === 'number' && !isNaN(n));
  return angka.length ? angka.reduce((a, b) => a + b, 0) / angka.length : null;
}

/**
 * Ubah skor sejawat (1–5) menjadi persentase di dalam rentang yang diatur.
 *
 * Pemetaannya lurus: skor terendah (1) jatuh ke batas bawah rentang, skor
 * tertinggi (5) ke batas atas. Jadi dengan rentang 75–95, skor rekan 1
 * menghasilkan 75 dan skor 5 menghasilkan 95.
 */
export function skorKePersen(skor, rentang) {
  const min = Number(rentang?.min ?? RENTANG_BAWAAN.min);
  const maks = Number(rentang?.maks ?? RENTANG_BAWAAN.maks);
  const ternormal = Math.max(0, Math.min(1, (skor - 1) / 4));
  return min + ternormal * (maks - min);
}

/** Kebalikannya: persentase → nilai indikator pada skala 1–5. */
export function persenKeIndikator(persen) {
  return persen / 20;
}

/**
 * Susun saran untuk keempat indikator sikap dari sekumpulan baris
 * penilaian_sejawat (baris `dinilai_id` murid yang bersangkutan).
 *
 * @returns {null|{jumlahPenilai:number, indikator:object[]}}
 */
export function saranSikapDariSejawat(barisSejawat, rentang = RENTANG_BAWAAN) {
  const baris = (barisSejawat || []).filter(b => b?.skor);
  if (baris.length === 0) return null;

  // Rata-rata tiap aspek sejawat lebih dulu.
  const rataAspek = {};
  for (const aspek of ['kerjasama', 'kontribusi', 'komunikasi']) {
    rataAspek[aspek] = rata(baris.map(b => Number(b.skor?.[aspek])));
  }
  if (Object.values(rataAspek).every(v => v === null)) return null;

  const indikator = PEMETAAN.map(m => {
    const nilaiAspek = rata(m.dari.map(a => rataAspek[a]));
    if (nilaiAspek === null) {
      return { ...m, skorSejawat: null, persen: null, saran: null, saranBulat: null };
    }
    const persen = skorKePersen(nilaiAspek, rentang);
    const saran = persenKeIndikator(persen);
    return {
      ...m,
      skorSejawat: nilaiAspek,
      persen,
      saran,
      // Pemilih di formulir hanya menerima bilangan bulat 1–5.
      saranBulat: Math.max(1, Math.min(5, Math.round(saran)))
    };
  });

  return { jumlahPenilai: baris.length, indikator };
}

/** Persentase afektif yang dihasilkan bila saran bulat itu dipakai apa adanya. */
export function persenDariIndikatorBulat(indikator) {
  const nilai = indikator.map(i => i.saranBulat).filter(n => n != null);
  if (nilai.length === 0) return null;
  return (nilai.reduce((a, b) => a + b, 0) / nilai.length) / 5 * 100;
}
