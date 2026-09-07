// src/halaman/rekap.js — Rekap Nilai (Fase 8): pilih kelas, lihat rekap, ekspor CSV.
import { el, isi, roti } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { daftarKelasGuru } from '../lib/data-kelas.js';
import { rekapKelas, rekapKeCSV, LABEL_RANAH, programDiKelas } from '../lib/data-rekap.js';

const WARNA_NILAI = (n) => n === null ? '' : n >= 85 ? 'nilai-hijau' : n >= 70 ? 'nilai-kuning' : 'nilai-merah';

export async function renderRekap(root, { profil, onKeluar }) {
  let memuat = true, galat = '';
  let kelasList = [], kelasTerpilih = null, baris = [], aturan = null;
  let programList = [], tpTerpilih = '';   // '' = semua TP

  async function muatKelas() {
    memuat = true; render();
    try {
      kelasList = await daftarKelasGuru();
      if (kelasList.length > 0) { kelasTerpilih = kelasList[0].id; await muatProgram(); await muatRekap(); }
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  /** Muat daftar TP milik kelas terpilih. */
  async function muatProgram() {
    try {
      programList = await programDiKelas(kelasTerpilih);
      // Kalau TP yang sedang dipilih tidak ada di kelas baru, kembali ke semua.
      if (tpTerpilih && !programList.some(p => p.id === tpTerpilih)) tpTerpilih = '';
    } catch (err) { roti(pesanGalat(err), 'galat'); programList = []; }
  }

  async function muatRekap() {
    if (!kelasTerpilih) return;
    memuat = true; render();
    try {
      const hasil = await rekapKelas(kelasTerpilih, tpTerpilih || null);
      baris = hasil.baris; aturan = hasil.aturan;
    }
    catch (err) { roti(pesanGalat(err), 'galat'); }
    finally { memuat = false; render(); }
  }

  function unduhCSV() {
    const namaKelas = kelasList.find(k => k.id === kelasTerpilih)?.nama || 'kelas';
    const namaTp = tpTerpilih
      ? (programList.find(p => p.id === tpTerpilih)?.kode || 'TP')
      : 'semua-TP';
    const csv = rekapKeCSV(baris, aturan);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM agar Excel baca UTF-8 benar
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rekap-nilai-${namaKelas.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    roti('CSV diunduh.', 'sukses');
  }

  function render() {
    if (memuat && kelasList.length === 0) {
      isi(root, renderShell({ profil, judulHalaman: 'Rekap Nilai', onKeluar, konten: el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat…') }));
      return;
    }
    if (galat) {
      isi(root, renderShell({ profil, judulHalaman: 'Rekap Nilai', onKeluar, konten: el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat) }));
      return;
    }
    if (kelasList.length === 0) {
      isi(root, renderShell({ profil, judulHalaman: 'Rekap Nilai', onKeluar, konten: el('div', { class: 'kartu-kosong' }, 'Belum ada kelas. Buat kelas dulu di menu Kelas.') }));
      return;
    }

    const tabel = baris.length === 0
      ? el('div', { class: 'kartu-kosong' }, 'Belum ada murid atau belum ada nilai di kelas ini.')
      : el('table', { style: 'width:100%;border-collapse:collapse;' }, [
          el('thead', {}, el('tr', {}, [
            th('No'), th('Nama'),
            ...(aturan?.tampilkan ? [th(LABEL_RANAH.kognitif), th(LABEL_RANAH.psikomotor), th(LABEL_RANAH.afektif)] : []),
            th('Nilai Akhir'), th('Misi'), th('XP'), th('Badge')
          ])),
          el('tbody', {}, baris.map(b => el('tr', {}, [
            td(b.noAbsen || '—'),
            td(b.nama),
            ...(aturan?.tampilkan ? [
              selNilai(b.kognitif),
              selNilai(b.psikomotor),
              selNilai(b.afektif, sumberAfektif(b))
            ] : []),
            selNilai(b.rataRata),
            td(b.misiSelesai), td(b.totalXp), td(b.jumlahBadge)
          ])))
        ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Rekap Nilai', sub: 'Ringkasan nilai, XP, dan badge per kelas.', onKeluar,
      konten: [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;' }, [
          el('select', {
            style: 'max-width:280px;',
            onchange: async (e) => { kelasTerpilih = e.target.value; await muatProgram(); muatRekap(); }
          }, kelasList.map(k => el('option', { value: k.id, selected: k.id === kelasTerpilih }, k.nama))),
          el('select', {
            style: 'max-width:320px;',
            onchange: (e) => { tpTerpilih = e.target.value; muatRekap(); }
          }, [
            el('option', { value: '', selected: tpTerpilih === '' }, 'Semua TP (gabungan)'),
            ...programList.map(p => el('option', { value: p.id, selected: p.id === tpTerpilih },
              `${p.kode ? p.kode + ' — ' : ''}${p.judul}`))
          ]),
          el('button', { class: 'tombol tombol-primer', onclick: unduhCSV, disabled: baris.length === 0 }, ikonTeks('unduh', 'Unduh CSV'))
        ]),
        (!memuat && !tpTerpilih && programList.length > 1)
          ? el('div', { class: 'panel-info', style: 'margin-bottom:12px;background:var(--kuning-lembut);border-color:transparent;color:var(--kuning-teks);' },
              `Kelas ini mengerjakan ${programList.length} TP. Angka di bawah adalah GABUNGAN semuanya. Untuk rapor, pilih satu TP di atas.`)
          : null,
        (!memuat && aturan?.tampilkan) ? el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:12px;' },
          aturan.pakai_bobot
            ? `Nilai Akhir dihitung berbobot: Kognitif ${aturan.bobot.kognitif}%, Psikomotor ${aturan.bobot.psikomotor}%, Afektif ${aturan.bobot.afektif}%. Ranah yang belum ada nilainya dilewati dan bobotnya dinormalkan ulang.`
            : 'Nilai Akhir masih rata-rata seluruh misi. Untuk menghitungnya berbobot per ranah, aktifkan di halaman Pengaturan.') : null,
        memuat ? el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat rekap…') : el('div', { class: 'kartu', style: 'overflow-x:auto;' }, tabel)
      ]
    }));
  }

  function selNilai(n, judul) {
    return el('td', { style: 'padding:8px;border-bottom:1px solid var(--garis-halus);', title: judul || '' },
      (n === null || n === undefined)
        ? el('span', { style: 'color:var(--abu-teks-halus);' }, '—')
        : el('span', { class: `nilai-kotak ${WARNA_NILAI(n)}` }, n.toFixed(1)));
  }

  /** Jelaskan nilai afektif berasal dari mana, terlihat saat kursor diarahkan. */
  function sumberAfektif(b) {
    const punyaRubrik = b.afektifRubrik !== null && b.afektifRubrik !== undefined;
    const punyaSikap = b.afektifSikap !== null && b.afektifSikap !== undefined;
    if (aturan?.sumber_afektif === 'rubrik') return 'Dari kriteria rubrik bertanda afektif';
    if (aturan?.sumber_afektif === 'sikap') return 'Dari observasi sikap guru';
    if (punyaRubrik && punyaSikap) {
      return `Rata-rata dari rubrik (${b.afektifRubrik.toFixed(1)}) dan observasi sikap (${b.afektifSikap.toFixed(1)})`;
    }
    if (punyaRubrik) return `Hanya dari rubrik (${b.afektifRubrik.toFixed(1)}) — belum ada observasi sikap`;
    if (punyaSikap) return `Hanya dari observasi sikap (${b.afektifSikap.toFixed(1)}) — rubrik belum bertanda afektif`;
    return 'Belum ada data afektif';
  }

  function th(label) { return el('th', { style: 'text-align:left;padding:8px;border-bottom:2px solid var(--garis);font-size:13px;color:var(--abu-teks);' }, label); }
  function td(v) { return el('td', { style: 'padding:8px;border-bottom:1px solid var(--garis-halus);font-size:13px;' }, String(v)); }

  render();
  await muatKelas();
}
