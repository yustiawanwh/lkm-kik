// src/lib/data-lampiran.js — Bukti karya (lampiran) untuk satu progres_tugas.
import { supabase } from './supabase.js';
import { unggahBukti, hapusBuktiDariStorage } from './bukti.js';

export async function daftarLampiran(progresTugasId) {
  const { data, error } = await supabase
    .from('lampiran').select('*').eq('progres_tugas_id', progresTugasId).order('dibuat_pada');
  if (error) throw error;
  return data;
}

/** Unggah satu berkas dan catat baris lampiran-nya. pemilik: { muridId } atau { kelompokId }. */
export async function tambahLampiran({ progresTugasId, file, muridId, kelompokId }) {
  const { path, sidik } = await unggahBukti(file);
  const payload = {
    progres_tugas_id: progresTugasId, nama_asli: file.name, path, mime: file.type, ukuran: file.size, sidik,
    murid_id: kelompokId ? null : muridId, kelompok_id: kelompokId || null
  };
  const { data, error } = await supabase.from('lampiran').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function hapusLampiran(lampiran) {
  await hapusBuktiDariStorage(lampiran.path);
  const { error } = await supabase.from('lampiran').delete().eq('id', lampiran.id);
  if (error) throw error;
}
