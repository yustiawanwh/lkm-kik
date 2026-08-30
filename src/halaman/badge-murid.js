// src/halaman/badge-murid.js — Lencana & XP murid.
import { el, isi, tanggalId } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { daftarBadgeMurid, ambilStatistikMurid } from '../lib/data-asesmen.js';

export async function renderBadgeMurid(root, { profil, onKeluar }) {
  let memuat = true, galat = '';
  let daftar = [], statistik = null;

  async function muat() {
    memuat = true; render();
    try {
      daftar = await daftarBadgeMurid(profil.id);
      statistik = await ambilStatistikMurid(profil.id);
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  function render() {
    const konten = memuat
      ? el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : el('div', {}, [
            el('div', { style: 'display:flex;gap:16px;margin-bottom:24px;' }, [
              kartuStatistik('xp', statistik?.total_xp ?? 0, 'Total XP'),
              kartuStatistik('lencana', statistik?.jumlah_badge ?? 0, 'Lencana'),
              kartuStatistik('nilai', statistik?.tugas_selesai ?? 0, 'Misi Selesai')
            ]),
            daftar.length === 0
              ? el('div', { class: 'kartu-kosong' }, 'Belum ada lencana. Selesaikan misi dan dapatkan nilai bagus untuk meraih lencana pertamamu!')
              : el('div', { class: 'grid-kartu' }, daftar.map(p => el('div', { class: 'kartu' }, [
                  el('div', { style: 'font-size:36px;text-align:center;margin-bottom:8px;' }, p.badge?.emoji || ''),
                  el('div', { style: 'font-weight:700;text-align:center;margin-bottom:4px;' }, p.badge?.nama),
                  el('div', { style: 'font-size:12px;color:var(--abu-teks);text-align:center;margin-bottom:8px;' }, p.badge?.deskripsi || ''),
                  el('div', { style: 'text-align:center;' }, [
                    el('span', { class: 'lencana' }, `+${p.badge?.xp ?? 0} XP`)
                  ]),
                  el('div', { style: 'text-align:center;font-size:11px;color:var(--abu-teks-halus);margin-top:6px;' }, tanggalId(p.diraih_pada))
                ])))
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Lencana & XP', sub: 'Pencapaianmu sejauh ini.', onKeluar,
      konten
    }));
  }

  function kartuStatistik(namaIkon, angka, label) {
    return el('div', { class: 'kartu', style: 'flex:1;text-align:center;' }, [
      el('div', { style: 'display:flex;justify-content:center;color:var(--biru);margin-bottom:6px;' }, ikon(namaIkon, 22)),
      el('div', { style: 'font-size:26px;font-weight:650;letter-spacing:-0.02em;' }, String(angka)),
      el('div', { style: 'font-size:12.5px;color:var(--abu-teks);' }, label)
    ]);
  }

  render();
  await muat();
}
