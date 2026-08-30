// src/lib/ikon.js — Sistem ikon garis (SVG inline) menggantikan emoji.
// Emoji tampil berbeda-beda di tiap sistem operasi dan tebalnya tidak
// selaras dengan teks; ikon garis mengikuti currentColor sehingga otomatis
// menyesuaikan warna teks dan mode gelap.

const JALUR = {
  // Navigasi
  program: '<path d="M8 2h8a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2Z"/><path d="M8 2v3h8V2"/><path d="M8 11h8M8 15h5"/>',
  kelas: '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M10 21v-5h4v5"/>',
  rekap: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="4" width="3" height="14" rx="1"/>',
  papan: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  lencana: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14.5 7 22l5-3 5 3-1.5-7.5"/>',
  pengaturan: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1.5Z"/>',
  mapel: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',

  // Aksi
  nilai: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/>',
  cari: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  kalender: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  catatan: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 12h8M8 16h5"/>',
  asesmen: '<circle cx="12" cy="12" r="10"/><path d="m16 8-5.7 2.3L8 16l5.7-2.3L16 8Z"/>',
  rubrik: '<path d="M21.3 8.7 8.7 21.3a2.4 2.4 0 0 1-3.4 0l-2.6-2.6a2.4 2.4 0 0 1 0-3.4L15.3 2.7a2.4 2.4 0 0 1 3.4 0l2.6 2.6a2.4 2.4 0 0 1 0 3.4Z"/><path d="m7.5 10.5 2 2M11 7l2 2M14.5 3.5l2 2"/>',
  refleksi: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  unduh: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  mulai: '<path d="M6 4.5v15l13-7.5Z"/>',
  jeda: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  ubah: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  gembok: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  berkas: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  lampiran: '<path d="M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  xp: '<path d="M13 2 4.1 12.6a1 1 0 0 0 .8 1.6H11l-1 8 8.9-10.6a1 1 0 0 0-.8-1.6H12Z"/>',
  tutup: '<path d="M18 6 6 18M6 6l12 12"/>',
  tambah: '<path d="M12 5v14M5 12h14"/>',
  keluar: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  kembali: '<path d="m15 18-6-6 6-6"/>',
  peringatan: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  centang: '<path d="M20 6 9 17l-5-5"/>',
  jam: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  terang: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  gelap: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  merek: '<path d="M12 2 3 7v10l9 5 9-5V7Z"/><path d="M12 22V12M3 7l9 5 9-5"/>'
};

/** Buat elemen SVG ikon. ukuran dalam px, warna mengikuti currentColor. */
export function ikon(nama, ukuran = 18) {
  const jalur = JALUR[nama];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', ukuran);
  svg.setAttribute('height', ukuran);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.flexShrink = '0';
  // Isi jalur berasal dari konstanta di berkas ini saja — tidak pernah dari
  // masukan pengguna, jadi aman memakai innerHTML.
  svg.innerHTML = jalur || '';
  return svg;
}

/** Ikon + teks dalam satu baris, dipakai di tombol dan tautan. */
export function ikonTeks(nama, teks, ukuran = 16) {
  const span = document.createElement('span');
  span.style.cssText = 'display:inline-flex;align-items:center;gap:7px;';
  span.appendChild(ikon(nama, ukuran));
  span.appendChild(document.createTextNode(teks));
  return span;
}
