// src/lib/data-pengingat.js — Pengingat tenggat lewat ruang obrolan.
//
// Dikirim ke KANAL PRIVAT tiap murid, bukan ke kanal kelas. Pengingat di
// kanal kelas akan menyebut nama murid yang belum menyerahkan di depan
// seluruh kelas, dan itu mempermalukan, bukan mengingatkan.
//
// Perhitungan "belum diserahkan" memakai bahan yang sama dengan papan
// Pantau, supaya angka di pengingat dan angka yang dilihat guru tidak
// pernah berbeda.
import { supabase } from './supabase.js';
import { ambilBahanPantau } from './data-pantau.js';
import { bukaKanalPrivat, kirimPesan } from './data-obrolan.js';
import { tanggalId } from './dom.js';

/** Penanda di awal pesan, dipakai untuk mengenali pengingat yang sudah
 *  terkirim hari ini agar murid tidak menerima pesan sama berulang kali. */
const PENANDA = 'Pengingat tenggat';

/** Status yang berarti murid SUDAH menyerahkan pekerjaannya. */
const SUDAH = new Set(['review', 'selesai']);

/**
 * Hitung tugas yang belum diserahkan tiap murid pada satu penugasan.
 *
 * Tugas kelompok dinilai dari progres KELOMPOKNYA, lalu dibebankan ke
 * seluruh anggota — kalau dihitung per murid, tugas kelompok akan selalu
 * tampak belum diserahkan bagi anggota yang bukan pengunggahnya.
 */
export async function hitungTunggakan(penugasanId) {
  const bahan = await ambilBahanPantau(penugasanId);

  const kelompokMurid = new Map();   // murid_id → kelompok_id
  for (const k of bahan.kelompok) {
    for (const a of k.anggota_kelompok || []) kelompokMurid.set(a.murid_id, k.id);
  }

  const selesaiMandiri = new Set();  // `${tugas_id}|${murid_id}`
  const selesaiKelompok = new Set(); // `${tugas_id}|${kelompok_id}`
  for (const p of bahan.progres) {
    if (!SUDAH.has(p.status)) continue;
    if (p.kelompok_id) selesaiKelompok.add(`${p.tugas_id}|${p.kelompok_id}`);
    else if (p.murid_id) selesaiMandiri.add(`${p.tugas_id}|${p.murid_id}`);
  }

  return bahan.murid.map(m => {
    const kelompokId = kelompokMurid.get(m.id) || null;
    const belum = bahan.tugas.filter(t => {
      if (t.sifat_kerja === 'kelompok') {
        // Murid tanpa kelompok tidak bisa mengerjakan tugas kelompok;
        // menagihnya hanya akan membingungkan.
        if (!kelompokId) return false;
        return !selesaiKelompok.has(`${t.id}|${kelompokId}`);
      }
      return !selesaiMandiri.has(`${t.id}|${m.id}`);
    });
    return { murid: m, belum, penugasan: bahan.penugasan };
  }).filter(x => x.belum.length > 0);
}

/** Susun bunyi pesannya. Dipisah agar bisa diuji tanpa jaringan. */
export function susunPesanPengingat({ murid, belum, penugasan }) {
  const judul = penugasan?.tujuan_pembelajaran?.judul || 'program ini';
  const daftar = belum.slice(0, 5)
    .map(t => `• ${t.kode ? t.kode + ' — ' : ''}${t.judul}`)
    .join('\n');
  const sisa = belum.length > 5 ? `\n• … dan ${belum.length - 5} tugas lain` : '';
  const sapaan = murid?.nama ? `Hai ${String(murid.nama).split(' ')[0]},` : 'Hai,';

  return `${PENANDA} — ${judul}\n\n` +
    `${sapaan} tenggatnya ${tanggalId(penugasan?.tenggat, true)}. ` +
    `Masih ada ${belum.length} tugas yang belum kamu serahkan:\n` +
    `${daftar}${sisa}\n\n` +
    `Kalau ada yang menghambat, balas pesan ini saja.`;
}

/** Kanal yang SUDAH menerima pengingat sejak `sejak`. Dipakai agar
 *  menekan tombol dua kali tidak mengirim pesan yang sama dua kali. */
async function kanalSudahDiingatkan(kanalIds, sejak) {
  if (kanalIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('pesan').select('kanal_id')
    .in('kanal_id', kanalIds)
    .ilike('isi', `${PENANDA}%`)
    .gte('dibuat_pada', sejak);
  if (error) throw error;
  return new Set((data || []).map(r => r.kanal_id));
}

/**
 * Kirim pengingat ke semua murid yang masih menunggak.
 *
 * @param {string} penugasanId
 * @param {string} pengirimId  id guru
 * @param {{jedaJam?:number, onKemajuan?:Function}} opsi
 *   jedaJam — jangan kirim lagi bila sudah dikirim dalam N jam terakhir
 *   (bawaan 20 jam, supaya pengingat harian tidak menumpuk).
 */
export async function kirimPengingat(penugasanId, pengirimId, { jedaJam = 20, onKemajuan } = {}) {
  const tunggakan = await hitungTunggakan(penugasanId);
  if (tunggakan.length === 0) return { terkirim: 0, dilewati: 0, gagal: 0, tidakAdaTunggakan: true };

  const kelasId = tunggakan[0].penugasan.kelas_id;

  // Kanal dibuka lebih dulu agar pemeriksaan "sudah diingatkan" bisa
  // dilakukan sekali untuk semua, bukan satu kueri per murid.
  const kanal = new Map();
  for (const t of tunggakan) {
    try { kanal.set(t.murid.id, await bukaKanalPrivat(kelasId, t.murid.id)); }
    catch { /* dilaporkan sebagai gagal di bawah */ }
  }

  const sejak = new Date(Date.now() - jedaJam * 3600 * 1000).toISOString();
  const sudah = await kanalSudahDiingatkan([...kanal.values()].map(k => k.id), sejak)
    .catch(() => new Set());

  let terkirim = 0, dilewati = 0, gagal = 0;
  let ke = 0;
  for (const t of tunggakan) {
    ke++;
    onKemajuan?.(ke, tunggakan.length);
    const k = kanal.get(t.murid.id);
    if (!k) { gagal++; continue; }
    if (sudah.has(k.id)) { dilewati++; continue; }
    try {
      await kirimPesan(k.id, pengirimId, susunPesanPengingat(t));
      terkirim++;
    } catch { gagal++; }
  }
  return { terkirim, dilewati, gagal, total: tunggakan.length };
}
