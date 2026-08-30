// src/lib/data-pantau.js — Data untuk Pantau Langsung (guru).
import { supabase } from './supabase.js';
import { ambilSemua } from './query.js';

/** Ambil semua bahan untuk papan pantau satu penugasan. */
export async function ambilBahanPantau(penugasanId) {
  const { data: penugasan, error: eP } = await supabase
    .from('penugasan')
    .select('*, kelas:kelas_id(id, nama), tujuan_pembelajaran:tujuan_pembelajaran_id(id, judul)')
    .eq('id', penugasanId).single();
  if (eP) throw eP;

  const { data: sprints, error: eS } = await supabase
    .from('sprint').select('*').eq('tujuan_pembelajaran_id', penugasan.tujuan_pembelajaran_id).order('nomor');
  if (eS) throw eS;

  const idSprint = sprints.map(s => s.id);
  let tugas = [];
  if (idSprint.length) {
    const { data, error } = await supabase
      .from('tugas').select('*').in('sprint_id', idSprint).order('urutan');
    if (error) throw error;
    tugas = data.map(t => ({ ...t, sprintNomor: sprints.find(s => s.id === t.sprint_id)?.nomor ?? 0 }));
  }

  const { data: kelompok, error: eK } = await supabase
    .from('kelompok').select('*, anggota_kelompok(murid_id, profil:murid_id(nama))')
    .eq('kelas_id', penugasan.kelas_id).order('nama');
  if (eK) throw eK;

  const { data: pendaftaran, error: eD } = await supabase
    .from('pendaftaran').select('murid_id, kendali, profil:murid_id(id, nama, no_absen)')
    .eq('kelas_id', penugasan.kelas_id);
  if (eD) throw eD;

  const progres = await ambilSemua((dari, ke) =>
    supabase.from('progres_tugas')
      .select('id, tugas_id, murid_id, kelompok_id, status, detik_terpakai, dimulai_pada, diserahkan_pada, nilai_huruf')
      .eq('penugasan_id', penugasanId).range(dari, ke)
  );

  const murid = pendaftaran
    .map(p => ({ ...p.profil, kendali: p.kendali }))
    .sort((a, b) => (a.no_absen ?? 999) - (b.no_absen ?? 999) || (a.nama || '').localeCompare(b.nama || ''));

  return { penugasan, sprints, tugas, kelompok, murid, progres };
}

/** Berlangganan perubahan progres pada satu penugasan.
 *  onUbah(baris) dipanggil setiap ada INSERT/UPDATE. Mengembalikan fungsi
 *  untuk berhenti berlangganan. */
export function pantauProgres(penugasanId, onUbah) {
  const kanal = supabase
    .channel(`pantau:${penugasanId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'progres_tugas',
      filter: `penugasan_id=eq.${penugasanId}`
    }, (payload) => {
      if (payload.new?.id) onUbah(payload.new);
    })
    .subscribe();
  return () => { supabase.removeChannel(kanal); };
}
