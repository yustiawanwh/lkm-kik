// src/lib/seret.js — Mesin seret-dan-lepas berbasis Pointer Events.
//
// Kenapa tidak memakai drag-and-drop bawaan HTML5: API itu tidak bekerja di
// layar sentuh sama sekali, padahal murid mayoritas memakai HP. Pointer
// Events menyatukan tetikus, sentuh, dan pena dalam satu jalur.
//
// Perilaku sentuh: seret baru aktif setelah TAHAN ~320 md. Sebelum itu,
// gerakan jari tetap menggulung halaman seperti biasa — kalau tidak, papan
// yang ditumpuk vertikal di HP jadi mustahil digulung.

const TAHAN_SENTUH_MS = 320;
const AMBANG_GESER_PX = 6;
const TEPI_GULUNG_PX = 70;

/**
 * @param {object} opsi
 * @param {HTMLElement} opsi.kartu        elemen yang bisa diseret
 * @param {() => boolean} opsi.bolehSeret dipanggil sebelum mulai; false = batal
 * @param {() => Array<HTMLElement>} opsi.ambilZona daftar zona jatuh
 * @param {(zona: HTMLElement) => boolean} opsi.zonaSah apakah zona menerima
 * @param {(zona: HTMLElement) => void} opsi.onJatuh  dipanggil saat dilepas
 */
export function pasangSeret({ kartu, bolehSeret, ambilZona, zonaSah, onJatuh }) {
  let mulaiX = 0, mulaiY = 0;
  let sedangSeret = false;
  let bayangan = null;
  let zonaAktif = null;
  let idTahan = null;
  let gulung = null;
  let pointerId = null;
  let terakhirY = 0;

  function bersihkanTahan() {
    if (idTahan) { clearTimeout(idTahan); idTahan = null; }
  }

  function mulaiSeret(e) {
    if (bolehSeret && !bolehSeret()) return;
    sedangSeret = true;
    kartu.dataset.baruSeret = '1';
    kartu.classList.add('kartu-diseret');
    document.body.classList.add('sedang-menyeret');

    const kotak = kartu.getBoundingClientRect();
    bayangan = kartu.cloneNode(true);
    bayangan.classList.add('bayangan-seret');
    bayangan.classList.remove('kartu-diseret');
    bayangan.style.width = `${kotak.width}px`;
    bayangan.dataset.geserX = String(e.clientX - kotak.left);
    bayangan.dataset.geserY = String(e.clientY - kotak.top);
    document.body.appendChild(bayangan);
    posisikanBayangan(e);

    for (const z of ambilZona()) {
      z.classList.add(zonaSah(z) ? 'zona-terima' : 'zona-tolak');
    }
    mulaiGulungTepi();
  }

  function posisikanBayangan(e) {
    if (!bayangan) return;
    const gx = Number(bayangan.dataset.geserX) || 0;
    const gy = Number(bayangan.dataset.geserY) || 0;
    bayangan.style.left = `${e.clientX - gx}px`;
    bayangan.style.top = `${e.clientY - gy}px`;
  }

  /** Gulung halaman otomatis saat kursor mendekati tepi atas/bawah layar. */
  function mulaiGulungTepi() {
    gulung = setInterval(() => {
      if (!sedangSeret) return;
      if (terakhirY < TEPI_GULUNG_PX) window.scrollBy(0, -14);
      else if (terakhirY > window.innerHeight - TEPI_GULUNG_PX) window.scrollBy(0, 14);
    }, 16);
  }

  function hentikanGulungTepi() {
    if (gulung) { clearInterval(gulung); gulung = null; }
  }

  function zonaDiBawah(e) {
    if (bayangan) bayangan.style.display = 'none';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (bayangan) bayangan.style.display = '';
    if (!target || !target.closest) return null;
    const zona = target.closest('[data-zona]');
    return zona && zonaSah(zona) ? zona : null;
  }

  function saatGerak(e) {
    terakhirY = e.clientY;
    if (!sedangSeret) {
      const jauh = Math.hypot(e.clientX - mulaiX, e.clientY - mulaiY);
      if (e.pointerType === 'touch') {
        // Sebelum tahan selesai, gerakan jari = menggulung, bukan menyeret.
        if (jauh > AMBANG_GESER_PX) bersihkanTahan();
        return;
      }
      if (jauh < AMBANG_GESER_PX) return;
      mulaiSeret(e);
    }
    e.preventDefault();
    posisikanBayangan(e);

    const zona = zonaDiBawah(e);
    if (zona !== zonaAktif) {
      zonaAktif?.classList.remove('zona-incar');
      zonaAktif = zona;
      zonaAktif?.classList.add('zona-incar');
    }
  }

  function selesai(e, batal = false) {
    bersihkanTahan();
    hentikanGulungTepi();
    document.removeEventListener('pointermove', saatGerak, true);
    document.removeEventListener('pointerup', saatLepas, true);
    document.removeEventListener('pointercancel', saatBatal, true);
    document.removeEventListener('keydown', saatEsc, true);
    try { kartu.releasePointerCapture?.(pointerId); } catch { /* abaikan */ }

    if (!sedangSeret) return;
    sedangSeret = false;
    kartu.classList.remove('kartu-diseret');
    document.body.classList.remove('sedang-menyeret');
    bayangan?.remove(); bayangan = null;

    for (const z of ambilZona()) {
      z.classList.remove('zona-terima', 'zona-tolak', 'zona-incar');
    }
    const tujuan = zonaAktif;
    zonaAktif = null;

    // Tandai sebentar agar klik pembuka dialog tidak ikut terpicu.
    setTimeout(() => { delete kartu.dataset.baruSeret; }, 60);

    if (!batal && tujuan) onJatuh(tujuan);
  }

  const saatLepas = (e) => selesai(e, false);
  const saatBatal = (e) => selesai(e, true);
  const saatEsc = (e) => { if (e.key === 'Escape') selesai(e, true); };

  kartu.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest && e.target.closest('button, a, input, textarea, select')) return;

    pointerId = e.pointerId;
    mulaiX = e.clientX; mulaiY = e.clientY; terakhirY = e.clientY;
    try { kartu.setPointerCapture?.(e.pointerId); } catch { /* abaikan */ }

    document.addEventListener('pointermove', saatGerak, true);
    document.addEventListener('pointerup', saatLepas, true);
    document.addEventListener('pointercancel', saatBatal, true);
    document.addEventListener('keydown', saatEsc, true);

    if (e.pointerType === 'touch') {
      idTahan = setTimeout(() => { idTahan = null; mulaiSeret(e); }, TAHAN_SENTUH_MS);
    }
  });

  kartu.addEventListener('contextmenu', (e) => { if (sedangSeret) e.preventDefault(); });
}

/** Apakah kartu ini baru saja diseret (bukan sekadar diketuk)? */
export function baruSajaDiseret(kartu) {
  return kartu.dataset.baruSeret === '1';
}
