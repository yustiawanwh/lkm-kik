// src/lib/sel-teks.js — Sel isian tabel yang teksnya bisa membungkus.
//
// Masalah yang dipecahkan: elemen <input> TIDAK PERNAH membungkus teks,
// berapa pun lebarnya — teks panjang hanya menggulung ke samping di dalam
// kotak dan terpotong dari pandangan. Padahal isian seperti "Gagasan Solusi"
// sering berupa satu kalimat penuh.
//
// Karena itu:
//   - Mode hanya-baca (mis. guru menilai) → elemen teks biasa yang membungkus
//   - Mode isi                            → textarea yang tumbuh mengikuti isi
import { el } from './dom.js';
import { atributJalur } from './jalur-sel.js';

/** Sesuaikan tinggi textarea dengan isinya. */
export function sesuaikanTinggi(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(ta.scrollHeight, 30)}px`;
}

/**
 * @param {object} o
 * @param {string[]} o.path      jalur data sel (untuk realtime)
 * @param {string}   o.nilai     isi sel
 * @param {boolean}  o.bisaEdit
 * @param {Function} o.onUbah    (path, nilaiBaru)
 * @param {string}   [o.placeholder]
 */
export function selTeks({ path, nilai, bisaEdit, onUbah, placeholder = '' }) {
  const isi = nilai ?? '';

  if (!bisaEdit) {
    return el('div', {
      ...atributJalur(path),
      class: 'sel-teks-baca'
    }, isi === '' ? '—' : String(isi));
  }

  const ta = el('textarea', {
    ...atributJalur(path),
    class: 'sel-teks-isi',
    rows: 1,
    placeholder,
    oninput: (e) => { sesuaikanTinggi(e.target); onUbah(path, e.target.value); }
  }, String(isi));

  // Tinggi awal disesuaikan setelah elemen masuk ke halaman, karena
  // scrollHeight baru terbaca benar sesudah itu.
  requestAnimationFrame(() => sesuaikanTinggi(ta));
  return ta;
}
