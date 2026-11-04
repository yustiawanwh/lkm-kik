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

/**
 * Username GitHub tiap anggota kelompok.
 *
 * Dua hal yang membuat fungsi ini tidak sesederhana "baca peran TP ini":
 *
 * 1. DAFTAR ANGGOTA diambil dari anggota_kelompok, bukan dari pemegang
 *    peran. Kalau diambil dari peran, tabel kontribusi akan kosong selama
 *    pembagian peran belum dilakukan — padahal commit-nya sudah ada dan
 *    gurunya ingin melihat.
 *
 * 2. USERNAME dicari LINTAS PENUGASAN. Murid yang sudah menuliskan
 *    username-nya pada TP sebelumnya tidak perlu menuliskannya lagi. Yang
 *    dipakai: catatan pada penugasan ini kalau ada, kalau tidak catatan
 *    terbaru dari penugasan mana pun yang guru ini ampu.
 *
 * Hanya peran yang kolom tambahannya memang tentang GitHub yang dibaca.
 * Kolom catatan bersifat bebas — pada TP lain bisa saja berisi nomor HP
 * atau nama alat, dan memperlakukannya sebagai username akan mencocokkan
 * commit ke orang yang salah.
 */
export async function usernameKelompok(penugasanId, kelompokId) {
  const { data: roster, error: eRoster } = await supabase
    .from('anggota_kelompok')
    .select('murid_id, peran_dalam_kelompok, profil:murid_id(id, nama, no_absen)')
    .eq('kelompok_id', kelompokId);
  if (eRoster) throw eRoster;

  const anggota = (roster || []).map(a => ({
    murid_id: a.murid_id,
    nama: a.profil?.nama || 'Murid',
    no_absen: a.profil?.no_absen,
    ketua: a.peran_dalam_kelompok === 'ketua',
    username: '',
    dariTpLain: false
  })).sort((a, b) => (a.no_absen ?? 999) - (b.no_absen ?? 999));

  if (anggota.length === 0) return [];

  const { data: peran, error: ePeran } = await supabase
    .from('pemegang_peran')
    .select('murid_id, catatan, penugasan_id, dibuat_pada, peran:peran_id(label_catatan)')
    .in('murid_id', anggota.map(a => a.murid_id))
    .not('catatan', 'is', null)
    .order('dibuat_pada', { ascending: false });
  if (ePeran) throw ePeran;

  const relevan = (peran || []).filter(r =>
    /github/i.test(r.peran?.label_catatan || '') && (r.catatan || '').trim() !== '');

  const peta = new Map(anggota.map(a => [a.murid_id, a]));
  // Penugasan ini didahulukan; sisanya sudah urut dari yang terbaru.
  for (const r of [...relevan.filter(x => x.penugasan_id === penugasanId),
                   ...relevan.filter(x => x.penugasan_id !== penugasanId)]) {
    const a = peta.get(r.murid_id);
    if (!a || a.username) continue;
    a.username = r.catatan.trim().replace(/^@/, '');
    a.dariTpLain = r.penugasan_id !== penugasanId;
  }

  return anggota;
}

/**
 * Cari alamat repositori kelompok ini, menengok ke mana pun alamat itu
 * mungkin sudah pernah ditulis.
 *
 * Urutan penelusuran dipilih dari yang paling dapat dipercaya:
 *   1. lembar kerja penugasan INI — paling mutakhir, ditulis murid sendiri;
 *   2. alamat yang sudah disetel guru pada penugasan lain — sudah terverifikasi;
 *   3. lembar kerja penugasan lain — bisa jadi repo lama, tetapi lebih baik
 *      daripada guru mengetik tujuh alamat satu per satu.
 *
 * Kelompok itu sendiri tetap sama antar penugasan (kelompok_id milik kelas,
 * bukan milik penugasan), jadi penelusuran lintas TP ini sah.
 */
export async function cariAlamatRepo(penugasanId, kelompokId, uraikanRepo) {
  const bacaDariIsian = async (samaDenganIni) => {
    let q = supabase.from('isian_lembar')
      .select('data, penugasan_id, penugasan:penugasan_id(tujuan_pembelajaran:tujuan_pembelajaran_id(kode, judul))')
      .eq('kelompok_id', kelompokId);
    q = samaDenganIni ? q.eq('penugasan_id', penugasanId) : q.neq('penugasan_id', penugasanId);
    const { data, error } = await q;
    if (error) throw error;
    for (const baris of data || []) {
      const petik = JSON.stringify(baris.data || {})
        .match(/github\.com[/:][A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/);
      const r = petik ? uraikanRepo(petik[0]) : null;
      if (r) {
        return {
          ...r,
          sumber: samaDenganIni ? 'lembar kerja TP ini' : 'lembar kerja TP lain',
          tp: baris.penugasan?.tujuan_pembelajaran?.kode || null
        };
      }
    }
    return null;
  };

  const dariSini = await bacaDariIsian(true);
  if (dariSini) return dariSini;

  const { data: lain, error } = await supabase
    .from('repo_kelompok')
    .select('pemilik, nama, penugasan_id, penugasan:penugasan_id(tujuan_pembelajaran:tujuan_pembelajaran_id(kode))')
    .eq('kelompok_id', kelompokId).neq('penugasan_id', penugasanId)
    .not('pemilik', 'is', null)
    .order('diubah_pada', { ascending: false }).limit(1);
  if (error) throw error;
  if (lain && lain[0]) {
    return {
      pemilik: lain[0].pemilik, nama: lain[0].nama,
      sumber: 'alamat yang sudah disetel di TP lain',
      tp: lain[0].penugasan?.tujuan_pembelajaran?.kode || null
    };
  }

  return await bacaDariIsian(false);
}
