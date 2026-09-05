// src/lib/data-lembar.js — Lapisan akses data untuk Lembar Kerja murid (Fase 4).
import { supabase } from './supabase.js';

export async function daftarLembarProgram(tujuanPembelajaranId) {
  const { data, error } = await supabase
    .from('lembar_kerja').select('*')
    .eq('tujuan_pembelajaran_id', tujuanPembelajaranId)
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data;
}

export async function ambilLembar(id) {
  const { data, error } = await supabase.from('lembar_kerja').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Apakah lembar ini ditautkan ke suatu misi (lewat tugas.lembar_kode)?
 *  Lembar yang tertaut hanya boleh diisi dari dalam misi, selagi timernya
 *  berjalan — kalau tidak, kunci timer bisa ditembus lewat halaman lembar. */
export async function misiPenaut(lembar, tujuanPembelajaranId) {
  const { data: sprints, error: e1 } = await supabase
    .from('sprint').select('id').eq('tujuan_pembelajaran_id', tujuanPembelajaranId);
  if (e1) throw e1;
  if (!sprints.length) return null;

  const { data: tugasList, error: e2 } = await supabase
    .from('tugas').select('kode, judul, lembar_kode')
    .in('sprint_id', sprints.map(x => x.id))
    .not('lembar_kode', 'is', null);
  if (e2) throw e2;

  const kode = lembar.kode.toLowerCase();
  return tugasList.find(t =>
    (t.lembar_kode || '').split(',').map(k => k.trim().toLowerCase()).includes(kode)
  ) || null;
}

export async function anggotaKelompokLembar(kelompokId) {
  const { data, error } = await supabase
    .from('anggota_kelompok').select('*, profil:murid_id(nama)').eq('kelompok_id', kelompokId);
  if (error) throw error;
  return data;
}

/** Ambil baris isian, buat kalau belum ada ("ambil-atau-buat"), sama seperti
 *  pola di data-papan.js untuk progres_tugas. */
export async function ambilAtauBuatIsian({ lembarKerjaId, penugasanId, milikKelompok, muridId, kelompokId }) {
  const kolomPemilik = milikKelompok ? 'kelompok_id' : 'murid_id';
  const nilaiPemilik = milikKelompok ? kelompokId : muridId;
  if (milikKelompok && !kelompokId) {
    throw new Error('Lembar ini dikerjakan berkelompok — Anda belum tergabung di kelompok manapun pada kelas ini.');
  }

  /** Ambil satu baris isian. Sengaja memakai limit(1), BUKAN maybeSingle():
   *  maybeSingle melempar galat bila menemukan lebih dari satu baris, dan
   *  duplikat semacam itu pernah terbentuk saat beberapa anggota kelompok
   *  membuka lembar bersamaan. Dengan limit(1), lembar tetap bisa dibuka
   *  walaupun kebersihan datanya belum sempurna. */
  async function cari() {
    const { data, error } = await supabase
      .from('isian_lembar').select('*')
      .eq('lembar_kerja_id', lembarKerjaId)
      .eq('penugasan_id', penugasanId)
      .eq(kolomPemilik, nilaiPemilik)
      .order('diubah_pada', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }

  const ada = await cari();
  if (ada) return ada;

  const { data: baru, error: e2 } = await supabase
    .from('isian_lembar')
    .insert({ lembar_kerja_id: lembarKerjaId, penugasan_id: penugasanId, data: {}, [kolomPemilik]: nilaiPemilik })
    .select().single();

  if (e2) {
    // Anggota lain menang balapan dan barisnya sudah terbentuk lebih dulu —
    // dijamin batasan unik dari migrasi 002400. Ambil saja punya mereka.
    const ulang = await cari();
    if (ulang) return ulang;
    throw e2;
  }
  return baru;
}


/** Perbarui SATU sel secara atomik lewat RPC (migrasi 000700) — aman dari
 *  tabrakan saat beberapa anggota kelompok mengedit sel berbeda bersamaan. */
export async function perbaruiSel(isianId, path, nilai) {
  const { data, error } = await supabase.rpc('perbarui_sel_lembar', {
    p_isian_id: isianId, p_path: path, p_nilai: nilai
  });
  if (error) throw error;
  return data;
}

/** Ganti seluruh objek data (dipakai untuk operasi jarang: tambah/hapus
 *  baris pada tipe Matriks/Daftar — bukan untuk tiap ketikan). */
export async function timpaData(isianId, data) {
  const { data: hasil, error } = await supabase
    .from('isian_lembar').update({ data }).eq('id', isianId).select().single();
  if (error) throw error;
  return hasil;
}
