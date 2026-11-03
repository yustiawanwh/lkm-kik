// src/lib/penanda-luring.js — Penanda keadaan simpan di sudut layar.
//
// Tanpa penanda, antrean luring justru berbahaya: murid tidak bisa
// membedakan "sudah tersimpan" dari "belum terkirim", lalu menutup
// aplikasi dan mengira pekerjaannya aman. Penanda ini hanya muncul saat ada
// yang perlu diketahui, dan hilang sendiri begitu semuanya terkirim.
import { el, isi } from './dom.js';
import { dengarkanLuring, kirimAntrean } from './simpan-luring.js';

let wadah = null;

export function mulaiPenandaLuring() {
  if (wadah || typeof document === 'undefined') return;
  wadah = el('div', { class: 'penanda-luring', hidden: true });
  document.body.appendChild(wadah);

  dengarkanLuring(({ tertunda, daring }) => {
    if (tertunda === 0 && daring) { wadah.hidden = true; return; }
    wadah.hidden = false;
    wadah.className = 'penanda-luring' + (tertunda > 0 ? ' luring-tertunda' : ' luring-mati');

    isi(wadah, [
      el('span', { class: 'titik-luring' }),
      el('span', {}, tertunda > 0
        ? `${tertunda} perubahan belum terkirim`
        : 'Jaringan terputus — pekerjaan tetap tersimpan di perangkat'),
      tertunda > 0 && daring
        ? el('button', {
            class: 'tombol tombol-hantu tombol-kecil',
            onclick: () => kirimAntrean()
          }, 'Coba Kirim')
        : null
    ]);
  });
}
