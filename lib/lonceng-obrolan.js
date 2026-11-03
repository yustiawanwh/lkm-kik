// src/lib/lonceng-obrolan.js — Penghitung pesan belum terbaca untuk lencana
// di menu sidebar.
//
// Dibuat sebagai modul bersama karena sidebar digambar ulang di setiap
// halaman. Bila tiap penggambaran memanggil database, satu sesi belajar
// bisa menghasilkan puluhan kueri yang tidak perlu. Di sini angkanya
// dihitung sekali, disimpan, lalu diperbarui lewat langganan realtime.
import { supabase } from './supabase.js';
import { hitungBelumTerbaca } from './data-obrolan.js';

let jumlah = 0;
let idPengguna = null;
let lepasKanal = null;
const pendengar = new Set();

function beriTahu() {
  for (const f of pendengar) {
    try { f(jumlah); } catch { /* jangan biarkan satu pendengar menggagalkan lainnya */ }
  }
}

/** Daftarkan fungsi yang dipanggil tiap angka berubah.
 *  Mengembalikan fungsi untuk berhenti mendengarkan. */
export function dengarkanLonceng(fn) {
  pendengar.add(fn);
  fn(jumlah);                       // langsung beri nilai terkini
  return () => pendengar.delete(fn);
}

export function jumlahBelumTerbaca() { return jumlah; }

/** Hitung ulang dari database. Dipanggil saat mulai dan setelah membaca. */
export async function segarkanLonceng() {
  if (!idPengguna) return;
  try {
    const peta = await hitungBelumTerbaca(idPengguna);
    jumlah = [...peta.values()].reduce((a, b) => a + b, 0);
    beriTahu();
  } catch { /* jaringan bermasalah — biarkan angka lama */ }
}

/** Mulai memantau. Aman dipanggil berulang; langganan lama dilepas dulu. */
export async function mulaiLonceng(profil) {
  hentikanLonceng();
  idPengguna = profil?.id || null;
  if (!idPengguna) return;

  await segarkanLonceng();

  // Pesan baru dari orang lain menambah angka tanpa perlu kueri ulang.
  // RLS tetap menyaring: murid hanya menerima pesan dari kanal yang boleh
  // ia baca, jadi angka ini tidak pernah bocor dari kanal orang lain.
  const kanal = supabase
    .channel('lonceng-obrolan')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pesan' }, (p) => {
      if (p.new?.pengirim_id === idPengguna) return;   // pesan sendiri tidak dihitung
      jumlah += 1;
      beriTahu();
    })
    .subscribe();

  lepasKanal = () => { supabase.removeChannel(kanal); };
}

export function hentikanLonceng() {
  lepasKanal?.();
  lepasKanal = null;
  idPengguna = null;
  jumlah = 0;
  beriTahu();
}
