// src/lib/tampil-pekerjaan.js — Penampil hasil pekerjaan murid untuk GURU:
// isi lembar kerja (hanya-baca) + galeri bukti karya yang bisa diperbesar.
// Dipakai di dalam dialog penilaian supaya guru tidak menilai "buta".
import { el, isi, dialog } from './dom.js';
import { pesanGalat } from './kesalahan.js';
import { buatWidgetLembar } from './lembar-widget.js';
import { isianUntukProgres } from './data-nilai.js';
import { daftarLampiran } from './data-lampiran.js';
import { urlBukti } from './bukti.js';

/** Bangun panel "Hasil Pekerjaan" untuk satu baris progres_tugas.
 *  Mengembalikan elemen yang langsung bisa ditempel; isinya dimuat async. */
export function buatPanelPekerjaan(progres) {
  const wadah = el('div', { style: 'margin-top:16px;' }, [
    el('div', { style: 'font-weight:700;font-size:13px;margin-bottom:8px;' }, 'Hasil Pekerjaan Murid'),
    el('div', { style: 'color:var(--abu-teks);font-size:13px;' }, 'Memuat…')
  ]);

  (async () => {
    const bagian = [el('div', { style: 'font-weight:700;font-size:13px;margin-bottom:8px;' }, 'Hasil Pekerjaan Murid')];

    // ---- Lembar kerja (hanya-baca) ----
    try {
      const daftarIsian = await isianUntukProgres(progres);
      if (daftarIsian.length === 0) {
        bagian.push(el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:10px;' },
          'Misi ini tidak tertaut ke lembar kerja mana pun.'));
      } else {
        for (const { lembar, isian } of daftarIsian) {
          bagian.push(el('div', { class: 'kartu', style: 'padding:12px;margin-bottom:10px;background:var(--netral);' },
            isian.id
              ? buatWidgetLembar({ lembar, isian, bisaEdit: false, profil: null, anggotaKelompok: [], tampilanGuru: true }).elemen
              : el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, `${lembar.judul} — belum diisi murid.`)
          ));
        }
      }
    } catch (err) {
      bagian.push(el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);margin-bottom:10px;' },
        pesanGalat(err)));
    }

    // ---- Bukti karya ----
    try {
      const lampiranList = await daftarLampiran(progres.id);
      bagian.push(el('div', { style: 'font-weight:700;font-size:13px;margin:14px 0 8px;' }, 'Bukti Karya'));
      if (lampiranList.length === 0) {
        bagian.push(el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, 'Tidak ada bukti diunggah.'));
      } else {
        const galeri = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
        bagian.push(galeri);
        for (const la of lampiranList) {
          const kotak = el('div', {
            style: 'width:96px;height:96px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--garis);background:var(--netral);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:var(--abu-teks);text-align:center;padding:4px;',
            title: la.nama_asli
          }, la.mime?.startsWith('image/') ? 'Memuat…' : `${la.nama_asli}`);
          galeri.appendChild(kotak);

          if (la.mime?.startsWith('image/')) {
            urlBukti(la.path).then(url => {
              isi(kotak, [el('img', { src: url, style: 'width:100%;height:100%;object-fit:cover;' })]);
              kotak.onclick = () => bukaGambarPenuh(url, la.nama_asli);
            }).catch(() => { isi(kotak, ['Gagal memuat']); });
          } else {
            urlBukti(la.path).then(url => {
              kotak.onclick = () => window.open(url, '_blank', 'noopener');
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      bagian.push(el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' },
        pesanGalat(err)));
    }

    isi(wadah, bagian);
  })();

  return wadah;
}

function bukaGambarPenuh(url, nama) {
  dialog({
    judul: nama || 'Bukti Karya',
    isi: el('div', {}, [
      el('img', { src: url, style: 'max-width:70vw;max-height:70vh;border-radius:var(--radius-sm);' })
    ])
  });
}
