// src/lib/data-peran.js — Peran fungsional anggota kelompok, per penugasan.
//
// Peran di sini TERIKAT PADA SATU PENUGASAN (satu TP). Pada TP berikutnya
// kelompok boleh membagi perannya dengan cara yang sama sekali lain, dan
// riwayat TP sebelumnya tetap utuh. Supaya guru tidak mengetik ulang
// katalog perannya tiap TP, tersedia penyalinan antar penugasan dan
// ekspor/impor JSON.
import { supabase } from './supabase.js';

// ---------- Katalog peran ----------

export async function daftarPeranTp(penugasanId) {
  const { data, error } = await supabase
    .from('peran_tp').select('*')
    .eq('penugasan_id', penugasanId)
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data;
}

export async function simpanPeran({ id, penugasanId, nama, deskripsi, labelCatatan, urutan }) {
  const baris = {
    penugasan_id: penugasanId,
    nama: (nama || '').trim(),
    deskripsi: (deskripsi || '').trim() || null,
    label_catatan: (labelCatatan || '').trim() || null,
    urutan: Number(urutan) || 0
  };
  const q = id
    ? supabase.from('peran_tp').update(baris).eq('id', id)
    : supabase.from('peran_tp').insert(baris);
  const { data, error } = await q.select('*').single();
  if (error) throw error;
  return data;
}

export async function hapusPeran(id) {
  const { error } = await supabase.from('peran_tp').delete().eq('id', id);
  if (error) throw error;
}

/** Simpan ulang seluruh katalog sekaligus, mengikuti urutan di layar.
 *  Dipakai setelah guru menyusun/menggeser daftar peran. */
export async function simpanUrutanPeran(daftar) {
  for (let i = 0; i < daftar.length; i++) {
    const p = daftar[i];
    if (p.urutan === i) continue;
    const { error } = await supabase.from('peran_tp').update({ urutan: i }).eq('id', p.id);
    if (error) throw error;
  }
}

// ---------- Pemegang peran ----------

export async function daftarPemegangPeran(penugasanId) {
  const { data, error } = await supabase
    .from('pemegang_peran')
    .select('*, peran:peran_id(id, nama, deskripsi, label_catatan, urutan), profil:murid_id(id, nama, no_absen)')
    .eq('penugasan_id', penugasanId);
  if (error) throw error;
  return data;
}

/** Pembagian peran kelompok murid yang sedang masuk. RLS sudah menyaring,
 *  jadi aman dipanggil dari akun murid. */
export async function peranKelompokSaya(penugasanId, kelompokId) {
  if (!kelompokId) return [];
  const { data, error } = await supabase
    .from('pemegang_peran')
    .select('*, peran:peran_id(id, nama, deskripsi, label_catatan, urutan), profil:murid_id(id, nama, no_absen)')
    .eq('penugasan_id', penugasanId)
    .eq('kelompok_id', kelompokId);
  if (error) throw error;
  return data;
}

export async function berikanPeran({ penugasanId, peranId, kelompokId, muridId, catatan }) {
  const { data, error } = await supabase.from('pemegang_peran')
    .upsert({
      penugasan_id: penugasanId, peran_id: peranId,
      kelompok_id: kelompokId, murid_id: muridId,
      catatan: (catatan || '').trim() || null
    }, { onConflict: 'peran_id,murid_id' })
    .select('*, peran:peran_id(id, nama, deskripsi, label_catatan, urutan), profil:murid_id(id, nama, no_absen)')
    .single();
  if (error) throw error;
  return data;
}

export async function ubahCatatanPeran(id, catatan) {
  const { error } = await supabase.from('pemegang_peran')
    .update({ catatan: (catatan || '').trim() || null }).eq('id', id);
  if (error) throw error;
}

export async function cabutPeran(id) {
  const { error } = await supabase.from('pemegang_peran').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Ekspor / impor ----------

/** Bentuk JSON yang bisa disimpan guru di luar aplikasi atau ditempel ke
 *  penugasan lain, termasuk di kelas atau sekolah lain. */
export function keJson(daftarPeran) {
  return JSON.stringify({
    jenis: 'peran-tp', versi: 1,
    peran: daftarPeran.map(p => ({
      nama: p.nama, deskripsi: p.deskripsi || '',
      label_catatan: p.label_catatan || ''
    }))
  }, null, 2);
}

/** Baca JSON hasil ekspor. Melempar galat berbunyi manusia bila bentuknya
 *  tidak cocok — pesan "Unexpected token" tidak memberi tahu guru apa pun. */
export function dariJson(teks) {
  let obj;
  try { obj = JSON.parse(teks); }
  catch { throw new Error('Teks yang ditempel bukan JSON yang sah. Pastikan seluruh isinya tersalin, termasuk tanda { dan } di ujungnya.'); }
  const daftar = Array.isArray(obj) ? obj : obj?.peran;
  if (!Array.isArray(daftar)) throw new Error('JSON tidak berisi daftar "peran".');
  const bersih = daftar
    .map(p => ({
      nama: String(p?.nama ?? '').trim(),
      deskripsi: String(p?.deskripsi ?? '').trim(),
      label_catatan: String(p?.label_catatan ?? '').trim()
    }))
    .filter(p => p.nama !== '');
  if (bersih.length === 0) throw new Error('Tidak ada peran bernama di dalam JSON itu.');
  return bersih;
}

/**
 * Masukkan daftar peran ke sebuah penugasan.
 *
 * Peran yang namanya sudah ada DILEWATI, bukan diganti: nama peran adalah
 * kunci yang menghubungkan peran dengan pemegangnya, sehingga menimpanya
 * akan memutus pembagian yang sudah berjalan.
 */
export async function imporPeran(penugasanId, daftar, { mulaiUrutan = 0 } = {}) {
  const adaSekarang = await daftarPeranTp(penugasanId);
  const namaAda = new Set(adaSekarang.map(p => p.nama.toLowerCase()));
  let dibuat = 0, dilewati = 0;
  let urutan = Math.max(mulaiUrutan, adaSekarang.length);

  for (const p of daftar) {
    if (namaAda.has(p.nama.toLowerCase())) { dilewati++; continue; }
    await simpanPeran({
      penugasanId, nama: p.nama, deskripsi: p.deskripsi,
      labelCatatan: p.label_catatan, urutan: urutan++
    });
    namaAda.add(p.nama.toLowerCase());
    dibuat++;
  }
  return { dibuat, dilewati };
}

/**
 * Salin katalog peran dari penugasan lain, dan — bila diminta — ikut
 * menyalin siapa memegang peran apa.
 *
 * Pembagian pemegang hanya bisa disalin bila kedua penugasan berada di
 * KELAS YANG SAMA; di kelas lain, id kelompok dan id murid berbeda sehingga
 * salinannya pasti salah sasaran. Karena itu pemanggil wajib mengirim
 * `kelasSama`, dan fungsinya melaporkan apa yang benar-benar dilakukan.
 */
export async function salinPeranDariPenugasan(dariId, keId, { ikutPemegang = false, kelasSama = false } = {}) {
  const asal = await daftarPeranTp(dariId);
  if (asal.length === 0) throw new Error('Penugasan sumber belum punya daftar peran.');

  const hasil = await imporPeran(keId, asal.map(p => ({
    nama: p.nama, deskripsi: p.deskripsi || '', label_catatan: p.label_catatan || ''
  })));

  let pemegangDisalin = 0;
  if (ikutPemegang && kelasSama) {
    // Petakan nama peran → id peran di penugasan tujuan.
    const tujuan = await daftarPeranTp(keId);
    const petaNama = new Map(tujuan.map(p => [p.nama.toLowerCase(), p.id]));
    const pemegang = await daftarPemegangPeran(dariId);
    for (const pm of pemegang) {
      const peranId = petaNama.get((pm.peran?.nama || '').toLowerCase());
      if (!peranId) continue;
      try {
        await berikanPeran({
          penugasanId: keId, peranId,
          kelompokId: pm.kelompok_id, muridId: pm.murid_id,
          catatan: pm.catatan
        });
        pemegangDisalin++;
      } catch { /* mis. murid sudah keluar dari kelompok — lewati saja */ }
    }
  }
  return { ...hasil, pemegangDisalin, pemegangDilewati: ikutPemegang && !kelasSama };
}

/** Peran bawaan yang sering dipakai, supaya guru tidak mulai dari nol. */
export const CONTOH_PERAN = {
  'Inkuiri Kolaboratif (5 peran)': [
    { nama: 'Manajer Proyek', deskripsi: 'Menjaga waktu dan memastikan semua bagian terisi.', label_catatan: '' },
    { nama: 'Pewawancara', deskripsi: 'Bertanya kepada calon pengguna dan mencatat jawabannya.', label_catatan: '' },
    { nama: 'Pencatat', deskripsi: 'Menulis hasil diskusi ke lembar kerja.', label_catatan: '' },
    { nama: 'Penelaah Teknis', deskripsi: 'Menilai apakah gagasan bisa dikerjakan dengan alat yang ada.', label_catatan: '' },
    { nama: 'Juru Bicara', deskripsi: 'Memaparkan hasil kelompok saat pameran gagasan.', label_catatan: '' }
  ],
  // Nama dan tugasnya mengikuti LKM TP 11.6 Bagian 2 apa adanya, supaya guru
  // tidak perlu menerjemahkan ulang dari kertas ke layar.
  'Proyek Web GitHub (6 peran) — TP 11.6': [
    { nama: 'Pemandu Diskusi', deskripsi: 'Pemilik repository: membuatnya dari template, mengundang anggota, memastikan semua halaman masuk.', label_catatan: 'Username GitHub' },
    { nama: 'Pencatat', deskripsi: 'Menyalin Kanvas Konsep Produk ke file README.md.', label_catatan: 'Username GitHub' },
    { nama: 'Penjaga Waktu', deskripsi: 'Membuat Issues (satu tugas per halaman) dan memantau semuanya tertutup.', label_catatan: 'Username GitHub' },
    { nama: 'Penanya Kritis', deskripsi: 'Peninjau: memberi komentar "Bagaimana jika …?" pada commit teman, mencocokkan dengan kanvas.', label_catatan: 'Username GitHub' },
    { nama: 'Juru Bicara', deskripsi: 'Menulis tanggapan di repository kelompok peninjau dan menyampaikan konsep kelompok.', label_catatan: 'Username GitHub' },
    { nama: 'Pengembang Front-End', deskripsi: 'Mengurus index.html dan style.css, menyalakan GitHub Pages, membantu teman yang macet.', label_catatan: 'Username GitHub' }
  ]
};
