// src/halaman/murid.js — Dasbor murid: gabung kelas, daftar penugasan aktif.
import { el, isi, roti, dialog, tanggalId } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { navigasi } from '../lib/rute.js';
import { daftarKelasMurid, gabungKelasDenganKode, daftarPenugasanMurid } from '../lib/data-kelas.js';
import { ambilProfil } from '../lib/data-profil.js';
import { ringkasNilaiPenugasan } from '../lib/data-papan.js';
import { ambilSemuaPengaturan } from '../lib/data-pengaturan.js';

export async function renderMurid(root, { profil, onKeluar }) {
  let memuat = true, galat = '';
  let kelasList = [], penugasanList = [];
  let profilLengkap = true;
  let ringkasNilai = new Map();
  let skalaHuruf = null;

  async function muat() {
    memuat = true; render();
    try {
      kelasList = await daftarKelasMurid(profil.id);
      const p = await ambilProfil(profil.id);
      profilLengkap = p.no_absen != null && !!p.nis;
      penugasanList = kelasList.length > 0 ? await daftarPenugasanMurid(profil.id) : [];
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  function bukaDialogGabung() {
    const { tutup } = dialog({
      judul: 'Gabung Kelas',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Kode Gabung dari Guru'),
          el('input', { id: 'g-kode', placeholder: 'mis. AB3XK9', style: 'text-transform:uppercase;letter-spacing:2px;font-weight:700;' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const kode = document.getElementById('g-kode').value.trim();
              if (!kode) { roti('Kode wajib diisi.', 'galat'); return; }
              try {
                await gabungKelasDenganKode(kode, profil.id);
                tutup(); roti('Berhasil bergabung ke kelas!', 'sukses'); await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Gabung')
        ])
      ])
    });
  }

  /** Terjemahkan angka ke huruf memakai skala yang diatur admin, supaya
   *  sama persis dengan yang dipakai guru saat menilai. */
  function hurufDari(nilai) {
    if (nilai === null || !Array.isArray(skalaHuruf)) return null;
    const urut = [...skalaHuruf].sort((a, b) => Number(b.min) - Number(a.min));
    return urut.find(s => nilai >= Number(s.min))?.huruf || null;
  }

  function warnaNilai(n) {
    return n >= 85 ? 'var(--hijau)' : n >= 70 ? 'var(--kuning-teks)' : 'var(--merah)';
  }

  /** Panel nilai pada kartu. Menahan diri menampilkan angka sebelum ada
   *  yang dinilai — angka 0 akan terbaca sebagai nilai buruk, padahal
   *  artinya guru belum sempat menilai. */
  function panelNilai(p) {
    const r = ringkasNilai.get(p.id);
    if (!r || r.dikerjakan === 0) return null;

    if (r.dinilai === 0) {
      return el('div', { class: 'nilai-kartu' }, [
        el('span', { style: 'font-size:12px;color:var(--abu-teks);' },
          r.menunggu > 0 ? `${r.menunggu} misi menunggu dinilai guru` : 'Belum ada misi yang dinilai')
      ]);
    }

    const huruf = hurufDari(r.rata);
    return el('div', { class: 'nilai-kartu' }, [
      el('div', {}, [
        el('div', { style: 'font-size:11.5px;color:var(--abu-teks);' }, 'Nilai sementara'),
        el('div', { style: 'font-size:12px;color:var(--abu-teks-halus);' },
          `dari ${r.dinilai} misi yang sudah dinilai` + (r.menunggu > 0 ? ` · ${r.menunggu} menunggu` : ''))
      ]),
      el('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
        huruf ? el('span', { class: 'nilai-kotak', style: `background:var(--permukaan);color:${warnaNilai(r.rata)};` }, huruf) : null,
        el('span', { style: `font-size:22px;font-weight:700;color:${warnaNilai(r.rata)};` }, r.rata.toFixed(1))
      ])
    ]);
  }

  function kartuPenugasan(p) {
    const sisaMs = new Date(p.tenggat).getTime() - Date.now();
    const lewat = sisaMs < 0;
    return el('div', {
      class: 'kartu kartu-interaktif',
      onclick: () => navigasi(`#/murid/papan/${p.id}`)
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;' }, [
        el('h3', {}, p.tujuan_pembelajaran?.judul || 'Program'),
        lewat ? el('span', { class: 'lencana lencana-susulan' }, 'Lewat tenggat') : null
      ]),
      el('div', { style: 'color:var(--abu-teks);font-size:13px;margin:6px 0 10px;' }, p.kelas?.nama),
      el('div', { style: 'font-size:12px;color:var(--abu-teks-halus);' }, `Tenggat: ${tanggalId(p.tenggat, true)}`),
      panelNilai(p)
    ]);
  }

  function render() {
    let konten;
    if (memuat) {
      konten = el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat…');
    } else if (galat) {
      konten = el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat);
    } else if (kelasList.length === 0) {
      konten = el('div', { class: 'kartu-kosong' }, [
        el('h3', {}, 'Anda belum tergabung di kelas manapun'),
        el('p', { style: 'margin:8px 0 16px;' }, 'Minta kode gabung dari guru Anda, lalu masukkan di sini.'),
        el('button', { class: 'tombol tombol-primer', onclick: bukaDialogGabung }, '+ Gabung Kelas')
      ]);
    } else if (penugasanList.length === 0) {
      konten = el('div', { class: 'kartu-kosong' }, 'Belum ada Program Inkubasi yang ditugaskan ke kelas Anda. Tunggu guru menugaskan program.');
    } else {
      konten = el('div', { class: 'grid-kartu' }, penugasanList.map(kartuPenugasan));
    }

    isi(root, renderShell({
      profil, judulHalaman: 'Papan Misi', sub: 'Program Inkubasi yang sedang Anda kerjakan.', onKeluar,
      konten: [
        (!memuat && !profilLengkap) ? el('div', {
          class: 'panel-info',
          style: 'margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;'
        }, [
          el('span', {}, 'Lengkapi nomor absen dan NIS Anda supaya guru bisa mencocokkan pekerjaan Anda dengan daftar hadir kelas.'),
          el('a', { href: '#/profil', class: 'tombol tombol-primer tombol-kecil' }, 'Lengkapi Profil')
        ]) : null,
        el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:16px;' }, [
          kelasList.length > 0 ? el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: bukaDialogGabung }, '+ Gabung Kelas Lain') : null
        ]),
        konten
      ]
    }));
  }

  render();
  await muat();
}
