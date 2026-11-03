// src/lib/rute.js — Router hash sederhana dengan segmen dinamis (":id").

/** Cocokkan hash saat ini terhadap daftar pola rute.
 *  pola: string seperti "#/guru/program/:id"
 *  Mengembalikan { pola, params } dari kecocokan pertama, atau null. */
export function cocokkanRute(hash, daftarPola) {
  const bagianHash = hash.split('/').filter(Boolean);
  for (const pola of daftarPola) {
    const bagianPola = pola.split('/').filter(Boolean);
    if (bagianPola.length !== bagianHash.length) continue;
    const params = {};
    let cocok = true;
    for (let i = 0; i < bagianPola.length; i++) {
      if (bagianPola[i].startsWith(':')) {
        params[bagianPola[i].slice(1)] = decodeURIComponent(bagianHash[i]);
      } else if (bagianPola[i] !== bagianHash[i]) {
        cocok = false; break;
      }
    }
    if (cocok) return { pola, params };
  }
  return null;
}

export function navigasi(hash) {
  window.location.hash = hash;
}
