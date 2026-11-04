// src/lib/data-github.js — Penyimpanan alamat repo dan cuplikan GitHub.
import { supabase } from './supabase.js';

export async function daftarRepo(penugasanId) {
  const { data, error } = await supabase
    .from('repo_kelompok').select('*').eq('penugasan_id', penugasanId);
  if (error) throw error;
  return data;
}

export async function simpanRepo({ penugasanId, kelompokId, pemilik, nama }) {
  const { data, error } = await supabase.from('repo_kelompok')
    .upsert({
      penugasan_id: penugasanId, kelompok_id: kelompokId,
      pemilik: (pemilik || '').trim() || null,
      nama: (nama || '').trim() || null
    }, { onConflict: 'penugasan_id,kelompok_id' })
    .select('*').single();
  if (error) throw error;
  return data;
}

/** Simpan hasil pemeriksaan. `galat` diisi saat gagal, dan cuplikan LAMA
 *  sengaja dibiarkan utuh — hasil pemeriksaan kemarin masih berguna bagi
 *  guru walau pemeriksaan hari ini gagal karena kuota. */
export async function simpanCuplikan({ penugasanId, kelompokId, cuplikan, galat }) {
  const baris = galat
    ? { galat: String(galat).slice(0, 500) }
    : { cuplikan, diambil_pada: new Date().toISOString(), galat: null };

  const { data, error } = await supabase.from('repo_kelompok')
    .update(baris)
    .eq('penugasan_id', penugasanId).eq('kelompok_id', kelompokId)
    .select('*').maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Semua isian lembar milik satu kelompok pada satu penugasan.
 *
 * Dipakai untuk dua hal: menebak alamat repositori yang ditulis murid di
 * lembar Identitas, dan mengumpulkan nama berkas .html yang mereka janjikan
 * di lembar Pembagian Halaman — tanpa guru perlu menunjuk lembar yang mana.
 */
export async function isianKelompok(penugasanId, kelompokId) {
  const { data, error } = await supabase
    .from('isian_lembar').select('data')
    .eq('penugasan_id', penugasanId).eq('kelompok_id', kelompokId);
  if (error) throw error;
  return (data || []).map(r => r.data || {});
}

/** Username GitHub tiap anggota, dari kolom catatan pada fitur Peran. */
export async function usernameKelompok(penugasanId, kelompokId) {
  const { data, error } = await supabase
    .from('pemegang_peran')
    .select('murid_id, catatan, profil:murid_id(id, nama, no_absen)')
    .eq('penugasan_id', penugasanId).eq('kelompok_id', kelompokId);
  if (error) throw error;

  // Satu murid bisa memegang beberapa peran, dan catatan GitHub-nya hanya
  // terisi di salah satunya. Yang dipakai catatan pertama yang tidak kosong,
  // supaya ia tidak dianggap belum mengisi username.
  const peta = new Map();
  for (const r of data || []) {
    const ada = peta.get(r.murid_id);
    const username = (r.catatan || '').trim();
    if (!ada) peta.set(r.murid_id, { murid_id: r.murid_id, nama: r.profil?.nama || 'Murid', no_absen: r.profil?.no_absen, username });
    else if (!ada.username && username) ada.username = username;
  }
  return [...peta.values()];
}
