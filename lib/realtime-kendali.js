// src/lib/realtime-kendali.js — Pantau perubahan kolom "kendali" pada baris
// pendaftaran murid secara realtime, supaya jeda/kunci dari guru langsung
// terasa di layar murid tanpa perlu refresh manual.
import { supabase } from './supabase.js';

/** Berlangganan perubahan pendaftaran (kendali) untuk satu murid.
 *  onBerubah(kendaliBaru, kelasId) dipanggil setiap ada UPDATE. Mengembalikan
 *  fungsi tinggalkan(). */
export function pantauKendali(muridId, onBerubah) {
  const kanal = supabase
    .channel(`kendali:${muridId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'pendaftaran', filter: `murid_id=eq.${muridId}`
    }, (payload) => {
      onBerubah(payload.new?.kendali, payload.new?.kelas_id);
    })
    .subscribe();

  return () => { supabase.removeChannel(kanal); };
}
