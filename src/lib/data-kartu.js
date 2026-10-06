// src/lib/data-kartu.js — Kartu Awal Kelompok.
//
// Ringkasan hasil kerja kelompok pada TP sebelumnya, dibaca kembali sebagai
// bahan rujukan pada TP berikutnya. Berbeda dari Materi Awal yang sama untuk
// seluruh kelas: tiap kelompok hanya melihat kartunya sendiri (dijaga RLS).
import { supabase } from './supabase.js';

export const LABEL_BAWAAN = [
  'Masalah yang kalian gali',
  'Gagasan terpilih kelompokmu',
  'Pengguna yang kalian sebut',
  'Kebaruan yang kalian klaim',
  'Tanggapan kelompok lain',
  'Pertanyaan Pemandu'
];

export async function daftarKartuAwal(penugasanId) {
  const { data, error } = await supabase
    .from('kartu_awal').select('*, kelompok:kelompok_id(id, nama)')
    .eq('penugasan_id', penugasanId);
  if (error) throw error;
  return data;
}

/** Kartu milik kelompok murid yang sedang masuk. RLS sudah menyaring,
 *  jadi kueri ini aman dipanggil murid. */
export async function kartuAwalSaya(penugasanId) {
  const { data, error } = await supabase
    .from('kartu_awal').select('*, kelompok:kelompok_id(nama)')
    .eq('penugasan_id', penugasanId).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function simpanKartuAwal({ id, penugasanId, kelompokId, judul, isi, penugasanSumber }) {
  const baris = {
    penugasan_id: penugasanId, kelompok_id: kelompokId,
    judul: judul || null, isi: isi || [],
    penugasan_sumber: penugasanSumber || null
  };
  const q = id
    ? supabase.from('kartu_awal').update(baris).eq('id', id)
    : supabase.from('kartu_awal').upsert(baris, { onConflict: 'penugasan_id,kelompok_id' });
  const { data, error } = await q.select('*, kelompok:kelompok_id(id, nama)').single();
  if (error) throw error;
  return data;
}

export async function hapusKartuAwal(id) {
  const { error } = await supabase.from('kartu_awal').delete().eq('id', id);
  if (error) throw error;
}

/** Penugasan lain di kelas yang sama, sebagai calon sumber data. */
export async function penugasanSekelas(kelasId, kecualiId) {
  const { data, error } = await supabase
    .from('penugasan')
    .select('id, tenggat, tujuan_pembelajaran:tujuan_pembelajaran_id(kode, judul)')
    .eq('kelas_id', kelasId).neq('id', kecualiId);
  if (error) throw error;
  return data;
}

/**
 * Tarik bahan kartu dari penugasan sumber untuk satu kelompok.
 *
 * Yang ditarik otomatis hanya TANGGAPAN PAMERAN, karena bentuknya
 * terstruktur dan maknanya pasti. Jawaban lembar kerja ikut dibawa sebagai
 * bahan mentah untuk dipilih guru sendiri — nama isian berbeda-beda tiap
 * program, jadi menebak mana "masalah" dan mana "gagasan" secara otomatis
 * akan sering salah dan justru menyesatkan.
 */
export async function tarikBahanKartu(penugasanSumber, kelompokId) {
  const hasil = { tanggapan: [], lembar: [] };

  const { data: tg } = await supabase
    .from('tanggapan_pameran')
    .select('jenis, isi, kelompok_asal:kelompok_penulis(nama)')
    .eq('penugasan_id', penugasanSumber)
    .eq('kelompok_tujuan', kelompokId)
    .eq('disembunyikan', false);
  hasil.tanggapan = tg || [];

  const { data: isian } = await supabase
    .from('isian_lembar')
    .select('data, lembar:lembar_kerja_id(kode, judul)')
    .eq('penugasan_id', penugasanSumber)
    .eq('kelompok_id', kelompokId);
  hasil.lembar = (isian || []).map(i => ({ lembar: i.lembar, data: i.data }));

  return hasil;
}

/** Susun tanggapan menjadi satu paragraf siap tempel. */
export function ringkasTanggapan(tanggapan) {
  if (!tanggapan.length) return '';
  const urut = { pertanyaan: 0, saran: 1, pujian: 2 };
  const label = { pertanyaan: 'Bertanya', saran: 'Menyarankan', pujian: 'Memuji' };
  return [...tanggapan]
    .sort((a, b) => (urut[a.jenis] ?? 9) - (urut[b.jenis] ?? 9))
    .map((t, i) => `(${i + 1}) ${label[t.jenis] || t.jenis}: ${t.isi}`)
    .join(' ');
}
