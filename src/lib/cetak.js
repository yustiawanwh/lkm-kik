// src/lib/cetak.js — Menyiapkan lembar cetak hasil pekerjaan murid, agar
// guru bisa mengoreksi secara luring.
//
// Memakai fasilitas cetak peramban, bukan pustaka pembuat PDF. Alasannya:
// isi lembar kerja sudah punya perender sendiri (tabel, kanvas, kalkulator,
// Likert, dsb), sehingga mencetak HTML-nya menghasilkan tampilan yang persis
// sama tanpa perlu menulis ulang semuanya untuk kanvas PDF. Dialog cetak
// peramban juga sudah menyediakan pilihan "Simpan sebagai PDF".
import { el, isi, tanggalId } from './dom.js';
import { buatWidgetLembar } from './lembar-widget.js';
import { isianUntukProgres } from './data-nilai.js';
import { daftarLampiran } from './data-lampiran.js';
import { urlBukti } from './bukti.js';

/** Ubah setiap elemen isian menjadi teks biasa yang bisa dicetak.
 *
 *  Perlu dilakukan karena hampir semua tipe lembar (formulir, kanvas,
 *  tahapan, instrumen, kalkulator, Likert) tetap merender <textarea>,
 *  <input>, atau <select> walaupun sedang mode hanya-baca. Elemen semacam
 *  itu bermasalah saat dicetak: tingginya tetap sehingga teks panjang
 *  terpotong, dan sebagian peramban mengosongkannya sama sekali.
 *
 *  Mengubahnya di sini — bukan di tiap perender — membuat perbaikan ini
 *  berlaku untuk semua tipe lembar sekaligus, termasuk tipe baru nanti. */
function ubahIsianJadiTeks(root) {
  for (const kotak of [...root.querySelectorAll('input, textarea, select')]) {
    const tipe = (kotak.getAttribute('type') || '').toLowerCase();

    // Pilihan bertanda: pertahankan posisinya di dalam tabel, ganti dengan
    // simbol kotak agar jawaban Likert tetap terbaca.
    if (tipe === 'radio' || tipe === 'checkbox') {
      const tanda = el('span', { class: 'cetak-pilihan' }, kotak.checked ? '☑' : '☐');
      kotak.replaceWith(tanda);
      continue;
    }

    let nilai;
    if (kotak.tagName === 'SELECT') {
      nilai = kotak.options[kotak.selectedIndex]?.textContent ?? '';
    } else {
      nilai = kotak.value ?? '';
    }

    const teks = el('div', { class: 'cetak-isian' }, String(nilai).trim() === '' ? '—' : String(nilai));
    // Warisi lebar agar susunan kolom tabel tidak berubah.
    if (kotak.style.width) teks.style.width = kotak.style.width;
    kotak.replaceWith(teks);
  }

  // Tombol dan elemen interaktif lain tidak ada gunanya di kertas.
  for (const t of [...root.querySelectorAll('button')]) t.remove();
}

/** Muat gambar sampai benar-benar siap. Tanpa ini gambar sering kosong di
 *  hasil cetak, karena peramban mencetak sebelum unduhannya selesai. */
function muatGambar(url) {
  return new Promise((selesai) => {
    const img = new Image();
    img.onload = () => selesai(img);
    img.onerror = () => selesai(null);
    img.src = url;
  });
}

function judulPengerja(p) {
  if (p.kelompok_id) return p.kelompok?.nama || 'Kelompok';
  const absen = p.profil?.no_absen ? `${p.profil.no_absen}. ` : '';
  return absen + (p.profil?.nama || 'Murid');
}

/** Kriteria rubrik yang berlaku untuk misi ini (lihat penyaringan di
 *  halaman penilaian) — dicetak sebagai kotak centang untuk diisi tangan. */
function kriteriaMisi(rubrik, kodeMisi) {
  if (!rubrik?.kriteria?.length) return [];
  const kode = String(kodeMisi || '').toLowerCase();
  return rubrik.kriteria.filter(k => {
    const daftar = (k.misi || []).map(x => String(x).toLowerCase());
    return daftar.length === 0 || daftar.includes(kode);
  });
}

/** Susun satu bagian cetak untuk satu baris progres. */
async function bagianSatuPekerjaan(p, rubrik) {
  const bagian = [];

  bagian.push(el('div', { class: 'cetak-kepala' }, [
    el('div', {}, [
      el('div', { class: 'cetak-judul' }, `${p.tugas?.kode || ''} — ${p.tugas?.judul || ''}`),
      el('div', { class: 'cetak-sub' }, judulPengerja(p))
    ]),
    el('div', { class: 'cetak-meta' }, [
      p.diserahkan_pada ? el('div', {}, `Diserahkan ${tanggalId(p.diserahkan_pada, true)}` ) : null,
      p.nilai_huruf ? el('div', {}, `Nilai tersimpan: ${p.nilai_huruf} (${p.nilai_angka ?? '-'})`) : null
    ])
  ]));

  // ---- Lembar kerja ----
  try {
    const daftarIsian = await isianUntukProgres(p);
    if (daftarIsian.length === 0) {
      bagian.push(el('div', { class: 'cetak-kosong' }, 'Misi ini tidak tertaut ke lembar kerja.'));
    } else {
      for (const { lembar, isian } of daftarIsian) {
        let isiLembar;
        if (isian.id) {
          isiLembar = buatWidgetLembar({
            lembar, isian, bisaEdit: false, profil: null,
            anggotaKelompok: [], tampilanGuru: true
          }).elemen;
          ubahIsianJadiTeks(isiLembar);
        } else {
          isiLembar = el('div', { class: 'cetak-kosong' }, 'Belum diisi murid.');
        }
        bagian.push(el('div', { class: 'cetak-blok' }, [
          el('div', { class: 'cetak-label' }, `${lembar.kode} — ${lembar.judul}`),
          isiLembar
        ]));
      }
    }
  } catch {
    bagian.push(el('div', { class: 'cetak-kosong' }, 'Isi lembar kerja gagal dimuat.'));
  }

  // ---- Bukti karya ----
  try {
    const lampiran = await daftarLampiran(p.id);
    if (lampiran.length > 0) {
      const galeri = el('div', { class: 'cetak-galeri' });
      for (const la of lampiran) {
        if (!la.mime?.startsWith('image/')) {
          galeri.appendChild(el('div', { class: 'cetak-berkas' }, `Berkas: ${la.nama_asli || la.path}`));
          continue;
        }
        try {
          const url = await urlBukti(la.path);
          const img = await muatGambar(url);
          galeri.appendChild(el('figure', { class: 'cetak-gambar' }, [
            img ? el('img', { src: url }) : el('div', { class: 'cetak-kosong' }, 'Gambar gagal dimuat'),
            el('figcaption', {}, la.nama_asli || '')
          ]));
        } catch {
          galeri.appendChild(el('div', { class: 'cetak-kosong' }, 'Gambar gagal dimuat.'));
        }
      }
      bagian.push(el('div', { class: 'cetak-blok' }, [
        el('div', { class: 'cetak-label' }, 'Bukti Karya'),
        galeri
      ]));
    }
  } catch { /* lampiran tidak wajib ada */ }

  // ---- Lembar koreksi tangan ----
  const kriteria = kriteriaMisi(rubrik, p.tugas?.kode);
  const maks = rubrik?.skor_maks || 4;
  bagian.push(el('div', { class: 'cetak-blok cetak-koreksi' }, [
    el('div', { class: 'cetak-label' }, 'Koreksi Guru'),
    kriteria.length > 0
      ? el('table', { class: 'cetak-tabel-rubrik' }, [
          el('thead', {}, el('tr', {}, [
            el('th', {}, 'Kriteria'),
            ...Array.from({ length: maks }, (_, i) => el('th', { class: 'kolom-skor' }, String(maks - i)))
          ])),
          el('tbody', {}, kriteria.map(k => el('tr', {}, [
            el('td', {}, k.nama),
            ...Array.from({ length: maks }, () => el('td', { class: 'kolom-skor' }, '☐'))
          ])))
        ])
      : el('div', { class: 'cetak-kosong' }, 'Rubrik tidak diatur untuk misi ini — tulis nilai langsung di bawah.'),
    el('div', { class: 'cetak-catatan' }, [
      el('div', {}, 'Catatan / umpan balik:'),
      el('div', { class: 'garis-tulis' }), el('div', { class: 'garis-tulis' }), el('div', { class: 'garis-tulis' })
    ]),
    el('div', { class: 'cetak-nilai-akhir' }, [
      el('span', {}, 'Nilai akhir: __________'),
      el('span', {}, 'Paraf: __________')
    ])
  ]));

  return el('section', { class: 'cetak-bagian' }, bagian);
}

/**
 * Bangun dokumen cetak lalu buka dialog cetak peramban.
 * @param {object[]} daftar  baris progres yang akan dicetak
 * @param {object}   info    { judulHalaman, namaKelas, namaProgram, rubrik }
 * @param {Function} onKemajuan  (sudah, total) — untuk menampilkan kemajuan
 */
export async function cetakPekerjaan(daftar, info, onKemajuan) {
  const wadah = document.getElementById('area-cetak') || el('div', { id: 'area-cetak' });
  wadah.id = 'area-cetak';
  isi(wadah, [el('div', { class: 'cetak-tunggu' }, 'Menyiapkan halaman cetak…')]);
  if (!wadah.parentNode) document.body.appendChild(wadah);

  const bagian = [
    el('header', { class: 'cetak-sampul' }, [
      el('h1', {}, info.namaProgram || 'Hasil Pekerjaan Murid'),
      el('div', { class: 'cetak-sub' },
        [info.namaKelas, `${daftar.length} pekerjaan`, `Dicetak ${tanggalId(new Date().toISOString(), true)}`]
          .filter(Boolean).join(' · '))
    ])
  ];

  let sudah = 0;
  for (const p of daftar) {
    bagian.push(await bagianSatuPekerjaan(p, info.rubrik));
    sudah += 1;
    onKemajuan?.(sudah, daftar.length);
  }

  isi(wadah, bagian);

  // Beri peramban satu putaran gambar agar tata letaknya mantap dulu.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  document.body.classList.add('sedang-cetak');
  const bersihkan = () => {
    document.body.classList.remove('sedang-cetak');
    window.removeEventListener('afterprint', bersihkan);
  };
  window.addEventListener('afterprint', bersihkan);
  window.print();
  // Sebagian peramban tidak memancarkan afterprint; bersihkan sebagai cadangan.
  setTimeout(bersihkan, 60000);
}
