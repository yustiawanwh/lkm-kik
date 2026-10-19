// src/lib/simpan-luring.js — Antrean simpan saat jaringan terputus.
//
// Masalah yang diselesaikan: jaringan sekolah sering putus beberapa detik
// sampai beberapa menit. Sebelum ini, satu kegagalan kirim hanya memunculkan
// pesan galat, dan ketikan murid pada saat itu hilang — padahal mereka
// sedang mengerjakan tugas yang dinilai.
//
// Cara kerjanya:
//   1. Setiap penyimpanan dikirim lewat modul ini.
//   2. Bila gagal karena JARINGAN, pekerjaan masuk antrean di localStorage.
//   3. Begitu antrean terisi, penyimpanan berikutnya IKUT masuk antrean
//      — supaya urutannya tidak teracak (pekerjaan lama belum terkirim
//      sementara yang baru sudah).
//   4. Antrean dikirim ulang saat peramban kembali daring, dan dicoba lagi
//      secara berkala.
//
// Yang TIDAK diantre: galat izin (RLS), lembar yang sudah terkunci, data
// tidak sah. Mengantrekannya hanya menghasilkan percobaan ulang tanpa akhir
// dan pesan galat yang tidak pernah hilang dari layar murid.
import { supabase } from './supabase.js';

const KUNCI = 'bvs.antrean-simpan.v1';
const JEDA_COBA_MS = 15000;
const BATAS_PEKERJAAN = 2000;      // jaga agar localStorage tidak penuh
const UMUR_MAKS_MS = 7 * 24 * 3600 * 1000;

let antrean = muatAntrean();
let sedangKirim = false;
let timer = null;
const pendengar = new Set();

// ---------- Penyimpanan antrean ----------

function muatAntrean() {
  // localStorage bisa melempar di mode privat atau saat kuota penuh;
  // aplikasi harus tetap jalan tanpanya, hanya tanpa kemampuan luring.
  try {
    const mentah = localStorage.getItem(KUNCI);
    if (!mentah) return [];
    const daftar = JSON.parse(mentah);
    if (!Array.isArray(daftar)) return [];
    const batas = Date.now() - UMUR_MAKS_MS;
    return daftar.filter(p => p && p.isianId && (p.waktu ?? 0) > batas);
  } catch { return []; }
}

function simpanAntrean() {
  try {
    if (antrean.length === 0) localStorage.removeItem(KUNCI);
    else localStorage.setItem(KUNCI, JSON.stringify(antrean));
  } catch { /* kuota penuh atau mode privat — antrean tetap hidup di memori */ }
}

// ---------- Pemberitahuan keadaan ----------

export function keadaanLuring() {
  return {
    tertunda: antrean.length,
    daring: typeof navigator === 'undefined' ? true : navigator.onLine !== false
  };
}

export function dengarkanLuring(fn) {
  pendengar.add(fn);
  fn(keadaanLuring());
  return () => pendengar.delete(fn);
}

function kabarkan() {
  const k = keadaanLuring();
  for (const fn of pendengar) { try { fn(k); } catch { /* jangan jatuhkan yang lain */ } }
}

// ---------- Pengenalan galat ----------

/**
 * Apakah galat ini layak dicoba ulang?
 *
 * Hanya kegagalan transport. Galat dari PostgREST selalu membawa `code`
 * (mis. 42501 untuk izin, PGRST116 untuk baris tak ditemukan) dan TIDAK
 * akan berhasil walau dicoba seribu kali.
 */
export function galatJaringan(err) {
  if (!err) return false;

  // Kode dari PostgREST/PostgreSQL berarti permintaannya SAMPAI ke server
  // dan ditolak di sana — mencoba ulang tidak akan mengubah hasilnya.
  // Kekecualiannya kode transport di tingkat jaringan.
  const kode = String(err.code ?? '').trim();
  if (kode !== '') {
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(kode);
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const pesan = String(err.message || err).toLowerCase();
  return pesan.includes('failed to fetch')
      || pesan.includes('load failed')
      || pesan.includes('networkerror')
      || pesan.includes('network request failed')
      || pesan.includes('err_internet_disconnected')
      || pesan.includes('timeout');
}

// ---------- Pengiriman ----------

async function kirim(p) {
  if (p.jenis === 'timpa') {
    const { error } = await supabase.from('isian_lembar')
      .update({ data: p.data }).eq('id', p.isianId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.rpc('perbarui_sel_lembar', {
    p_isian_id: p.isianId, p_path: p.path, p_nilai: p.nilai
  });
  if (error) throw error;
}

/**
 * Masukkan pekerjaan ke antrean, sekaligus merapikannya.
 *
 * Dua perapian yang penting supaya antrean tidak membengkak saat murid
 * mengetik lama tanpa jaringan:
 *   - pekerjaan 'timpa' untuk sebuah isian MENGGANTIKAN seluruh pekerjaan
 *     sebelumnya pada isian itu (isinya memang seluruh objek data);
 *   - pekerjaan 'sel' pada JALUR YANG SAMA cukup yang terakhir.
 *
 * Perapian kedua MEMINDAHKAN pekerjaan itu ke belakang antrean, jadi urutan
 * antar-jalur bisa berubah. Itu aman, dan alasannya perlu ditulis supaya
 * tidak "diperbaiki" nanti menjadi sesuatu yang justru merusak:
 *
 *   - tiap pekerjaan 'sel' adalah penetapan nilai pada SATU jalur daun,
 *     bukan perubahan bertahap. Dua penetapan pada jalur berbeda tidak
 *     saling bergantung, sehingga hasil akhirnya sama apa pun urutannya;
 *   - satu-satunya urutan yang WAJIB terjaga adalah 'timpa' harus mendahului
 *     'sel' pada isian yang sama — karena 'timpa'-lah yang membentuk induk
 *     jalur bertingkat (jsonb_set tidak bisa membuat induk). Itu terjamin:
 *     'timpa' membuang seluruh pekerjaan lama isian itu lalu diletakkan di
 *     belakang, sehingga 'sel' sesudahnya selalu berada di belakangnya.
 */
function antre(p) {
  p.waktu = Date.now();
  if (p.jenis === 'timpa') {
    antrean = antrean.filter(x => x.isianId !== p.isianId);
  } else {
    const kunci = p.path.join('\u0001');
    antrean = antrean.filter(x =>
      !(x.jenis === 'sel' && x.isianId === p.isianId && x.path.join('\u0001') === kunci));
  }
  antrean.push(p);
  // Kalau sampai melampaui batas, yang tertua dibuang — bukan yang terbaru,
  // karena yang terbaru adalah pekerjaan murid yang sedang berlangsung.
  if (antrean.length > BATAS_PEKERJAAN) antrean = antrean.slice(-BATAS_PEKERJAAN);
  simpanAntrean();
  kabarkan();
  jadwalkan();
}

function jadwalkan() {
  if (timer || antrean.length === 0) return;
  timer = setTimeout(() => { timer = null; kirimAntrean(); }, JEDA_COBA_MS);
}

/** Kirim antrean dari depan. Berhenti pada kegagalan jaringan PERTAMA agar
 *  urutannya terjaga; pekerjaan yang ditolak permanen dibuang supaya tidak
 *  menyumbat pekerjaan di belakangnya. */
export async function kirimAntrean() {
  if (sedangKirim || antrean.length === 0) return;
  sedangKirim = true;
  let dibuang = 0;
  try {
    while (antrean.length > 0) {
      const p = antrean[0];
      try {
        await kirim(p);
        antrean.shift();
      } catch (err) {
        if (galatJaringan(err)) { jadwalkan(); break; }
        antrean.shift();
        dibuang++;
      }
      simpanAntrean();
      kabarkan();
    }
  } finally {
    sedangKirim = false;
    simpanAntrean();
    kabarkan();
  }
  return { tertunda: antrean.length, dibuang };
}

/**
 * Simpan satu sel. Mengembalikan 'kirim' bila langsung terkirim, atau
 * 'antre' bila ditahan sampai jaringan kembali.
 *
 * Melempar galat untuk kegagalan yang BUKAN jaringan, supaya pemanggil
 * tetap bisa memberi tahu murid bahwa lembarnya terkunci atau tidak boleh
 * diisi — kegagalan semacam itu tidak boleh disembunyikan.
 */
export async function simpanSel(isianId, path, nilai) {
  const p = { jenis: 'sel', isianId, path, nilai };
  if (antrean.length > 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    antre(p); return 'antre';
  }
  try { await kirim(p); return 'kirim'; }
  catch (err) {
    if (!galatJaringan(err)) throw err;
    antre(p); return 'antre';
  }
}

export async function simpanTimpa(isianId, data) {
  // Snapshot: data bisa berubah lagi sebelum antrean terkirim.
  const p = { jenis: 'timpa', isianId, data: JSON.parse(JSON.stringify(data ?? {})) };
  if (antrean.length > 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    antre(p); return 'antre';
  }
  try { await kirim(p); return 'kirim'; }
  catch (err) {
    if (!galatJaringan(err)) throw err;
    antre(p); return 'antre';
  }
}

/**
 * Tempelkan pekerjaan yang masih tertunda ke data yang baru dimuat dari
 * server.
 *
 * Tanpa ini, murid yang menutup aplikasi saat jaringan mati akan melihat
 * lembarnya KEMBALI KOSONG saat dibuka lagi — pekerjaannya aman di antrean,
 * tetapi tidak terlihat, dan ia akan mengetiknya ulang.
 */
export function terapkanTertunda(isianId, data) {
  const milikku = antrean.filter(p => p.isianId === isianId);
  if (milikku.length === 0) return data;
  let hasil = data && typeof data === 'object' ? data : {};
  for (const p of milikku) {
    if (p.jenis === 'timpa') { hasil = JSON.parse(JSON.stringify(p.data ?? {})); continue; }
    let kursor = hasil;
    for (let i = 0; i < p.path.length - 1; i++) {
      if (typeof kursor[p.path[i]] !== 'object' || kursor[p.path[i]] === null) kursor[p.path[i]] = {};
      kursor = kursor[p.path[i]];
    }
    kursor[p.path[p.path.length - 1]] = p.nilai;
  }
  return hasil;
}

/** Berapa pekerjaan yang masih tertunda untuk satu isian. */
export function tertundaUntuk(isianId) {
  return antrean.filter(p => p.isianId === isianId).length;
}

// ---------- Pemasangan ----------

let terpasang = false;

/** Dipanggil sekali dari main.js. */
export function mulaiSimpanLuring() {
  if (terpasang || typeof window === 'undefined') return;
  terpasang = true;

  window.addEventListener('online', () => { kabarkan(); kirimAntrean(); });
  window.addEventListener('offline', kabarkan);
  // Saat tab kembali terlihat: murid sering berpindah aplikasi, dan
  // peristiwa 'online' tidak selalu terpancar di peramban ponsel.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kirimAntrean();
  });

  if (antrean.length > 0) { kabarkan(); kirimAntrean(); }
}
