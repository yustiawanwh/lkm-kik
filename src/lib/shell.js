// src/lib/shell.js — Shell aplikasi: sidebar navigasi + topbar.
import { el } from './dom.js';
import { ikon } from './ikon.js';
import { tukarTema, temaSaatIni } from './tema.js';

const MENU_GURU = [
  { hash: '#/guru', label: 'Program Inkubasi', ikon: 'program' },
  { hash: '#/guru/kelas', label: 'Kelas', ikon: 'kelas' },
  { hash: '#/guru/rekap', label: 'Rekap Nilai', ikon: 'rekap' }
];

const MENU_PER_PERAN = {
  guru: MENU_GURU,
  murid: [
    { hash: '#/murid', label: 'Papan Misi', ikon: 'papan' },
    { hash: '#/murid/badge', label: 'Lencana & XP', ikon: 'lencana' }
  ],
  // Admin melihat seluruh menu guru (RLS mengizinkan admin melakukan apa
  // pun yang bisa dilakukan guru) DITAMBAH menu khusus admin di bawahnya.
  admin: [
    ...MENU_GURU,
    { hash: '#/kelola', label: 'Pengaturan', ikon: 'pengaturan' },
    { hash: '#/kelola/mapel', label: 'Mata Pelajaran', ikon: 'mapel' }
  ]
};

/** Cocokkan hash aktif ke SATU menu paling spesifik saja — mencegah dua
 *  tautan menyala bersamaan hanya karena salah satunya awalan dari yang lain
 *  (mis. "#/guru" adalah awalan dari "#/guru/kelas"). */
function hashTautanAktif(hashSaatIni, menu) {
  let terbaik = null;
  for (const item of menu) {
    const cocok = hashSaatIni === item.hash || hashSaatIni.startsWith(item.hash + '/');
    if (cocok && (!terbaik || item.hash.length > terbaik.length)) terbaik = item.hash;
  }
  return terbaik;
}

/** Bungkus konten halaman dengan sidebar + topbar sesuai peran profil.
 *  judulHalaman & sub tampil di topbar; onKeluar dipanggil saat klik Keluar. */
export function renderShell({ profil, judulHalaman, sub, konten, onKeluar }) {
  const menu = MENU_PER_PERAN[profil.peran] || MENU_PER_PERAN.murid;
  const hashSaatIni = window.location.hash || (menu[0]?.hash ?? '');
  const hashAktif = hashTautanAktif(hashSaatIni, menu);

  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar-utama' }, [
    el('div', { class: 'sidebar-merek' }, [
      el('span', { class: 'lambang' }, ikon('merek', 17)),
      el('span', {}, 'Venture Studio')
    ]),
    el('nav', { class: 'sidebar-nav' }, menu.map(item =>
      el('a', {
        href: item.hash,
        class: 'sidebar-tautan' + (item.hash === hashAktif ? ' aktif' : ''),
        onclick: tutupSidebar
      }, [ikon(item.ikon, 18), el('span', {}, item.label)])
    )),
    el('div', { class: 'sidebar-kaki' }, [
      el('a', {
        href: '#/profil', class: 'kartu-profil', onclick: tutupSidebar, title: 'Buka profil saya'
      }, [
        el('span', { class: 'avatar-profil' }, (profil.nama || '?').trim().charAt(0).toUpperCase()),
        el('span', { style: 'min-width:0;' }, [
          el('span', { class: 'nama-profil' }, profil.nama),
          el('span', { class: 'peran-profil' },
            profil.peran === 'guru' ? 'Guru' : profil.peran === 'admin' ? 'Admin' : 'Murid')
        ])
      ]),
      el('button', {
        class: 'tombol tombol-hantu tombol-kecil',
        style: 'width:100%;justify-content:flex-start;gap:8px;', onclick: onKeluar
      }, [ikon('keluar', 16), el('span', {}, 'Keluar')])
    ])
  ]);

  const topbar = el('div', { class: 'topbar' }, [
    el('div', { style: 'display:flex;align-items:center;gap:12px;min-width:0;' }, [
      el('button', {
        class: 'tombol-menu', 'aria-label': 'Buka menu', onclick: bukaTutupSidebar
      }, [
        el('span', { class: 'garis-menu' }), el('span', { class: 'garis-menu' }), el('span', { class: 'garis-menu' })
      ]),
      el('div', { style: 'min-width:0;' }, [
      el('h1', {}, judulHalaman),
        sub ? el('div', { class: 'sub', style: 'color:var(--abu-teks);font-size:13px;margin-top:2px;' }, sub) : null
      ])
    ]),
    el('button', {
      class: 'tombol-ikon', id: 'sakelar-tema',
      'aria-label': 'Ganti mode terang/gelap', title: 'Ganti mode terang/gelap',
      onclick: (e) => {
        const baru = tukarTema();
        const tombol = e.currentTarget;
        tombol.replaceChildren(ikon(baru === 'gelap' ? 'terang' : 'gelap', 17));
      }
    }, ikon(temaSaatIni() === 'gelap' ? 'terang' : 'gelap', 17))
  ]);

  return el('div', { class: 'shell' }, [
    el('div', { class: 'tirai-sidebar', id: 'tirai-sidebar', onclick: tutupSidebar }),
    sidebar,
    el('div', { class: 'konten-utama' }, [
      topbar,
      el('div', { class: 'area-halaman' }, konten)
    ])
  ]);
}

/** Buka/tutup sidebar di layar kecil. */
function bukaTutupSidebar() {
  document.getElementById('sidebar-utama')?.classList.toggle('terbuka');
  document.getElementById('tirai-sidebar')?.classList.toggle('tampil');
}

function tutupSidebar() {
  document.getElementById('sidebar-utama')?.classList.remove('terbuka');
  document.getElementById('tirai-sidebar')?.classList.remove('tampil');
}
