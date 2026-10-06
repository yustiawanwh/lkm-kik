// src/lib/sidik-teks.js — Membandingkan kemiripan jawaban teks antar murid.
//
// Dipakai untuk LKM mandiri yang mensyaratkan jawaban ditulis dengan
// kalimat sendiri. Deteksi gambar yang sudah ada memakai sidik aHash;
// untuk teks dibutuhkan cara lain.
//
// Dua lapis pemeriksaan:
//   1. Sama persis setelah dinormalkan — kasus salin-tempel mentah.
//   2. Kemiripan trigram kata (Jaccard) — menangkap salinan yang hanya
//      diubah sedikit, mis. tukar satu kata atau ubah urutan kalimat.

/** Samakan bentuk teks agar perbedaan tak berarti tidak dihitung:
 *  huruf besar/kecil, tanda baca, dan spasi berlebih. */
export function normalkan(teks) {
  return String(teks ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')   // buang tanda baca, pertahankan huruf & angka
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kumpulkan seluruh teks dalam sebuah isian menjadi satu untaian.
 *  Struktur datanya bersarang dan berbeda-beda per tipe lembar, jadi
 *  ditelusuri secara umum alih-alih per tipe. */
export function kumpulkanTeks(data) {
  const bagian = [];
  (function telusuri(nilai) {
    if (nilai === null || nilai === undefined) return;
    if (typeof nilai === 'string') {
      // Angka yang tersimpan sebagai teks (nilai Likert "4", skor matriks
      // "3") bukan tulisan murid. Menyertakannya hanya menambah derau pada
      // perbandingan.
      if (/^\s*\d+([.,]\d+)?\s*$/.test(nilai)) return;
      bagian.push(nilai);
      return;
    }
    if (typeof nilai === 'number' || typeof nilai === 'boolean') return;  // angka Likert bukan tulisan
    if (Array.isArray(nilai)) { nilai.forEach(telusuri); return; }
    if (typeof nilai === 'object') { Object.values(nilai).forEach(telusuri); }
  })(data);
  return bagian.join(' ');
}

export function jumlahKata(teks) {
  const n = normalkan(teks);
  return n === '' ? 0 : n.split(' ').length;
}

/** Trigram kata, mis. "aku suka belajar web" → ["aku suka belajar", "suka belajar web"]. */
function trigram(teks) {
  const kata = normalkan(teks).split(' ').filter(Boolean);
  if (kata.length < 3) return new Set(kata.length ? [kata.join(' ')] : []);
  const set = new Set();
  for (let i = 0; i <= kata.length - 3; i++) set.add(kata.slice(i, i + 3).join(' '));
  return set;
}

/** Kemiripan Jaccard 0–100. */
export function kemiripanTeks(a, b) {
  const na = normalkan(a), nb = normalkan(b);
  if (na === '' || nb === '') return 0;
  if (na === nb) return 100;

  const ta = trigram(na), tb = trigram(nb);
  if (ta.size === 0 || tb.size === 0) return 0;

  let irisan = 0;
  for (const t of ta) if (tb.has(t)) irisan++;
  const gabungan = ta.size + tb.size - irisan;
  return gabungan === 0 ? 0 : Math.round((irisan / gabungan) * 100);
}

export const AMBANG_BAWAAN = 80;
export const MIN_KATA_BAWAAN = 8;

/**
 * Bandingkan seluruh pasangan isian pada satu lembar.
 *
 * @param {{id:string, nama:string, teks:string}[]} daftar
 * @param {{ambang:number, minKata:number}} opsi
 * @returns pasangan yang melampaui ambang, terurut dari paling mirip
 */
export function cariPasanganMirip(daftar, { ambang = AMBANG_BAWAAN, minKata = MIN_KATA_BAWAAN } = {}) {
  // Jawaban sangat pendek ("Ya", "Manfaat", "3") hampir pasti sama antar
  // murid tanpa ada penyalinan. Menyertakannya hanya menghasilkan
  // peringatan palsu yang membuat guru berhenti mempercayai alat ini.
  const layak = daftar.filter(d => jumlahKata(d.teks) >= minKata);

  const hasil = [];
  for (let i = 0; i < layak.length; i++) {
    for (let j = i + 1; j < layak.length; j++) {
      const skor = kemiripanTeks(layak[i].teks, layak[j].teks);
      if (skor >= ambang) {
        hasil.push({
          a: layak[i], b: layak[j], skor,
          samaPersis: normalkan(layak[i].teks) === normalkan(layak[j].teks)
        });
      }
    }
  }
  return hasil.sort((x, y) => y.skor - x.skor);
}
