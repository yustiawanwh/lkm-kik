// src/lib/data-kurikulum.js — Lapisan akses data untuk Fase 2 (Kurikulum & LKPD).
import { supabase } from './supabase.js';

/** Ambil mata pelajaran pertama (data awal 'KIK' dari migrasi 000210). */
export async function ambilMapelDefault() {
  const { data, error } = await supabase.from('mata_pelajaran').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function daftarMapel() {
  const { data, error } = await supabase.from('mata_pelajaran').select('*').order('nama');
  if (error) throw error;
  return data;
}

export async function buatMapel(payload) {
  const { data, error } = await supabase.from('mata_pelajaran').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateMapel(id, payload) {
  const { data, error } = await supabase.from('mata_pelajaran').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function hapusMapel(id) {
  // kelas.mata_pelajaran_id tanpa cascade — kelas yang memakainya menahan
  // penghapusan. Beri tahu lebih dulu daripada membiarkan galat mentah.
  const { count, error: e1 } = await supabase
    .from('kelas').select('id', { count: 'exact', head: true }).eq('mata_pelajaran_id', id);
  if (e1) throw e1;
  if ((count || 0) > 0) {
    throw new Error(
      `Mata pelajaran ini masih dipakai oleh ${count} kelas, jadi belum bisa dihapus. ` +
      'Pindahkan atau hapus kelas tersebut lebih dulu.'
    );
  }
  const { error } = await supabase.from('mata_pelajaran').delete().eq('id', id);
  if (error) throw error;
}

// ============ Program Inkubasi (tujuan_pembelajaran) ============
export async function daftarProgram() {
  const { data, error } = await supabase
    .from('tujuan_pembelajaran')
    .select('*')
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data;
}

export async function ambilProgram(id) {
  const { data, error } = await supabase.from('tujuan_pembelajaran').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function buatProgram(payload) {
  const { data, error } = await supabase.from('tujuan_pembelajaran').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProgram(id, payload) {
  const { data, error } = await supabase.from('tujuan_pembelajaran').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Cek apakah program sedang dipakai (sudah ditugaskan ke kelas).
 *  Mengembalikan daftar nama kelas yang memakainya. */
export async function kelasPemakaiProgram(id) {
  const { data, error } = await supabase
    .from('penugasan').select('kelas:kelas_id(nama)').eq('tujuan_pembelajaran_id', id);
  if (error) throw error;
  return data.map(p => p.kelas?.nama).filter(Boolean);
}

export async function hapusProgram(id) {
  // penugasan.tujuan_pembelajaran_id sengaja TIDAK memakai on delete cascade:
  // kalau dicascade, menghapus program akan ikut menghapus seluruh penugasan
  // beserta progres, nilai, XP, dan bukti karya murid. Jadi program yang
  // sudah dipakai ditolak di sini dengan pesan yang jelas, bukan dibiarkan
  // gagal dengan galat foreign key yang membingungkan.
  const pemakai = await kelasPemakaiProgram(id);
  if (pemakai.length > 0) {
    throw new Error(
      `Program ini masih ditugaskan ke kelas: ${[...new Set(pemakai)].join(', ')}. ` +
      'Hapus dulu penugasannya di halaman Kelas, atau jadikan program ini Draf agar tidak dipakai lagi.'
    );
  }
  const { error, count } = await supabase
    .from('tujuan_pembelajaran').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (count === 0) {
    throw new Error('Program tidak terhapus — Anda mungkin tidak punya izin menghapusnya.');
  }
}

// ============ Sprint (Tahap Inkubasi) ============
export async function daftarSprint(tujuanPembelajaranId) {
  const { data, error } = await supabase
    .from('sprint').select('*')
    .eq('tujuan_pembelajaran_id', tujuanPembelajaranId)
    .order('nomor', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buatSprint(payload) {
  const { data, error } = await supabase.from('sprint').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateSprint(id, payload) {
  const { data, error } = await supabase.from('sprint').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function hapusSprint(id) {
  const { error } = await supabase.from('sprint').delete().eq('id', id);
  if (error) throw error;
}

// ============ Tugas (Misi) ============
export async function daftarTugas(sprintId) {
  const { data, error } = await supabase
    .from('tugas').select('*')
    .eq('sprint_id', sprintId)
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buatTugas(payload) {
  const { data, error } = await supabase.from('tugas').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateTugas(id, payload) {
  const { data, error } = await supabase.from('tugas').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function hapusTugas(id) {
  const { error } = await supabase.from('tugas').delete().eq('id', id);
  if (error) throw error;
}

// ============ Lembar Kerja ============
export async function daftarLembar(tujuanPembelajaranId) {
  const { data, error } = await supabase
    .from('lembar_kerja').select('*')
    .eq('tujuan_pembelajaran_id', tujuanPembelajaranId)
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data;
}

export async function buatLembar(payload) {
  const { data, error } = await supabase.from('lembar_kerja').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateLembar(id, payload) {
  const { data, error } = await supabase.from('lembar_kerja').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Berapa banyak murid/kelompok yang sudah mengisi lembar ini. */
export async function jumlahIsianLembar(id) {
  const { count, error } = await supabase
    .from('isian_lembar').select('id', { count: 'exact', head: true }).eq('lembar_kerja_id', id);
  if (error) throw error;
  return count || 0;
}

export async function hapusLembar(id) {
  // isian_lembar.lembar_kerja_id tanpa on delete cascade — disengaja, agar
  // pekerjaan murid tidak lenyap gara-gara guru merapikan daftar lembar.
  const terisi = await jumlahIsianLembar(id);
  if (terisi > 0) {
    throw new Error(
      `Lembar ini sudah diisi oleh ${terisi} murid/kelompok, jadi tidak bisa dihapus. ` +
      'Ubah judulnya atau lepaskan tautannya dari misi bila tidak dipakai lagi.'
    );
  }
  const { error } = await supabase.from('lembar_kerja').delete().eq('id', id);
  if (error) throw error;
}

export const TIPE_LEMBAR = [
  'matriks', 'daftar', 'formulir', 'referensi', 'kanvas', 'tahapan',
  'kalkulator', 'instrumen', 'likert', 'kesepakatan', 'sejawat', 'refleksi', 'sikap'
];

export const LABEL_TIPE_LEMBAR = {
  matriks: 'Matriks', daftar: 'Daftar', formulir: 'Formulir', referensi: 'Referensi',
  kanvas: 'Kanvas (mis. BMC)', tahapan: 'Tahapan (mis. Design Thinking)',
  kalkulator: 'Kalkulator Keuangan', instrumen: 'Instrumen Wawancara',
  likert: 'Instrumen Berskala (Likert)',
  kesepakatan: 'Kesepakatan Kelompok', sejawat: 'Penilaian Sejawat',
  refleksi: 'Refleksi', sikap: 'Observasi Sikap'
};
