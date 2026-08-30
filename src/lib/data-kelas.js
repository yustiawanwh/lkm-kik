// src/lib/data-kelas.js — Lapisan akses data untuk Fase 3 (Kelas & Kelompok).
import { supabase } from './supabase.js';
import { ambilSemua } from './query.js';

function buatKodeGabung() {
  const abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I agar tak rancu
  let kode = '';
  for (let i = 0; i < 6; i++) kode += abjad[Math.floor(Math.random() * abjad.length)];
  return kode;
}

// ============ Kelas (guru) ============
export async function daftarKelasGuru() {
  const { data, error } = await supabase
    .from('kelas').select('*, pendaftaran(count)')
    .order('dibuat_pada', { ascending: false });
  if (error) throw error;
  return data;
}

export async function ambilKelas(id) {
  const { data, error } = await supabase.from('kelas').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function buatKelas({ nama, mata_pelajaran_id, tahun_ajaran_id, guru_id }) {
  // Coba beberapa kali kalau kode_gabung kebetulan bentrok (sangat jarang).
  for (let percobaan = 0; percobaan < 5; percobaan++) {
    const kode_gabung = buatKodeGabung();
    const { data, error } = await supabase
      .from('kelas')
      .insert({ nama, mata_pelajaran_id, tahun_ajaran_id, guru_id, kode_gabung })
      .select().single();
    if (!error) return data;
    if (!/duplicate key/i.test(error.message)) throw error;
  }
  throw new Error('Gagal membuat kode gabung unik, coba lagi.');
}

export async function updateKelas(id, payload) {
  const { data, error } = await supabase.from('kelas').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function hapusKelas(id) {
  const { error } = await supabase.from('kelas').delete().eq('id', id);
  if (error) throw error;
}

// ============ Pendaftaran (roster) ============
export async function daftarMuridKelas(kelasId) {
  return ambilSemua((dari, ke) =>
    supabase
      .from('pendaftaran')
      .select('*, profil:murid_id(id, nama, email, no_absen, nis)')
      .eq('kelas_id', kelasId)
      .order('bergabung_pada', { ascending: true })
      .range(dari, ke)
  );
}

/** Murid bergabung ke kelas lewat kode_gabung, lewat fungsi database
 *  gabung_kelas() (migrasi 000620) — pencarian & pendaftaran dilakukan
 *  server-side agar tidak diblokir RLS baca tabel kelas. */
export async function gabungKelasDenganKode(kode, muridId) {
  const { data, error } = await supabase.rpc('gabung_kelas', { p_kode: kode.trim() });
  if (error) throw error;
  return data;
}

export async function ubahKendaliMurid(pendaftaranId, kendali) {
  const { error } = await supabase.from('pendaftaran').update({ kendali }).eq('id', pendaftaranId);
  if (error) throw error;
}

export async function ambilKendaliSaya(kelasId, muridId) {
  const { data, error } = await supabase
    .from('pendaftaran').select('id, kendali').eq('kelas_id', kelasId).eq('murid_id', muridId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function daftarKelasMurid(muridId) {
  const { data, error } = await supabase
    .from('pendaftaran')
    .select('*, kelas:kelas_id(*)')
    .eq('murid_id', muridId).eq('aktif', true);
  if (error) throw error;
  return data.map(d => d.kelas);
}

// ============ Kelompok ============
export async function daftarKelompok(kelasId) {
  const { data, error } = await supabase
    .from('kelompok')
    .select('*, anggota_kelompok(*, profil:murid_id(id, nama))')
    .eq('kelas_id', kelasId)
    .order('dibuat_pada', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buatKelompok(kelasId, nama) {
  const { data, error } = await supabase.from('kelompok').insert({ kelas_id: kelasId, nama }).select().single();
  if (error) throw error;
  return data;
}

export async function hapusKelompok(id) {
  const { error } = await supabase.from('kelompok').delete().eq('id', id);
  if (error) throw error;
}

export async function tambahAnggota(kelompokId, muridId) {
  const { error } = await supabase.from('anggota_kelompok').insert({ kelompok_id: kelompokId, murid_id: muridId });
  if (error) throw error;
}

export async function keluarkanAnggota(anggotaId) {
  const { error } = await supabase.from('anggota_kelompok').delete().eq('id', anggotaId);
  if (error) throw error;
}

export async function jadikanKetua(kelompokId, anggotaId) {
  // Turunkan ketua lama (kalau ada), lalu naikkan anggota terpilih.
  const { error: e1 } = await supabase.from('anggota_kelompok')
    .update({ peran_dalam_kelompok: 'anggota' }).eq('kelompok_id', kelompokId).eq('peran_dalam_kelompok', 'ketua');
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('anggota_kelompok')
    .update({ peran_dalam_kelompok: 'ketua' }).eq('id', anggotaId);
  if (e2) throw e2;
}

// ============ Penugasan ============
export async function daftarPenugasanKelas(kelasId) {
  const { data, error } = await supabase
    .from('penugasan')
    .select('*, tujuan_pembelajaran:tujuan_pembelajaran_id(id, judul, kode)')
    .eq('kelas_id', kelasId)
    .order('dibuat_pada', { ascending: false });
  if (error) throw error;
  return data;
}

export async function daftarProgramTerbit() {
  const { data, error } = await supabase.from('tujuan_pembelajaran').select('*').eq('terbit', true);
  if (error) throw error;
  return data;
}

export async function buatPenugasan(payload) {
  const { data, error } = await supabase.from('penugasan').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updatePenugasan(id, payload) {
  const { data, error } = await supabase.from('penugasan').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function hapusPenugasan(id) {
  const { error } = await supabase.from('penugasan').delete().eq('id', id);
  if (error) throw error;
}

/** Penugasan aktif untuk murid, lintas semua kelas yang diikuti. */
export async function daftarPenugasanMurid(muridId) {
  const { data: pendaftar, error: e1 } = await supabase
    .from('pendaftaran').select('kelas_id').eq('murid_id', muridId).eq('aktif', true);
  if (e1) throw e1;
  const kelasIds = pendaftar.map(p => p.kelas_id);
  if (kelasIds.length === 0) return [];
  const { data, error } = await supabase
    .from('penugasan')
    .select('*, kelas:kelas_id(nama), tujuan_pembelajaran:tujuan_pembelajaran_id(id, judul, kode)')
    .in('kelas_id', kelasIds).eq('dibuka', true)
    .order('tenggat', { ascending: true });
  if (error) throw error;
  return data;
}
