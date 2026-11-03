// src/halaman/profil.js — Halaman profil: pengguna menyunting data dirinya
// sendiri (nama, NIS, nomor absen).
import { el, isi, roti } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilProfil, updateProfil } from '../lib/data-profil.js';

const LABEL_PERAN = { murid: 'Murid', guru: 'Guru', admin: 'Admin' };

export async function renderProfil(root, { profil, onKeluar, onProfilBerubah }) {
  let memuat = true, galat = '', data = null, menyimpan = false;

  async function muat() {
    memuat = true; render();
    try { data = await ambilProfil(profil.id); }
    catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  async function simpan() {
    // PENTING: baca isian SEBELUM render(). render() membangun ulang formulir
    // dari `data` yang masih lama, sehingga ketikan pengguna terhapus — dulu
    // urutannya terbalik, jadi yang tersimpan justru nilai lama dan muncul
    // pesan "tersimpan" padahal tidak ada yang berubah.
    const isian = {
      nama: document.getElementById('p-nama')?.value ?? '',
      nis: document.getElementById('p-nis')?.value ?? '',
      no_absen: document.getElementById('p-absen')?.value ?? ''
    };

    menyimpan = true; render();
    try {
      const baru = await updateProfil(profil.id, isian);
      data = baru;
      // Segarkan juga objek profil yang dipakai sidebar, supaya nama di
      // pojok kiri bawah ikut berubah tanpa perlu muat ulang halaman.
      Object.assign(profil, baru);
      onProfilBerubah?.(baru);
      roti('Profil tersimpan.', 'sukses');
    } catch (err) {
      roti(pesanGalat(err), 'galat');
    } finally {
      menyimpan = false; render();
    }
  }

  function render() {
    let konten;
    if (memuat) {
      konten = el('div', { class: 'kartu', style: 'padding:40px;text-align:center;color:var(--abu-teks);' }, 'Memuat…');
    } else if (galat) {
      konten = el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat);
    } else {
      const murid = data.peran === 'murid';
      konten = el('div', { style: 'max-width:520px;' }, [
        el('div', { class: 'kartu' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Nama Lengkap'),
            el('input', { id: 'p-nama', value: data.nama || '', placeholder: 'Nama sesuai daftar hadir' }),
            el('div', { class: 'keterangan' }, 'Nama ini yang dilihat guru saat menilai pekerjaan Anda.')
          ]),
          murid ? el('div', { class: 'baris-medan' }, [
            el('div', { class: 'medan' }, [
              el('label', {}, 'Nomor Absen'),
              el('input', { id: 'p-absen', type: 'number', min: '1', value: data.no_absen ?? '', placeholder: 'mis. 12' })
            ]),
            el('div', { class: 'medan' }, [
              el('label', {}, 'NIS'),
              el('input', { id: 'p-nis', value: data.nis || '', placeholder: 'Nomor Induk Siswa' })
            ])
          ]) : el('div', { style: 'display:none;' }, [
            el('input', { id: 'p-absen', type: 'hidden', value: data.no_absen ?? '' }),
            el('input', { id: 'p-nis', type: 'hidden', value: data.nis || '' })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Email'),
            el('input', { value: data.email || '', disabled: true, style: 'background:var(--permukaan-2);color:var(--abu-teks);' }),
            el('div', { class: 'keterangan' }, 'Email dan peran tidak bisa diubah sendiri. Hubungi admin bila perlu diperbaiki.')
          ]),
          el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:16px;' }, [
            el('span', { style: 'font-size:13px;color:var(--abu-teks);' }, 'Peran:'),
            el('span', { class: 'lencana' }, LABEL_PERAN[data.peran] || data.peran)
          ]),
          el('button', {
            class: 'tombol tombol-primer', disabled: menyimpan, onclick: simpan
          }, menyimpan ? 'Menyimpan…' : 'Simpan Perubahan')
        ]),
        murid && (data.no_absen === null || !data.nis)
          ? el('div', { class: 'panel-info', style: 'margin-top:16px;' },
              'Lengkapi nomor absen dan NIS Anda agar guru mudah mencocokkan pekerjaan Anda dengan daftar hadir dan rekap nilai kelas.')
          : null
      ]);
    }

    isi(root, renderShell({
      profil, judulHalaman: 'Profil Saya', sub: 'Data diri Anda di aplikasi ini.', onKeluar, konten
    }));
  }

  render();
  await muat();
}
