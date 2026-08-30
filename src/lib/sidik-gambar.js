// src/lib/sidik-gambar.js — Perceptual hash (aHash 16×16 = 256 bit) untuk
// penanda kemiripan gambar bukti karya. Dihitung di sisi klien saat unggah,
// disimpan di lampiran.sidik sebagai string heksadesimal 64 karakter.

const UKURAN = 16; // grid 16x16 = 256 bit

/** Hitung aHash dari sebuah File gambar. Mengembalikan string hex 64 char. */
export async function hitungSidikGambar(file) {
  const bitmap = await muatGambar(file);
  const kanvas = document.createElement('canvas');
  kanvas.width = UKURAN; kanvas.height = UKURAN;
  const ctx = kanvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, UKURAN, UKURAN);
  const { data } = ctx.getImageData(0, 0, UKURAN, UKURAN);

  const abuAbu = [];
  for (let i = 0; i < data.length; i += 4) {
    // Rata-rata sederhana R/G/B (cukup untuk aHash).
    abuAbu.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  }
  const rata = abuAbu.reduce((a, b) => a + b, 0) / abuAbu.length;

  let bit = '';
  for (const v of abuAbu) bit += v >= rata ? '1' : '0';

  // Konversi 256 bit → 64 karakter hex.
  let hex = '';
  for (let i = 0; i < bit.length; i += 4) {
    hex += parseInt(bit.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function muatGambar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** Jarak Hamming antara dua sidik hex (jumlah bit yang berbeda). */
export function jarakHamming(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return Infinity;
  let jarak = 0;
  for (let i = 0; i < hexA.length; i++) {
    const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    jarak += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return jarak;
}

/** Ambang kemiripan (PRD: jarak Hamming ≤ 8 dianggap mirip). */
export const AMBANG_MIRIP = 8;
