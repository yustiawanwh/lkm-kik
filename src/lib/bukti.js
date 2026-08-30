// src/lib/bukti.js — Helper penyimpanan bukti karya. Mendukung dua backend:
// - Supabase Storage (bawaan, bucket privat "bukti")
// - Server file sekolah / Nextcloud lewat proxy (VITE_FILES_URL) — path
//   ditandai awalan "nc:" supaya urlBukti()/hapusBukti() tahu ke mana harus
//   mengambil/menghapusnya.
import { supabase } from './supabase.js';
import { hitungSidikGambar } from './sidik-gambar.js';

const URL_SERVER_FILE = import.meta.env.VITE_FILES_URL || '';
const UKURAN_MAKS_PX = 1600; // gambar dikecilkan sebelum unggah

function namaAcak(ekstensi) {
  const acak = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...acak].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex}.${ekstensi}`;
}

/** Kecilkan gambar (maks 1600px sisi terpanjang) sebelum diunggah, hemat kuota. */
async function kecilkanGambar(file) {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const skala = Math.min(1, UKURAN_MAKS_PX / Math.max(bitmap.width, bitmap.height));
  if (skala >= 1) return file;
  const kanvas = document.createElement('canvas');
  kanvas.width = Math.round(bitmap.width * skala);
  kanvas.height = Math.round(bitmap.height * skala);
  kanvas.getContext('2d').drawImage(bitmap, 0, 0, kanvas.width, kanvas.height);
  const blob = await new Promise(res => kanvas.toBlob(res, 'image/jpeg', 0.85));
  return new File([blob], file.name, { type: 'image/jpeg' });
}

/** Unggah satu berkas bukti. Mengembalikan { path, sidik }. */
export async function unggahBukti(file) {
  const sidik = file.type.startsWith('image/') ? await hitungSidikGambar(file).catch(() => null) : null;
  const kecil = await kecilkanGambar(file);
  const ekstensi = (kecil.name.split('.').pop() || 'jpg').toLowerCase();
  const nama = namaAcak(ekstensi);

  if (URL_SERVER_FILE) {
    const resp = await fetch(`${URL_SERVER_FILE.replace(/\/$/, '')}/${nama}`, { method: 'PUT', body: kecil });
    if (!resp.ok) throw new Error('Gagal mengunggah ke server file sekolah.');
    return { path: `nc:${nama}`, sidik };
  }

  const { error } = await supabase.storage.from('bukti').upload(nama, kecil, { contentType: kecil.type });
  if (error) throw error;
  return { path: nama, sidik };
}

/** Dapatkan URL yang bisa dibuka untuk satu path bukti. */
export async function urlBukti(path) {
  if (path.startsWith('nc:')) {
    return `${URL_SERVER_FILE.replace(/\/$/, '')}/${path.slice(3)}`;
  }
  const { data, error } = await supabase.storage.from('bukti').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function hapusBuktiDariStorage(path) {
  if (path.startsWith('nc:')) {
    await fetch(`${URL_SERVER_FILE.replace(/\/$/, '')}/${path.slice(3)}`, { method: 'DELETE' }).catch(() => {});
    return;
  }
  await supabase.storage.from('bukti').remove([path]);
}
