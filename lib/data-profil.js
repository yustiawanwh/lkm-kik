// src/lib/data-profil.js — Sunting profil (nama, NIS, nomor absen).
import { supabase } from './supabase.js';

export async function ambilProfil(id) {
  const { data, error } = await supabase.from('profil').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Perbarui data profil. Kolom "peran" sengaja tidak pernah dikirim dari
 *  sini — perubahan peran hanya lewat SQL oleh admin (lihat migrasi 001200). */
export async function updateProfil(id, { nama, nis, no_absen }) {
  const payload = {
    nama: (nama || '').trim(),
    nis: (nis || '').trim() || null,
    no_absen: no_absen === '' || no_absen === null || no_absen === undefined
      ? null : Number(no_absen)
  };
  if (!payload.nama) throw new Error('Nama tidak boleh kosong.');
  const { data, error } = await supabase
    .from('profil').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
