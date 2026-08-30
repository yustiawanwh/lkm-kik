// src/lib/data-nilai.js — Lapisan akses data untuk Penilaian (Fase 5).
import { supabase } from './supabase.js';
import { ambilSemua } from './query.js';

/** Antrean "Menunggu Penilaian" untuk satu penugasan. */
export async function daftarAntreanPenilaian(penugasanId) {
  const baris = await ambilSemua((dari, ke) =>
    supabase
      .from('progres_tugas')
      .select('*, tugas:tugas_id(*), profil:murid_id(nama), kelompok:kelompok_id(nama)')
      .eq('penugasan_id', penugasanId)
      .eq('status', 'review')
      .order('diserahkan_pada', { ascending: true })
      .range(dari, ke)
  );
  return baris;
}

/** Riwayat yang sudah dinilai (untuk rekap ringan di halaman yang sama). */
export async function daftarSudahDinilai(penugasanId) {
  return ambilSemua((dari, ke) =>
    supabase
      .from('progres_tugas')
      .select('*, tugas:tugas_id(judul, kode, xp), profil:murid_id(nama), kelompok:kelompok_id(nama)')
      .eq('penugasan_id', penugasanId)
      .eq('status', 'selesai')
      .order('disetujui_pada', { ascending: false })
      .range(dari, ke)
  );
}

/** Beri nilai lewat RPC nilai_tugas (migrasi 000900) — menghitung huruf,
 *  menerapkan penalti susulan, dan memberi XP dalam satu transaksi aman. */
export async function nilaiTugas(progresId, nilai, umpanBalik, nilaiRubrik = null) {
  const { data, error } = await supabase.rpc('nilai_tugas', {
    p_progres_id: progresId, p_nilai: nilai, p_umpan_balik: umpanBalik || null,
    p_nilai_rubrik: nilaiRubrik
  });
  if (error) throw error;
  return data;
}

/** Perbaiki nilai yang SUDAH diberikan (migrasi 001200): XP lama ditarik
 *  lebih dulu lewat entri negatif di buku_xp, lalu dinilai ulang — supaya
 *  XP tidak menumpuk dan jejak koreksinya tetap terlihat. */
export async function perbaikiNilai(progresId, nilai, umpanBalik, nilaiRubrik = null) {
  const { data, error } = await supabase.rpc('perbaiki_nilai', {
    p_progres_id: progresId, p_nilai: nilai, p_umpan_balik: umpanBalik || null,
    p_nilai_rubrik: nilaiRubrik
  });
  if (error) throw error;
  return data;
}

/** Ambil rubrik program (kalau guru mendefinisikannya). */
export async function ambilRubrikProgram(tujuanPembelajaranId) {
  const { data, error } = await supabase
    .from('tujuan_pembelajaran').select('rubrik').eq('id', tujuanPembelajaranId).maybeSingle();
  if (error) throw error;
  return data?.rubrik || null;
}

/** Anggota kelompok + faktor kontribusi yang sudah diatur (kalau ada),
 *  untuk satu progres_tugas kelompok. */
export async function daftarKontribusi(kelompokId, progresTugasId) {
  const { data: anggota, error: e1 } = await supabase
    .from('anggota_kelompok').select('*, profil:murid_id(nama)').eq('kelompok_id', kelompokId);
  if (e1) throw e1;

  const { data: kontribusi, error: e2 } = await supabase
    .from('kontribusi_individu').select('*').eq('progres_tugas_id', progresTugasId);
  if (e2) throw e2;

  const peta = new Map(kontribusi.map(k => [k.murid_id, k]));
  return anggota.map(a => ({
    muridId: a.murid_id, nama: a.profil?.nama || a.murid_id,
    peran: a.peran_dalam_kelompok,
    faktor: peta.get(a.murid_id)?.faktor ?? 1.0,
    catatan: peta.get(a.murid_id)?.catatan ?? ''
  }));
}

export async function simpanKontribusi(progresTugasId, muridId, faktor, catatan) {
  const { error } = await supabase.from('kontribusi_individu').upsert({
    progres_tugas_id: progresTugasId, murid_id: muridId, faktor, catatan: catatan || null
  }, { onConflict: 'progres_tugas_id,murid_id' });
  if (error) throw error;
}

/** Ambil isi lembar kerja yang dikerjakan murid/kelompok untuk satu misi.
 *  Lembar dicocokkan lewat tugas.lembar_kode (lihat migrasi 000820).
 *  Dipakai guru untuk MELIHAT hasil pekerjaan saat menilai. */
export async function isianUntukProgres(progres) {
  const kodeMentah = progres.tugas?.lembar_kode;
  if (!kodeMentah) return [];
  const kodeList = kodeMentah.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  if (kodeList.length === 0) return [];

  const { data: penugasan, error: eP } = await supabase
    .from('penugasan').select('tujuan_pembelajaran_id').eq('id', progres.penugasan_id).single();
  if (eP) throw eP;

  const { data: lembarList, error: eL } = await supabase
    .from('lembar_kerja').select('*').eq('tujuan_pembelajaran_id', penugasan.tujuan_pembelajaran_id);
  if (eL) throw eL;

  const cocok = lembarList.filter(l => kodeList.includes(l.kode.toLowerCase()));
  if (cocok.length === 0) return [];

  let q = supabase.from('isian_lembar').select('*')
    .eq('penugasan_id', progres.penugasan_id)
    .in('lembar_kerja_id', cocok.map(l => l.id));
  q = progres.kelompok_id ? q.eq('kelompok_id', progres.kelompok_id) : q.eq('murid_id', progres.murid_id);

  const { data: isianList, error: eI } = await q;
  if (eI) throw eI;

  return cocok.map(l => ({
    lembar: l,
    isian: isianList.find(i => i.lembar_kerja_id === l.id) || { id: null, data: {} }
  }));
}
