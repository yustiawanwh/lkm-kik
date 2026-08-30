// src/halaman/guru.js — Dasbor guru: daftar Program Inkubasi.
import { el, isi, roti, dialog, konfirmasi } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ikon } from '../lib/ikon.js';
import { navigasi } from '../lib/rute.js';
import {
  daftarMapel, daftarProgram, buatProgram, hapusProgram,
  kelasPemakaiProgram, updateProgram
} from '../lib/data-kurikulum.js';
import { daftarKelasGuru, daftarPenugasanKelas, daftarKelompok } from '../lib/data-kelas.js';

export async function renderGuru(root, { profil, onKeluar }) {
  let memuat = true;
  let daftar = [];
  let galat = '';
  let kelasList = [], adaKelompok = false, adaPenugasan = false;

  function gambarIsi() {
    if (memuat) {
      return el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat program…');
    }
    if (galat) {
      return el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);border-color:#ffbdad;color:var(--merah);' }, galat);
    }
    if (daftar.length === 0) {
      return el('div', { class: 'kartu-kosong' }, [
        el('h3', {}, 'Belum ada Program Inkubasi'),
        el('p', { style: 'margin:8px 0 16px;' }, 'Program Inkubasi adalah unit belajar utama (setara Tujuan Pembelajaran) — berisi beberapa Tahap Inkubasi (sprint) dan Misi (tugas) di dalamnya.'),
        el('button', { class: 'tombol tombol-primer', onclick: bukaDialogBuat }, '+ Buat Program Pertama')
      ]);
    }
    return el('div', { class: 'grid-kartu' }, daftar.map(kartuProgram));
  }

  function kartuProgram(p) {
    return el('div', {
      class: 'kartu kartu-interaktif',
      onclick: () => navigasi(`#/guru/program/${p.id}`)
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;' }, [
        el('h3', {}, p.judul),
        p.terbit
          ? el('span', { class: 'lencana', style: 'background:var(--hijau-lembut);color:#006644;' }, 'Terbit')
          : el('span', { class: 'lencana' }, 'Draf')
      ]),
      el('div', { style: 'color:var(--abu-teks);font-size:13px;margin:6px 0 12px;' }, p.kode || '—'),
      p.deskripsi ? el('p', { style: 'font-size:13px;color:var(--abu-teks);margin:0 0 12px;' }, potong(p.deskripsi, 90)) : null,
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
        el('span', { style: 'font-size:12px;color:var(--abu-teks-halus);' }, p.total_jp ? `${p.total_jp} JP` : ''),
        el('button', {
          class: 'tombol tombol-bahaya tombol-kecil',
          onclick: (e) => { e.stopPropagation(); hapus(p); }
        }, 'Hapus')
      ])
    ]);
  }

  function potong(teks, n) {
    return teks.length > n ? teks.slice(0, n) + '…' : teks;
  }

  async function hapus(p) {
    // Periksa dulu apakah program sedang dipakai, supaya guru tahu sebelum
    // menekan Hapus — bukan setelahnya lewat pesan galat.
    let pemakai = [];
    try { pemakai = [...new Set(await kelasPemakaiProgram(p.id))]; }
    catch (err) { roti(pesanGalat(err), 'galat'); return; }

    if (pemakai.length > 0) {
      const { tutup } = dialog({
        judul: 'Program Masih Dipakai',
        isi: el('div', {}, [
          el('p', {},
            `"${p.judul}" masih ditugaskan ke kelas: ${pemakai.join(', ')}.`),
          el('p', { style: 'color:var(--abu-teks);font-size:13.5px;' },
            'Program tidak bisa dihapus karena penghapusannya akan ikut menghapus nilai, XP, dan bukti karya murid pada penugasan tersebut.'),
          el('div', { class: 'panel-info', style: 'margin-bottom:16px;' },
            'Pilihan Anda: hapus dulu penugasannya di halaman Kelas → tab Penugasan, atau jadikan program ini Draf agar tidak bisa ditugaskan lagi sementara data murid tetap aman.'),
          el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;' }, [
            el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Tutup'),
            p.terbit ? el('button', {
              class: 'tombol tombol-primer',
              onclick: async () => {
                try {
                  await updateProgram(p.id, { terbit: false });
                  tutup(); roti('Program dijadikan Draf.', 'sukses'); await muat();
                } catch (err) { roti(pesanGalat(err), 'galat'); }
              }
            }, 'Jadikan Draf') : null
          ])
        ])
      });
      return;
    }

    const ok = await konfirmasi(
      `Hapus program "${p.judul}"? Seluruh tahap, misi, lembar kerja, dan lencana di dalamnya ikut terhapus. Tindakan ini tidak bisa dibatalkan.`,
      { labelYa: 'Hapus', labelTidak: 'Batal' });
    if (!ok) return;
    try {
      await hapusProgram(p.id);
      roti('Program dihapus.', 'sukses');
      await muat();
    } catch (err) {
      roti(pesanGalat(err), 'galat');
    }
  }

  async function bukaDialogBuat() {
    let mapelList = [];
    try { mapelList = await daftarMapel(); }
    catch (err) { roti(pesanGalat(err), 'galat'); return; }
    if (mapelList.length === 0) {
      roti('Belum ada mata pelajaran. Minta admin menambahkannya di menu Mata Pelajaran.', 'galat');
      return;
    }

    const { tutup } = dialog({
      judul: 'Buat Program Inkubasi Baru',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Judul Program'),
          el('input', { id: 'd-judul', placeholder: 'mis. Inkubator Bisnis Kuliner Lokal' })
        ]),
        mapelList.length > 1 ? el('div', { class: 'medan' }, [
          el('label', {}, 'Mata Pelajaran'),
          el('select', { id: 'd-mapel' }, mapelList.map(m => el('option', { value: m.id }, `${m.kode} — ${m.nama}`)))
        ]) : null,
        el('div', { class: 'medan' }, [
          el('label', {}, 'Kode'),
          el('input', { id: 'd-kode', placeholder: 'mis. TP-01' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Deskripsi Singkat'),
          el('textarea', { id: 'd-deskripsi', placeholder: 'Gambaran umum program ini untuk murid…' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const judul = document.getElementById('d-judul')?.value?.trim();
              const kode = document.getElementById('d-kode')?.value?.trim();
              const deskripsi = document.getElementById('d-deskripsi')?.value?.trim();
              if (!judul) { roti('Judul wajib diisi.', 'galat'); return; }
              const mapelId = document.getElementById('d-mapel')?.value || mapelList[0].id;
              try {
                const baru = await buatProgram({
                  mata_pelajaran_id: mapelId,
                  judul, kode: kode || null, deskripsi: deskripsi || null,
                  terbit: false, urutan: daftar.length
                });
                tutup();
                navigasi(`#/guru/program/${baru.id}`);
              } catch (err) {
                roti(pesanGalat(err), 'galat');
              }
            }
          }, 'Buat & Lanjut Susun')
        ])
      ])
    });
  }

  async function muat() {
    memuat = true; galat = ''; render();
    try {
      daftar = await daftarProgram();
      kelasList = await daftarKelasGuru();
      adaPenugasan = false; adaKelompok = false;
      for (const k of kelasList) {
        if (!adaPenugasan && (await daftarPenugasanKelas(k.id)).length > 0) adaPenugasan = true;
        if (!adaKelompok && (await daftarKelompok(k.id)).length > 0) adaKelompok = true;
        if (adaPenugasan && adaKelompok) break;
      }
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  /** Panduan urutan untuk guru baru — hilang sendiri setelah semua tuntas. */
  function gambarPanduan() {
    const adaProgram = daftar.length > 0;
    const adaTerbit = daftar.some(p => p.terbit);
    const adaKelas = kelasList.length > 0;
    const langkah = [
      { judul: 'Buat Program Inkubasi', ket: 'Unit belajar utama, berisi tahap dan misi.', tuntas: adaProgram },
      { judul: 'Susun tahap, misi, dan lembar kerja', ket: 'Buka program, lalu isi tab Tahap & Misi serta Lembar Kerja.', tuntas: adaTerbit || adaPenugasan },
      { judul: 'Terbitkan program', ket: 'Program yang masih draf belum bisa ditugaskan ke kelas.', tuntas: adaTerbit },
      { judul: 'Buat kelas & bagikan kode gabung', ket: 'Murid memakai kode itu untuk masuk ke kelas Anda.', tuntas: adaKelas },
      { judul: 'Bentuk kelompok', ket: 'Diperlukan untuk misi dan lembar kerja berkelompok.', tuntas: adaKelompok },
      { judul: 'Tugaskan program ke kelas', ket: 'Barulah misi muncul di Papan Misi murid.', tuntas: adaPenugasan }
    ];
    const tuntas = langkah.filter(l => l.tuntas).length;
    if (tuntas === langkah.length) return null;

    return el('div', { class: 'kartu panduan', style: 'margin-bottom:20px;' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;' }, [
        el('h3', {}, 'Langkah Persiapan'),
        el('span', { class: 'lencana' }, `${tuntas} dari ${langkah.length}`)
      ]),
      el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:8px;' },
        'Panduan ini hilang sendiri setelah semua langkah selesai.'),
      ...langkah.map((l, i) => el('div', { class: 'langkah' + (l.tuntas ? ' tuntas' : '') }, [
        el('span', { class: 'langkah-nomor' }, l.tuntas ? ikon('centang', 13) : String(i + 1)),
        el('div', {}, [
          el('div', { class: 'langkah-judul' }, l.judul),
          el('div', { class: 'langkah-ket' }, l.ket)
        ])
      ]))
    ]);
  }

  function render() {
    isi(root, renderShell({
      profil,
      judulHalaman: 'Program Inkubasi',
      sub: 'Susun materi belajar KIK sebagai unit-unit program.',
      onKeluar,
      konten: [
        memuat ? null : gambarPanduan(),
        el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:16px;' }, [
          daftar.length > 0 ? el('button', { class: 'tombol tombol-primer', onclick: bukaDialogBuat }, '+ Program Baru') : null
        ]),
        gambarIsi()
      ]
    }));
  }

  render();
  await muat();
}
