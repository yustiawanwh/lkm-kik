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
    .select('data, lembar:lembar_kerja_id(kode, judul, tipe, struktur)')
    .eq('penugasan_id', penugasanSumber)
    .eq('kelompok_id', kelompokId);
  hasil.lembar = (isian || []).map(i => ({ lembar: i.lembar, data: i.data }));

  return hasil;
}

/**
 * Ubah isian lembar menjadi daftar {label, teks} yang terbaca manusia.
 *
 * Tanpa ini, bahan yang ditarik tampil sebagai JSON mentah berisi kunci
 * seperti "m1" atau "k0" — guru tidak bisa tahu jawaban itu untuk
 * pertanyaan yang mana, sehingga bahannya tidak berguna.
 */
export function bacaIsianTerbaca(lembar, data) {
  const st = lembar?.struktur || {};
  const hasil = [];
  const bersih = (v) => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();

  // Formulir: kunci isian dipetakan ke labelnya.
  if (Array.isArray(st.medan) && st.medan.length) {
    for (const m of st.medan) {
      const v = bersih(data?.[m.key]);
      if (v) hasil.push({ label: m.label || m.key, teks: v });
    }
  }

  // Matriks / kalkulator: tiap baris dirangkai "Kolom: isi".
  if (Array.isArray(data?.baris) || (data?.baris && typeof data.baris === 'object')) {
    const kolom = st.kolom || [];
    const baris = Array.isArray(data.baris) ? data.baris : Object.values(data.baris);
    baris.forEach((row, i) => {
      const bagian = [];
      Object.keys(row || {}).forEach((k) => {
        const ki = Number(String(k).replace(/^k/, ''));
        const namaKolom = Number.isFinite(ki) ? (kolom[ki] || k) : k;
        const v = bersih(row[k]);
        if (v) bagian.push(`${namaKolom}: ${v}`);
      });
      if (bagian.length) hasil.push({ label: `Baris ${i + 1}`, teks: bagian.join(' · ') });
    });
  }

  // Likert: nomor butir dipetakan ke bunyi pernyataannya.
  if (data?.butir && typeof data.butir === 'object') {
    const butir = st.butir || [];
    for (const [no, nilai] of Object.entries(data.butir)) {
      const v = bersih(nilai);
      if (v) hasil.push({ label: butir[Number(no) - 1] || `Butir ${no}`, teks: v });
    }
  }

  // Sisa kunci yang belum tertangani (kanvas, tahapan, instrumen).
  const sudah = new Set([
    ...(st.medan || []).map(m => m.key), 'baris', 'butir'
  ]);
  for (const [k, v] of Object.entries(data || {})) {
    if (sudah.has(k)) continue;
    if (typeof v === 'object') continue;
    const t = bersih(v);
    if (t) hasil.push({ label: k, teks: t });
  }

  return hasil;
}

/**
 * Susun isi kartu secara OTOMATIS dari bahan satu kelompok.
 *
 * Seluruh jawaban kelompok pada penugasan sumber dimasukkan apa adanya,
 * dikelompokkan per lembar dan diberi label pertanyaannya. Guru tidak perlu
 * menyalin apa pun; cukup merapikan bila ingin.
 *
 * Bagian yang kosong TETAP ditulis sebagai "belum diisi". Itu bukan
 * kegagalan: kartu yang menunjukkan apa yang belum sempat dikerjakan justru
 * memberi tahu kelompok apa yang harus mereka putuskan sekarang.
 */
export function susunIsiOtomatis(bahan) {
  const isi = [];

  for (const l of bahan.lembar || []) {
    const jawaban = bacaIsianTerbaca(l.lembar, l.data);
    const judul = `${l.lembar?.kode ? l.lembar.kode + ' — ' : ''}${l.lembar?.judul || 'Lembar'}`;
    isi.push({
      label: judul,
      teks: jawaban.length
        ? jawaban.map(j => `${j.label}: ${j.teks}`).join('\n')
        : '(belum diisi kelompokmu pada pertemuan sebelumnya)'
    });
  }

  const ringkas = ringkasTanggapan(bahan.tanggapan || []);
  isi.push({
    label: 'Tanggapan kelompok lain',
    teks: ringkas || '(belum ada tanggapan dari kelompok lain)'
  });

  if (isi.length === 1 && !ringkas) {
    return [{
      label: 'Catatan',
      teks: 'Kelompokmu belum sempat mengisi apa pun pada pertemuan sebelumnya. ' +
            'Mulailah dari menyepakati masalah dan gagasan kelompok hari ini.'
    }];
  }
  return isi;
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
