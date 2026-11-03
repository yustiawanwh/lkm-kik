// src/lib/rujukan-sejawat.js — Panel rujukan penilaian sejawat.
//
// Penilaian sejawat sengaja TIDAK dihitung otomatis ke nilai afektif.
// Kelompok di sini kecil (4–5 penilai), sehingga satu penilai yang kesal
// atau satu kesepakatan saling mengatrol sudah cukup menggeser angkanya —
// dan murid tidak bisa menelusuri asal nilainya karena skor sejawat memang
// dirahasiakan dari yang dinilai.
//
// Karena itu perannya sebagai RUJUKAN: ditampilkan tepat di tempat guru
// menilai afektif, lalu gurulah yang memutuskan.
import { el } from './dom.js';

/** Ringkas satu kumpulan baris penilaian_sejawat menjadi angka & komentar. */
export function ringkasSejawat(baris) {
  const nilai = [];
  const komentar = [];
  for (const b of baris || []) {
    const angka = Object.values(b.skor || {}).map(Number).filter(n => !isNaN(n));
    if (angka.length) nilai.push(angka.reduce((a, c) => a + c, 0) / angka.length);
    if (b.komentar) komentar.push({ dari: b.penilai?.nama || 'Rekan', teks: b.komentar });
  }
  if (nilai.length === 0) return { jumlah: 0, rata: null, min: null, maks: null, komentar };
  return {
    jumlah: nilai.length,
    rata: nilai.reduce((a, c) => a + c, 0) / nilai.length,
    min: Math.min(...nilai),
    maks: Math.max(...nilai),
    komentar
  };
}

/** Satu baris ringkasan: nama, rata-rata, jumlah penilai, rentang, komentar. */
function barisRingkas(nama, baris) {
  const r = ringkasSejawat(baris);
  if (r.jumlah === 0) {
    return el('div', { class: 'baris-sejawat' }, [
      el('span', { style: 'font-weight:600;font-size:13px;' }, nama),
      el('span', { style: 'font-size:12px;color:var(--abu-teks-halus);' }, ' belum dinilai rekan')
    ]);
  }
  // Rentang ditampilkan supaya guru melihat bila penilaiannya terbelah —
  // rata-rata saja bisa menyembunyikan itu.
  const terbelah = (r.maks - r.min) >= 2;
  return el('div', { class: 'baris-sejawat' }, [
    el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:baseline;' }, [
      el('span', { style: 'font-weight:600;font-size:13px;' }, nama),
      el('span', { style: `font-weight:700;font-size:13px;color:${warnaSkor(r.rata)};` },
        `${r.rata.toFixed(1)} / 5`)
    ]),
    el('div', { style: 'font-size:11.5px;color:var(--abu-teks);margin-top:2px;' },
      `${r.jumlah} penilai · rentang ${r.min.toFixed(1)}–${r.maks.toFixed(1)}` +
      (terbelah ? ' · penilaian terbelah' : '')),
    ...r.komentar.map(k => el('div', { class: 'komentar-sejawat' }, `"${k.teks}" — ${k.dari}`))
  ]);
}

function warnaSkor(rata) {
  if (rata >= 4) return 'var(--hijau)';
  if (rata >= 3) return 'var(--kuning)';
  return 'var(--merah)';
}

/** Pecah baris penilaian menurut TP asalnya.
 *  Skor sejawat terikat pada penugasan, sehingga seorang murid wajar punya
 *  angka berbeda di TP berbeda. Meleburnya jadi satu rata-rata akan
 *  menyembunyikan justru hal yang perlu dilihat guru. */
export function pecahPerTp(baris) {
  const peta = new Map();
  for (const b of baris || []) {
    const tp = b.tujuan_pembelajaran;
    const kunci = tp?.id || '_';
    if (!peta.has(kunci)) {
      peta.set(kunci, { label: tp ? (tp.kode || tp.judul) : 'Tanpa TP', baris: [] });
    }
    peta.get(kunci).baris.push(b);
  }
  return [...peta.values()].sort((a, b) =>
    String(a.label).localeCompare(String(b.label), 'id', { numeric: true }));
}

/**
 * Panel rujukan untuk satu atau beberapa murid.
 * @param {{nama:string, baris:object[]}[]} daftar
 * @param {object} opsi
 * @param {boolean} [opsi.perTp]  pecah tiap murid menurut TP asalnya
 */
export function panelRujukanSejawat(daftar, { judul = 'Rujukan: Nilai Rekan', perTp = false } = {}) {
  const adaIsi = daftar.some(d => (d.baris || []).length > 0);

  return el('details', { class: 'rujukan-sejawat' }, [
    el('summary', {}, judul),
    el('div', { style: 'margin-top:8px;' }, [
      el('div', { class: 'keterangan', style: 'margin-bottom:8px;' },
        'Skor 1–5 dari rekan sekelompok. Ini bahan pertimbangan, bukan nilai yang dihitung otomatis — ' +
        'kelompok kecil membuat satu penilai ekstrem berpengaruh besar.'),
      !adaIsi
        ? el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, 'Belum ada penilaian sejawat yang masuk.')
        : el('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, daftar.flatMap(d => {
            // Mode per TP: satu baris untuk tiap TP, agar perbedaan antar
            // unit terlihat alih-alih tertutup rata-rata gabungan.
            if (perTp) {
              const kelompokTp = pecahPerTp(d.baris);
              if (kelompokTp.length === 0) {
                return [el('div', { class: 'baris-sejawat' }, [
                  el('span', { style: 'font-weight:600;font-size:13px;' }, d.nama),
                  el('span', { style: 'font-size:12px;color:var(--abu-teks-halus);' }, 'belum dinilai rekan')
                ])];
              }
              return kelompokTp.map(g => barisRingkas(`${d.nama} · ${g.label}`, g.baris));
            }
            return [barisRingkas(d.nama, d.baris)];
          }))
    ])
  ]);
}
