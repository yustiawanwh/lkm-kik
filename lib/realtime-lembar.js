// src/lib/realtime-lembar.js — Kanal realtime per isian_lembar: presence
// (siapa saja yang sedang membuka) + broadcast (jejak sel yang sedang
// diedit & perubahan sel langsung, tanpa menunggu simpan ke database).
import { supabase } from './supabase.js';

/** Bergabung ke kanal realtime untuk satu isian_lembar.
 *  Mengembalikan { siarkanSel, siarkanFokus, tinggalkan }. */
export function bergabungSaluranLembar(isianId, { profil, onSelDiubah, onPresenceBerubah }) {
  const channel = supabase.channel(`lembar:${isianId}`, {
    config: { presence: { key: profil.id } }
  });

  channel.on('broadcast', { event: 'sel_diubah' }, ({ payload }) => {
    if (payload.dariId !== profil.id) onSelDiubah?.(payload);
  });

  channel.on('presence', { event: 'sync' }, () => {
    onPresenceBerubah?.(channel.presenceState());
  });

  let siap = false;
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      siap = true;
      await channel.track({ id: profil.id, nama: profil.nama, selAktif: null });
    }
  });

  return {
    /** Kirim perubahan nilai satu sel ke anggota lain (efek langsung, di
     *  luar simpan-ke-database yang dilakukan terpisah lewat perbaruiSel). */
    siarkanSel(path, nilai) {
      if (!siap) return;
      channel.send({
        type: 'broadcast', event: 'sel_diubah',
        payload: { path, nilai, dariId: profil.id, dariNama: profil.nama }
      });
    },
    /** Beritahu anggota lain sel mana yang sedang difokus/diketik pengguna ini. */
    siarkanFokus(path) {
      if (!siap) return;
      channel.track({ id: profil.id, nama: profil.nama, selAktif: path });
    },
    tinggalkan() {
      supabase.removeChannel(channel);
    }
  };
}
