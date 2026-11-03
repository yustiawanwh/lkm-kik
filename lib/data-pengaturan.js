// src/lib/data-pengaturan.js — Akses tabel pengaturan (admin).
import { supabase } from './supabase.js';

export async function ambilSemuaPengaturan() {
  const { data, error } = await supabase.from('pengaturan').select('*');
  if (error) throw error;
  const peta = {};
  for (const baris of data) peta[baris.kunci] = baris.nilai;
  return peta;
}

export async function ambilPengaturan(kunci) {
  const { data, error } = await supabase.from('pengaturan').select('nilai').eq('kunci', kunci).maybeSingle();
  if (error) throw error;
  return data?.nilai ?? null;
}

export async function simpanPengaturan(kunci, nilai) {
  const { error } = await supabase.from('pengaturan').upsert({ kunci, nilai, diubah_pada: new Date().toISOString() });
  if (error) throw error;
}
