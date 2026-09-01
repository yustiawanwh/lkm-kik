// src/lib/bukti.js — Penyimpanan bukti karya & lampiran obrolan.
//
// Dua tujuan penyimpanan:
//  - Supabase Storage (bucket privat 'bukti')
//  - Server file sekolah (mis. Nextcloud di balik proxy), dipilih untuk
//    menghemat kuota egress Supabase gratis.
//
// Tujuan aktif dibaca SAAT BERJALAN dari tabel pengaturan, dengan variabel
// lingkungan VITE_FILES_URL sebagai nilai awal. Dulu hanya dari variabel
// lingkungan, sehingga mengubahnya menuntut deploy ulang.
import { supabase } from './supabase.js';
import { hitungSidikGambar } from './sidik-gambar.js';

const URL_ENV = import.meta.env.VITE_FILES_URL || '';
const UKURAN_MAKS_PX = 1600;

let aturanCache = null;
const cacheUrl = new Map();   // path -> objectURL, agar tidak diunduh berulang

/** Pengaturan penyimpanan; hasilnya di-cache selama sesi. */
export async function aturanPenyimpanan(paksaMuatUlang = false) {
  if (aturanCache && !paksaMuatUlang) return aturanCache;
  let tersimpan = null;
  try {
    const { data } = await supabase
      .from('pengaturan').select('nilai').eq('kunci', 'penyimpanan').maybeSingle();
    tersimpan = data?.nilai || null;
  } catch { /* biarkan jatuh ke nilai awal */ }

  aturanCache = {
    mode: tersimpan?.mode || (URL_ENV ? 'sekolah' : 'supabase'),
    url: tersimpan?.url || URL_ENV,
    kirim_token: tersimpan?.kirim_token !== false
  };
  return aturanCache;
}

export function kosongkanCachePenyimpanan() {
  aturanCache = null;
  for (const u of cacheUrl.values()) { try { URL.revokeObjectURL(u); } catch {} }
  cacheUrl.clear();
}

/** Token sesi, dikirim sebagai Bearer agar proxy sekolah bisa memverifikasi
 *  siapa yang mengunggah. Tanpa ini, endpoint PUT terbuka untuk siapa saja
 *  yang mengetahui URL-nya. */
async function headerToken(aturan) {
  if (!aturan.kirim_token) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

function namaAcak(ekstensi) {
  const acak = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...acak].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex}.${ekstensi}`;
}

/** Kecilkan gambar (maks 1600px sisi terpanjang) sebelum diunggah. */
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

function pangkalUrl(aturan) {
  return (aturan.url || '').replace(/\/$/, '');
}

/** Unggah satu berkas. Mengembalikan { path, sidik }.
 *  Path berawalan "nc:" menandakan berkas ada di server sekolah. */
export async function unggahBukti(file) {
  const aturan = await aturanPenyimpanan();
  const sidik = file.type.startsWith('image/') ? await hitungSidikGambar(file).catch(() => null) : null;
  const kecil = await kecilkanGambar(file);
  const ekstensi = (kecil.name.split('.').pop() || 'jpg').toLowerCase();
  const nama = namaAcak(ekstensi);

  if (aturan.mode === 'sekolah' && aturan.url) {
    const resp = await fetch(`${pangkalUrl(aturan)}/${nama}`, {
      method: 'PUT',
      headers: { 'Content-Type': kecil.type, ...(await headerToken(aturan)) },
      body: kecil
    });
    if (!resp.ok) {
      throw new Error(`Gagal mengunggah ke server sekolah (kode ${resp.status}). ` +
        'Periksa alamat server, izin CORS, dan autentikasinya di halaman Pengaturan.');
    }
    return { path: `nc:${nama}`, sidik };
  }

  const { error } = await supabase.storage.from('bukti').upload(nama, kecil, { contentType: kecil.type });
  if (error) throw error;
  return { path: nama, sidik };
}

/** URL yang bisa dipasang ke <img src>.
 *
 *  Untuk server sekolah, berkas diambil lewat fetch (agar header Authorization
 *  ikut terkirim) lalu dijadikan objectURL. Menaruh alamatnya langsung ke
 *  <img src> tidak bisa dipakai bila proxy sekolah memeriksa token — tag img
 *  tidak pernah mengirim header apa pun. */
export async function urlBukti(path) {
  if (!path) throw new Error('Berkas tidak tersedia.');

  if (path.startsWith('nc:')) {
    if (cacheUrl.has(path)) return cacheUrl.get(path);
    const aturan = await aturanPenyimpanan();
    const alamat = `${pangkalUrl(aturan)}/${path.slice(3)}`;

    const header = await headerToken(aturan);
    if (Object.keys(header).length === 0) {
      // Tanpa token, tidak ada gunanya memakai fetch — pakai alamat langsung
      // agar tetap ringan dan hemat memori.
      return alamat;
    }
    const resp = await fetch(alamat, { headers: header });
    if (!resp.ok) throw new Error(`Gagal memuat gambar dari server sekolah (kode ${resp.status}).`);
    const objectURL = URL.createObjectURL(await resp.blob());
    cacheUrl.set(path, objectURL);
    return objectURL;
  }

  const { data, error } = await supabase.storage.from('bukti').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function hapusBuktiDariStorage(path) {
  if (!path) return;
  if (path.startsWith('nc:')) {
    const aturan = await aturanPenyimpanan();
    await fetch(`${pangkalUrl(aturan)}/${path.slice(3)}`, {
      method: 'DELETE', headers: await headerToken(aturan)
    }).catch(() => {});
    const lama = cacheUrl.get(path);
    if (lama) { try { URL.revokeObjectURL(lama); } catch {} cacheUrl.delete(path); }
    return;
  }
  await supabase.storage.from('bukti').remove([path]);
}

/** Uji koneksi ke server sekolah: unggah berkas kecil, baca kembali, hapus.
 *  Dipakai tombol uji di halaman Pengaturan. */
export async function ujiServerSekolah(url, kirimToken = true) {
  const aturan = { mode: 'sekolah', url, kirim_token: kirimToken };
  const pangkal = pangkalUrl(aturan);
  if (!pangkal) throw new Error('Alamat server belum diisi.');
  const nama = `uji-${namaAcak('txt')}`;
  const header = await headerToken(aturan);
  const isi = new Blob([`uji koneksi ${new Date().toISOString()}`], { type: 'text/plain' });

  const naik = await fetch(`${pangkal}/${nama}`, {
    method: 'PUT', headers: { 'Content-Type': 'text/plain', ...header }, body: isi
  });
  if (!naik.ok) throw new Error(`Unggah gagal (kode ${naik.status}).`);

  const baca = await fetch(`${pangkal}/${nama}`, { headers: header });
  if (!baca.ok) throw new Error(`Unggah berhasil, tetapi pembacaan gagal (kode ${baca.status}).`);

  const hapus = await fetch(`${pangkal}/${nama}`, { method: 'DELETE', headers: header });
  return {
    unggah: true, baca: true,
    hapus: hapus.ok,
    catatan: hapus.ok ? null : `Penghapusan gagal (kode ${hapus.status}) — moderasi hapus gambar tidak akan berfungsi.`
  };
}
