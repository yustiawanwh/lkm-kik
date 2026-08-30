// src/lib/tema.js — Mode terang/gelap.
// Urutan penentuan: pilihan manual pengguna → preferensi sistem operasi.
// Pilihan disimpan di localStorage; bila tidak tersedia (mis. mode privat
// yang ketat), aplikasi tetap jalan dan hanya mengikuti preferensi sistem.

const KUNCI = 'bvs-tema';

function bacaSimpanan() {
  try { return localStorage.getItem(KUNCI); } catch { return null; }
}

function tulisSimpanan(nilai) {
  try { localStorage.setItem(KUNCI, nilai); } catch { /* abaikan */ }
}

function preferensiSistem() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'gelap' : 'terang';
}

export function temaSaatIni() {
  return document.documentElement.getAttribute('data-tema') || 'terang';
}

export function terapkanTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
}

/** Dipanggil sekali saat aplikasi mulai. */
export function siapkanTema() {
  terapkanTema(bacaSimpanan() || preferensiSistem());

  // Ikuti perubahan pengaturan sistem selama pengguna belum memilih manual.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    if (!bacaSimpanan()) terapkanTema(e.matches ? 'gelap' : 'terang');
  });
}

/** Tukar terang ↔ gelap, sekaligus menyimpan pilihan pengguna. */
export function tukarTema() {
  const baru = temaSaatIni() === 'gelap' ? 'terang' : 'gelap';
  terapkanTema(baru);
  tulisSimpanan(baru);
  return baru;
}
