// src/lib/data-asesmen.js — Lapisan akses data untuk Fase 6 (Asesmen non-tes & Badge).
import { supabase } from './supabase.js';

// ============ Penilaian Sejawat ============
export async function daftarTemanSekelompok(kelompokId, muridSayaId) {
  const { data, error } = await supabase
    .from('anggota_kelompok').select('*, profil:murid_id(nama)').eq('kelompok_id', kelompokId);
  if (error) throw error;
  return data.filter(a => a.murid_id !== muridSayaId);
}

export async function ambilPenilaianSejawatSaya(penugasanId, sprintId, penilaiId) {
  const { data, error } = await supabase
    .from('penilaian_sejawat').select('*')
    .eq('penugasan_id', penugasanId).eq('sprint_id', sprintId).eq('penilai_id', penilaiId);
  if (error) throw error;
  return data;
}

export async function simpanPenilaianSejawat({ penugasanId, sprintId, kelompokId, penilaiId, dinilaiId, skor, komentar }) {
  const { error } = await supabase.from('penilaian_sejawat').upsert({
    penugasan_id: penugasanId, sprint_id: sprintId, kelompok_id: kelompokId,
    penilai_id: penilaiId, dinilai_id: dinilaiId, skor, komentar: komentar || null
  }, { onConflict: 'penugasan_id,sprint_id,penilai_id,dinilai_id' });
  if (error) throw error;
}

/** Guru: rangkuman rata-rata skor sejawat yang diterima tiap murid pada satu penugasan. */
export async function rangkumanSejawatGuru(penugasanId) {
  const { data, error } = await supabase
    .from('penilaian_sejawat').select('*, dinilai:dinilai_id(nama), penilai:penilai_id(nama)').eq('penugasan_id', penugasanId);
  if (error) throw error;
  return data;
}

/** Guru: semua refleksi murid pada satu penugasan. */
export async function daftarRefleksiPenugasan(penugasanId) {
  const { data, error } = await supabase
    .from('refleksi').select('*, profil:murid_id(nama), sprint:sprint_id(nomor, nama)')
    .eq('penugasan_id', penugasanId)
    .order('diubah_pada', { ascending: false });
  if (error) throw error;
  return data;
}

/** Guru: seluruh riwayat observasi sikap di satu kelas. */
export async function daftarSikapKelas(kelasId) {
  const { data, error } = await supabase
    .from('observasi_sikap').select('*, profil:murid_id(nama), tujuan_pembelajaran:tujuan_pembelajaran_id(kode, judul)')
    .eq('kelas_id', kelasId)
    .order('dibuat_pada', { ascending: false });
  if (error) throw error;
  return data;
}

// ============ Refleksi ============
/** sprintId null = refleksi tingkat program (mode bawaan). */
export async function ambilRefleksi(penugasanId, sprintId, muridId) {
  let q = supabase.from('refleksi').select('*')
    .eq('penugasan_id', penugasanId).eq('murid_id', muridId);
  // Postgres: `= null` tidak pernah cocok, harus `is null`.
  q = sprintId ? q.eq('sprint_id', sprintId) : q.is('sprint_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

export async function simpanRefleksi(penugasanId, sprintId, muridId, jawaban) {
  const isi = {
    penugasan_id: penugasanId, sprint_id: sprintId || null, murid_id: muridId,
    jawaban, diubah_pada: new Date().toISOString()
  };
  // upsert onConflict tidak bisa memakai indeks parsial, jadi kecocokan
  // baris lama dicari sendiri lalu diputuskan: perbarui atau sisipkan.
  const lama = await ambilRefleksi(penugasanId, sprintId, muridId);
  if (lama) {
    const { error } = await supabase.from('refleksi').update(isi).eq('id', lama.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('refleksi').insert(isi);
    if (error) throw error;
  }
}

/** Apakah program ini memakai refleksi per tahap? (bawaan: tidak) */
export async function refleksiPerTahap(tujuanPembelajaranId) {
  const { data, error } = await supabase
    .from('tujuan_pembelajaran').select('refleksi_per_tahap')
    .eq('id', tujuanPembelajaranId).maybeSingle();
  if (error) throw error;
  return !!data?.refleksi_per_tahap;
}

/** Ambil pertanyaan refleksi untuk satu program: kustom dari guru bila ada,
 *  kalau tidak pakai 3 pertanyaan bawaan. */
export async function promptRefleksiProgram(tujuanPembelajaranId) {
  const { data, error } = await supabase
    .from('tujuan_pembelajaran').select('prompt_refleksi').eq('id', tujuanPembelajaranId).maybeSingle();
  if (error) throw error;
  const kustom = data?.prompt_refleksi;
  return Array.isArray(kustom) && kustom.length > 0 ? kustom : PROMPT_REFLEKSI;
}

export const PROMPT_REFLEKSI = [
  { key: 'pelajaran', label: 'Apa hal terpenting yang kamu pelajari di tahap ini?' },
  { key: 'kesulitan', label: 'Kesulitan apa yang kamu hadapi, dan bagaimana mengatasinya?' },
  { key: 'rencana', label: 'Apa yang akan kamu lakukan berbeda di tahap berikutnya?' }
];

// ============ Observasi Sikap ============
export async function daftarObservasiSikap(kelasId, muridId) {
  const { data, error } = await supabase
    .from('observasi_sikap').select('*').eq('kelas_id', kelasId).eq('murid_id', muridId)
    .order('dibuat_pada', { ascending: false });
  if (error) throw error;
  return data;
}

export async function simpanObservasiSikap({ kelasId, muridId, guruId, skor, catatan, sprintId, tujuanPembelajaranId }) {
  const { error } = await supabase.from('observasi_sikap').insert({
    kelas_id: kelasId, murid_id: muridId, guru_id: guruId, skor,
    catatan: catatan || null, sprint_id: sprintId || null,
    // NULL = catatan sikap umum, ikut dihitung pada TP mana pun.
    tujuan_pembelajaran_id: tujuanPembelajaranId || null
  });
  if (error) throw error;
}

export const INDIKATOR_SIKAP = [
  { key: 'disiplin', label: 'Disiplin' },
  { key: 'kerjasama', label: 'Kerja Sama' },
  { key: 'tanggung_jawab', label: 'Tanggung Jawab' },
  { key: 'inisiatif', label: 'Inisiatif' }
];

// ============ Badge ============
export async function daftarBadgeProgram(tujuanPembelajaranId) {
  const { data, error } = await supabase.from('badge').select('*').eq('tujuan_pembelajaran_id', tujuanPembelajaranId);
  if (error) throw error;
  return data;
}

export async function buatBadge(payload) {
  const { data, error } = await supabase.from('badge').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateBadge(id, payload) {
  const { data, error } = await supabase.from('badge').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function hapusBadge(id) {
  const { error } = await supabase.from('badge').delete().eq('id', id);
  if (error) throw error;
}

export async function beriBadgeManual({ badgeId, muridId, kelompokId }) {
  const { error } = await supabase.rpc('beri_badge_manual', {
    p_badge_id: badgeId, p_murid_id: muridId || null, p_kelompok_id: kelompokId || null
  });
  if (error) throw error;
}

export async function daftarBadgeMurid(muridId) {
  const { data, error } = await supabase
    .from('perolehan_badge').select('*, badge:badge_id(*)').eq('murid_id', muridId)
    .order('diraih_pada', { ascending: false });
  if (error) throw error;
  return data;
}

export async function ambilStatistikMurid(muridId) {
  const { data, error } = await supabase.from('statistik_murid').select('*').eq('murid_id', muridId).maybeSingle();
  if (error) throw error;
  return data;
}
