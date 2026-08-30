// src/lib/jalur-sel.js — Penanda jalur data pada tiap sel isian.
//
// Dipakai agar perubahan yang datang dari anggota kelompok lain bisa
// diterapkan tepat ke sel yang bersangkutan, TANPA menggambar ulang seluruh
// lembar — kalau digambar ulang, ketikan yang sedang berjalan akan kehilangan
// fokus dan posisi kursor.

const PEMISAH = '|';

/** Atribut untuk ditempel pada elemen isian: el('input', { ...atributJalur(path) }) */
export function atributJalur(path) {
  return { 'data-jalur': path.join(PEMISAH) };
}

/** Terapkan nilai dari anggota lain ke sel yang sesuai di dalam `root`.
 *  Sel yang sedang difokus pengguna sengaja dilewati agar ketikannya tidak
 *  tertimpa di tengah jalan. */
export function terapkanNilaiJauh(root, path, nilai) {
  const kunci = path.join(PEMISAH);
  const sel = root?.querySelector?.(`[data-jalur="${CSS.escape(kunci)}"]`);
  if (!sel) return false;

  if (sel.type === 'radio' || sel.type === 'checkbox') {
    // Untuk Likert: radio dikelompokkan per butir, cari yang nilainya cocok.
    const grup = root.querySelectorAll(`[data-jalur="${CSS.escape(kunci)}"]`);
    for (const r of grup) r.checked = String(r.value) === String(nilai);
    kedip(sel.closest('tr') || sel);
    return true;
  }

  if (document.activeElement === sel) return true; // biarkan pengetik selesai
  sel.value = nilai;
  kedip(sel);
  return true;
}

/** Kedip kuning sesaat sebagai jejak perubahan dari orang lain. */
function kedip(elemen) {
  if (!elemen?.style) return;
  elemen.style.transition = 'none';
  elemen.style.background = 'var(--kuning-lembut)';
  requestAnimationFrame(() => {
    elemen.style.transition = 'background 600ms ease';
    elemen.style.background = '';
  });
}
