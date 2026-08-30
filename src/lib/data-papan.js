// src/lib/data-papan.js — Lapisan akses data untuk Papan Misi murid (Fase 3).
import { supabase } from './supabase.js';
import { ambilSemua } from './query.js';

export async function ambilPenugasan(penugasanId) {
  const { data, error } = await supabase
    .from('penugasan')
    .select('*, kelas:kelas_id(*), tujuan_pembelajaran:tujuan_pembelajaran_id(*)')
    .eq('id', penugasanId).single();
  if (error) throw error;
  return data;
}

/** Struktur lengkap program: sprint berisi tugas, terurut. */
export async function ambilStrukturProgram(tujuanPembelajaranId) {
  const { data: sprints, error: e1 } = await supabase
    .from('sprint').select('*').eq('tujuan_pembelajaran_id', tujuanPembelajaranId).order('nomor');
  if (e1) throw e1;
  const { data: tugas, error: e2 } = await supabase
    .from('tugas').select('*').in('sprint_id', sprints.map(s => s.id) || ['00000000-0000-0000-0000-000000000000']).order('urutan');
  if (e2) throw e2;
  return sprints.map(s => ({ ...s, tugas: tugas.filter(t => t.sprint_id === s.id) }));
}

/** Kelompok murid pada kelas tertentu (null kalau belum tergabung kelompok). */
export async function ambilKelompokSaya(kelasId, muridId) {
  const { data, error } = await supabase
    .from('anggota_kelompok')
    .select('kelompok_id, kelompok:kelompok_id(id, nama, kelas_id)')
    .eq('murid_id', muridId);
  if (error) throw error;
  const cocok = data.find(r => r.kelompok?.kelas_id === kelasId);
  return cocok ? cocok.kelompok : null;
}

/** Semua baris progres murid (mandiri) + kelompoknya untuk satu penugasan. */
export async function ambilProgresPenugasan(penugasanId, muridId, kelompokId) {
  let query = supabase.from('progres_tugas').select('*').eq('penugasan_id', penugasanId);
  if (kelompokId) {
    query = query.or(`murid_id.eq.${muridId},kelompok_id.eq.${kelompokId}`);
  } else {
    query = query.eq('murid_id', muridId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Ambil baris progres untuk satu tugas, buat kalau belum ada ("ambil-atau-buat"). */
export async function ambilAtauBuatProgres({ penugasanId, tugas, muridId, kelompokId }) {
  const kolomPemilik = tugas.sifat_kerja === 'kelompok' ? 'kelompok_id' : 'murid_id';
  const nilaiPemilik = tugas.sifat_kerja === 'kelompok' ? kelompokId : muridId;
  if (tugas.sifat_kerja === 'kelompok' && !kelompokId) {
    throw new Error('Misi ini dikerjakan berkelompok — Anda belum tergabung di kelompok manapun pada kelas ini. Hubungi guru Anda.');
  }

  const { data: adaData, error: e1 } = await supabase
    .from('progres_tugas').select('*')
    .eq('penugasan_id', penugasanId).eq('tugas_id', tugas.id).eq(kolomPemilik, nilaiPemilik)
    .maybeSingle();
  if (e1) throw e1;
  if (adaData) return adaData;

  const payload = {
    penugasan_id: penugasanId, tugas_id: tugas.id, status: 'backlog',
    [kolomPemilik]: nilaiPemilik
  };
  const { data: baru, error: e2 } = await supabase.from('progres_tugas').insert(payload).select().single();
  if (e2) {
    // Kondisi balapan: baris keburu dibuat murid lain di kelompok yang sama —
    // ambil ulang alih-alih gagal.
    if (/duplicate key/i.test(e2.message)) {
      const { data: ulang } = await supabase
        .from('progres_tugas').select('*')
        .eq('penugasan_id', penugasanId).eq('tugas_id', tugas.id).eq(kolomPemilik, nilaiPemilik)
        .single();
      return ulang;
    }
    throw e2;
  }
  return baru;
}

export async function ubahStatusProgres(id, status) {
  const payload = { status };
  if (status === 'dikerjakan') payload.dimulai_pada = new Date().toISOString();
  if (status === 'review') payload.diserahkan_pada = new Date().toISOString();
  const { data, error } = await supabase.from('progres_tugas').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Simpan detik_terpakai — dipanggil berkala oleh timer (penyimpanan andal). */
export async function simpanDetikTerpakai(id, detik) {
  const { error } = await supabase.from('progres_tugas').update({ detik_terpakai: detik }).eq('id', id);
  if (error) throw error;
}

/** Guru: semua baris progres untuk satu penugasan, LINTAS SELURUH MURID —
 *  bisa mudah > 1000 baris di kelas besar, wajib paginasi (lihat lib/query.js). */
export async function ambilSemuaProgresPenugasan(penugasanId) {
  return ambilSemua((dari, ke) =>
    supabase.from('progres_tugas').select('*').eq('penugasan_id', penugasanId).range(dari, ke)
  );
}
