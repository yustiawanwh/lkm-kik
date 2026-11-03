// src/lib/data-susulan.js — Kelonggaran (susulan) per murid per sprint.
import { supabase } from './supabase.js';

export async function daftarSusulanPenugasan(penugasanId) {
  const { data, error } = await supabase
    .from('kelonggaran_sprint')
    .select('*, sprint:sprint_id(nama, nomor), profil:murid_id(nama)')
    .eq('penugasan_id', penugasanId)
    .order('dibuat_pada', { ascending: false });
  if (error) throw error;
  return data;
}

export async function beriSusulan({ penugasanId, sprintId, muridId, tenggatKhusus, penalti, diberikanOleh }) {
  const { data, error } = await supabase
    .from('kelonggaran_sprint')
    .upsert({
      penugasan_id: penugasanId, sprint_id: sprintId, murid_id: muridId,
      tenggat_khusus: tenggatKhusus, susulan: penalti, diberikan_oleh: diberikanOleh
    }, { onConflict: 'penugasan_id,sprint_id,murid_id' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function cabutSusulan(id) {
  const { error } = await supabase.from('kelonggaran_sprint').delete().eq('id', id);
  if (error) throw error;
}
