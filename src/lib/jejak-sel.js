// src/lib/jejak-sel.js — Jejak sel: menandai kotak yang sedang diketik
// anggota kelompok lain, lengkap dengan nama dan warna orangnya.
//
// Tujuannya mencegah tabrakan secara sosial, bukan dengan mengunci sel.
// Dua orang yang mengetik di SEL YANG SAMA saling tidak melihat ketikan
// lawannya (perubahan jauh sengaja dilewati pada sel yang sedang difokus,
// supaya ketikan tidak tertimpa di tengah kalimat) — akibatnya tulisan
// salah satu hilang diam-diam. Dengan penanda ini murid melihat sendiri
// "kotak ini sedang dipegang Budi" lalu pindah ke kotak lain.

const PALET = ['#7C3AED', '#0891B2', '#DB2777', '#EA580C', '#059669', '#4F46E5'];

/** Warna per pengguna, ditentukan dari URUTAN id dalam kelompok — bukan
 *  dari hash id.
 *
 *  Hash sempat dipakai, tetapi dengan 6 warna dan 5 anggota peluang dua
 *  orang mendapat warna sama mencapai ~87% (masalah ulang tahun), sehingga
 *  warnanya justru tidak lagi membedakan siapa-siapa. Dengan mengurutkan id
 *  lalu memakai indeksnya, anggota ke-1..6 dijamin berbeda warna, dan semua
 *  perangkat menghasilkan urutan yang sama tanpa perlu berunding.
 */
export function warnaDariUrutan(indeks) {
  return PALET[indeks % PALET.length];
}

/** Pasang penyiar fokus: setiap kali murid masuk/keluar sebuah sel,
 *  beri tahu anggota lain sel mana yang sedang dipegangnya. */
export function pasangPenyiarFokus(root, ambilSaluran) {
  root.addEventListener('focusin', (e) => {
    const jalur = e.target?.dataset?.jalur;
    if (jalur) ambilSaluran()?.siarkanFokus(jalur.split('|'));
  });
  root.addEventListener('focusout', (e) => {
    if (e.target?.dataset?.jalur) ambilSaluran()?.siarkanFokus(null);
  });
}

/** Ubah presenceState Supabase menjadi daftar { id, nama, jalur } milik
 *  ORANG LAIN yang sedang memegang suatu sel. */
export function bacaPemakaiSel(keadaan, idSaya) {
  // Kumpulkan SEMUA yang hadir dulu (termasuk diri sendiri dan yang sedang
  // tidak memegang sel), supaya urutan warnanya stabil dan tidak berubah
  // hanya karena seseorang berpindah sel atau berhenti mengetik.
  const semuaId = [];
  for (const kunci of Object.keys(keadaan || {})) {
    const entri = keadaan[kunci]?.[0];
    if (entri?.id) semuaId.push(entri.id);
  }
  semuaId.sort();
  const urutan = new Map(semuaId.map((id, i) => [id, i]));

  const hasil = [];
  for (const kunci of Object.keys(keadaan || {})) {
    const entri = keadaan[kunci]?.[0];
    if (!entri || entri.id === idSaya) continue;
    if (!entri.selAktif) continue;
    hasil.push({
      id: entri.id,
      nama: entri.nama || 'Anggota',
      warna: warnaDariUrutan(urutan.get(entri.id) ?? 0),
      jalur: Array.isArray(entri.selAktif) ? entri.selAktif.join('|') : String(entri.selAktif)
    });
  }
  return hasil;
}

/** Terapkan penanda ke layar. Penanda lama dibersihkan lebih dulu.
 *  Panggil ulang setiap kali lembar digambar ulang, karena elemennya baru. */
export function gambarJejakSel(root, pemakai) {
  if (!root) return;
  for (const bekas of root.querySelectorAll('.sel-diduduki')) {
    bekas.classList.remove('sel-diduduki');
    bekas.style.removeProperty('--warna-pemakai');
    delete bekas.dataset.pemakai;
  }

  for (const p of pemakai || []) {
    let sel;
    try { sel = root.querySelector(`[data-jalur="${CSS.escape(p.jalur)}"]`); }
    catch { sel = null; }
    if (!sel) continue;

    // Penanda dipasang pada WADAH sel, bukan pada input itu sendiri:
    // elemen input/textarea tidak bisa memiliki ::after, sehingga label
    // nama tidak akan muncul bila ditempel langsung ke sana.
    const wadah = sel.closest('td, .medan') || sel.parentElement;
    if (!wadah) continue;
    wadah.classList.add('sel-diduduki');
    wadah.style.setProperty('--warna-pemakai', p.warna || PALET[0]);
    wadah.dataset.pemakai = p.nama;
  }
}
