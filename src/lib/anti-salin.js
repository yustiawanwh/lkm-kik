// src/lib/anti-salin.js — Blokir copy/cut/paste/klik-kanan/seleksi teks di
// halaman murid (opsional, sakelar di Pengaturan admin). Kolom isian
// (input/textarea/contenteditable) TETAP bisa diketik & dipilih normal.
import { roti } from './dom.js';

let pesanTerakhir = 0;

function elemenBolehSalin(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
}

function tampilkanPeringatan() {
  const sekarang = Date.now();
  if (sekarang - pesanTerakhir < 2000) return; // batasi spam
  pesanTerakhir = sekarang;
  roti('Salin/tempel dinonaktifkan pada halaman ini.', 'info');
}

function tangani(e) {
  if (elemenBolehSalin(e.target)) return;
  e.preventDefault();
  tampilkanPeringatan();
}

const PERISTIWA = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart'];

export function pasangAntiSalin() {
  document.body.classList.add('anti-salin-aktif');
  for (const nama of PERISTIWA) document.addEventListener(nama, tangani, true);
}

export function lepasAntiSalin() {
  document.body.classList.remove('anti-salin-aktif');
  for (const nama of PERISTIWA) document.removeEventListener(nama, tangani, true);
}
