// src/lib/pembangun-lembar.js — Pembangun struktur lembar kerja secara
// visual, menggantikan keharusan guru mengetik JSON mentah.
//
// Setiap tipe lembar punya bentuk struktur berbeda; modul ini menyediakan
// antarmuka isian yang sesuai untuk tiap tipe, lalu MENGHASILKAN objek
// struktur yang bentuknya persis sama dengan yang dulu ditulis manual —
// jadi lembar lama tetap terbaca dan mode lanjutan (JSON) tetap tersedia
// bagi yang membutuhkannya.
import { el, isi, roti, dialog } from './dom.js';
import { ikon } from './ikon.js';

/** Tipe yang tidak memerlukan struktur sama sekali. */
const TANPA_STRUKTUR = ['kalkulator', 'sejawat', 'sikap', 'referensi'];

/** Tipe yang punya bawaan lengkap; struktur hanya untuk menimpa. */
const PUNYA_BAWAAN = { kanvas: 'blok', tahapan: 'tahap' };

/**
 * Buat pembangun struktur.
 * @returns {{ elemen, setTipe, ambilStruktur }}
 */
export function buatPembangunLembar(tipeAwal, strukturAwal = {}) {
  let tipe = tipeAwal;
  let struktur = JSON.parse(JSON.stringify(strukturAwal || {}));
  let modeLanjutan = false;

  const wadah = el('div', {});

  // ---------- Daftar teks sederhana (poin, pertanyaan) ----------
  function daftarTeks({ kunci, label, placeholder, banyakBaris = false }) {
    const daftar = Array.isArray(struktur[kunci]) ? struktur[kunci] : [];
    const area = el('div', {});

    function gambar() {
      isi(area, [
        ...daftar.map((teks, i) => el('div', { style: 'display:flex;gap:6px;align-items:flex-start;margin-bottom:6px;' }, [
          el('span', { style: 'width:22px;flex-shrink:0;text-align:right;color:var(--abu-teks-halus);font-size:12px;padding-top:10px;' }, String(i + 1)),
          el(banyakBaris ? 'textarea' : 'input', {
            value: banyakBaris ? undefined : teks,
            placeholder,
            style: banyakBaris ? 'min-height:56px;' : '',
            oninput: (e) => { daftar[i] = e.target.value; struktur[kunci] = daftar; }
          }, banyakBaris ? teks : undefined),
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil', type: 'button',
            title: 'Hapus', style: 'flex-shrink:0;margin-top:2px;',
            onclick: () => { daftar.splice(i, 1); struktur[kunci] = daftar; gambar(); }
          }, ikon('tutup', 14))
        ])),
        el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
          onclick: () => { daftar.push(''); struktur[kunci] = daftar; gambar(); }
        }, [ikon('tambah', 14), el('span', {}, ' Tambah')])
      ]);
    }
    gambar();

    return el('div', { class: 'medan' }, [
      el('label', {}, label),
      area
    ]);
  }

  // ---------- Kolom untuk Matriks / Daftar ----------
  function bagianKolom() {
    const kolom = Array.isArray(struktur.kolom) ? struktur.kolom : [];
    const terhitung = Array.isArray(struktur.kolom_terhitung) ? struktur.kolom_terhitung : [];
    const areaKolom = el('div', {});
    const areaHitung = el('div', {});

    function gambarKolom() {
      isi(areaKolom, [
        ...kolom.map((nama, i) => el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;' }, [
          el('span', { style: 'width:22px;flex-shrink:0;text-align:right;color:var(--abu-teks-halus);font-size:12px;' }, String(i)),
          el('input', {
            value: nama, placeholder: 'Nama kolom',
            oninput: (e) => { kolom[i] = e.target.value; struktur.kolom = kolom; }
          }),
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
            onclick: () => { kolom.splice(i, 1); struktur.kolom = kolom; gambarKolom(); gambarHitung(); }
          }, ikon('tutup', 14))
        ])),
        el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
          onclick: () => { kolom.push(''); struktur.kolom = kolom; gambarKolom(); gambarHitung(); }
        }, [ikon('tambah', 14), el('span', {}, ' Tambah Kolom')])
      ]);
    }

    function gambarHitung() {
      isi(areaHitung, [
        ...terhitung.map((t, i) => el('div', { class: 'kartu', style: 'padding:10px;margin-bottom:8px;background:var(--permukaan-2);' }, [
          el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:8px;' }, [
            el('input', {
              value: t.label || '', placeholder: 'Nama kolom hasil (mis. Total)',
              oninput: (e) => { t.label = e.target.value; struktur.kolom_terhitung = terhitung; }
            }),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              onclick: () => { terhitung.splice(i, 1); struktur.kolom_terhitung = terhitung; gambarHitung(); }
            }, ikon('tutup', 14))
          ]),
          el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:6px;' }, 'Jumlahkan kolom:'),
          el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, kolom.map((nama, ki) => {
            const dipilih = (t.dari || []).includes(ki);
            return el('button', {
              type: 'button',
              class: `tombol tombol-kecil ${dipilih ? 'tombol-primer' : 'tombol-sekunder'}`,
              onclick: () => {
                t.dari = t.dari || [];
                const idx = t.dari.indexOf(ki);
                if (idx >= 0) t.dari.splice(idx, 1); else t.dari.push(ki);
                t.dari.sort((a, b) => a - b);
                struktur.kolom_terhitung = terhitung;
                gambarHitung();
              }
            }, nama || `Kolom ${ki}`);
          }))
        ])),
        el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
          onclick: () => { terhitung.push({ label: 'Total', dari: [] }); struktur.kolom_terhitung = terhitung; gambarHitung(); }
        }, [ikon('tambah', 14), el('span', {}, ' Tambah Kolom Terhitung')])
      ]);
    }

    gambarKolom(); gambarHitung();

    return el('div', {}, [
      el('div', { class: 'medan' }, [
        el('label', {}, 'Kolom Tabel'),
        el('div', { class: 'keterangan', style: 'margin:0 0 8px;' }, 'Kolom yang akan diisi murid, urut dari kiri ke kanan.'),
        areaKolom
      ]),
      el('div', { class: 'medan' }, [
        el('label', {}, 'Kolom Terhitung Otomatis (opsional)'),
        el('div', { class: 'keterangan', style: 'margin:0 0 8px;' }, 'Kolom hasil penjumlahan, mis. "Total" pada matriks penyaringan gagasan.'),
        areaHitung
      ])
    ]);
  }

  // ---------- Medan untuk Formulir ----------
  function bagianMedan() {
    const medan = Array.isArray(struktur.medan) ? struktur.medan : [];
    const area = el('div', {});

    function gambar() {
      isi(area, [
        ...medan.map((m, i) => el('div', { class: 'kartu', style: 'padding:10px;margin-bottom:8px;background:var(--permukaan-2);' }, [
          el('div', { style: 'display:flex;gap:6px;align-items:center;' }, [
            el('input', {
              value: m.label || '', placeholder: 'Pertanyaan / label isian',
              oninput: (e) => {
                m.label = e.target.value;
                if (!m.key) m.key = `m${i + 1}`;
                struktur.medan = medan;
              }
            }),
            el('select', {
              style: 'width:150px;flex-shrink:0;',
              onchange: (e) => { m.tipe = e.target.value; struktur.medan = medan; }
            }, [
              el('option', { value: 'textarea', selected: (m.tipe ?? 'textarea') === 'textarea' }, 'Jawaban panjang'),
              el('option', { value: 'input', selected: m.tipe === 'input' }, 'Jawaban pendek')
            ]),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              onclick: () => { medan.splice(i, 1); struktur.medan = medan; gambar(); }
            }, ikon('tutup', 14))
          ])
        ])),
        el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
          onclick: () => { medan.push({ key: `m${medan.length + 1}`, label: '', tipe: 'textarea' }); struktur.medan = medan; gambar(); }
        }, [ikon('tambah', 14), el('span', {}, ' Tambah Isian')])
      ]);
    }
    gambar();

    return el('div', { class: 'medan' }, [
      el('label', {}, 'Daftar Isian'),
      el('div', { class: 'keterangan', style: 'margin:0 0 8px;' }, 'Tiap baris menjadi satu pertanyaan yang diisi murid.'),
      area
    ]);
  }

  // ---------- Likert: butir + klaster ----------
  function bagianLikert() {
    const butir = Array.isArray(struktur.butir) ? struktur.butir : [];
    const klaster = Array.isArray(struktur.klaster) ? struktur.klaster : [];
    const areaButir = el('div', {});
    const areaKlaster = el('div', {});

    function gambarButir() {
      isi(areaButir, [
        ...butir.map((teks, i) => el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:5px;' }, [
          el('span', { style: 'width:24px;flex-shrink:0;text-align:right;color:var(--abu-teks-halus);font-size:12px;' }, String(i + 1)),
          el('input', {
            value: teks, placeholder: 'Pernyataan',
            oninput: (e) => { butir[i] = e.target.value; struktur.butir = butir; }
          }),
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
            onclick: () => { butir.splice(i, 1); struktur.butir = butir; gambarButir(); gambarKlaster(); }
          }, ikon('tutup', 14))
        ])),
        el('div', { style: 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;' }, [
          el('button', {
            class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
            onclick: () => { butir.push(''); struktur.butir = butir; gambarButir(); gambarKlaster(); }
          }, [ikon('tambah', 14), el('span', {}, ' Tambah Pernyataan')]),
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil', type: 'button',
            onclick: () => tempelBanyakButir(butir, () => { struktur.butir = butir; gambarButir(); gambarKlaster(); })
          }, 'Tempel Banyak Sekaligus')
        ])
      ]);
    }

    function gambarKlaster() {
      isi(areaKlaster, [
        ...klaster.map((k, i) => el('div', { class: 'kartu', style: 'padding:10px;margin-bottom:8px;background:var(--permukaan-2);' }, [
          el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:8px;' }, [
            el('input', {
              value: k.kode || '', placeholder: 'Kode', style: 'width:90px;flex-shrink:0;',
              oninput: (e) => { k.kode = e.target.value; struktur.klaster = klaster; }
            }),
            el('input', {
              value: k.nama || '', placeholder: 'Nama klaster',
              oninput: (e) => { k.nama = e.target.value; struktur.klaster = klaster; }
            }),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              onclick: () => { klaster.splice(i, 1); struktur.klaster = klaster; gambarKlaster(); }
            }, ikon('tutup', 14))
          ]),
          el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:6px;' }, 'Nomor pernyataan yang masuk klaster ini:'),
          el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;' }, butir.map((_, bi) => {
            const nomor = bi + 1;
            const dipilih = (k.butir || []).includes(nomor);
            return el('button', {
              type: 'button',
              class: `tombol tombol-kecil ${dipilih ? 'tombol-primer' : 'tombol-sekunder'}`,
              style: 'min-width:34px;padding:4px 6px;justify-content:center;',
              onclick: () => {
                k.butir = k.butir || [];
                const idx = k.butir.indexOf(nomor);
                if (idx >= 0) k.butir.splice(idx, 1); else k.butir.push(nomor);
                k.butir.sort((a, b) => a - b);
                struktur.klaster = klaster;
                gambarKlaster();
              }
            }, String(nomor));
          }))
        ])),
        el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
          onclick: () => { klaster.push({ kode: '', nama: '', butir: [] }); struktur.klaster = klaster; gambarKlaster(); }
        }, [ikon('tambah', 14), el('span', {}, ' Tambah Klaster')])
      ]);
    }

    gambarButir(); gambarKlaster();

    return el('div', {}, [
      el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
        'Skala bawaan: SS=4, S=3, KS=2, TS=1. Skor tiap klaster dan peringkatnya dihitung otomatis untuk murid.'),
      el('div', { class: 'medan' }, [
        el('label', {}, 'Pernyataan Instrumen'),
        areaButir
      ]),
      el('div', { class: 'medan' }, [
        el('label', {}, 'Klaster Penilaian'),
        el('div', { class: 'keterangan', style: 'margin:0 0 8px;' }, 'Kelompokkan pernyataan ke klaster. Klik nomor untuk memasukkan atau mengeluarkan.'),
        areaKlaster
      ])
    ]);
  }

  /** Tempel banyak baris sekaligus — mempercepat memasukkan puluhan butir. */
  function tempelBanyakButir(butir, selesai) {
    const ta = el('textarea', {
      style: 'min-height:200px;width:100%;', placeholder: 'Satu pernyataan per baris…'
    });
    const { tutup } = dialog({
      judul: 'Tempel Banyak Pernyataan',
      isi: el('div', {}, [
        el('div', { class: 'keterangan', style: 'margin-bottom:8px;' }, 'Tempel dari dokumen, satu pernyataan per baris. Baris kosong diabaikan. Daftar lama akan diganti.'),
        ta,
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;' }, [
          el('button', { class: 'tombol tombol-sekunder', type: 'button', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer', type: 'button',
            onclick: () => {
              const baris = ta.value.split('\n').map(t => t.trim()).filter(Boolean);
              if (baris.length === 0) { roti('Tidak ada baris terbaca.', 'galat'); return; }
              butir.length = 0;
              baris.forEach(b => butir.push(b));
              tutup(); selesai();
              roti(`${baris.length} pernyataan dimuat.`, 'sukses');
            }
          }, 'Muat')
        ])
      ])
    });
  }

  // ---------- Mode lanjutan (JSON mentah) ----------
  function bagianJson() {
    return el('div', { class: 'medan' }, [
      el('label', {}, 'Struktur (JSON)'),
      el('div', { class: 'keterangan', style: 'margin:0 0 8px;' }, 'Mode lanjutan — untuk bentuk khusus yang belum tersedia di pembangun visual.'),
      el('textarea', {
        id: 'l-struktur-json',
        style: 'font-family:ui-monospace,monospace;font-size:12px;min-height:170px;'
      }, JSON.stringify(struktur, null, 2))
    ]);
  }

  // ---------- Render utama ----------
  function gambar() {
    const isiTipe = [];

    if (modeLanjutan) {
      isiTipe.push(bagianJson());
    } else if (TANPA_STRUKTUR.includes(tipe)) {
      isiTipe.push(el('div', { class: 'panel-info' },
        tipe === 'kalkulator'
          ? 'Tipe Kalkulator tidak perlu diatur — murid langsung mengisi baris pemasukan/pengeluaran, dan totalnya dihitung otomatis.'
          : 'Tipe ini tidak memerlukan pengaturan struktur.'));
    } else if (tipe === 'matriks' || tipe === 'daftar') {
      isiTipe.push(bagianKolom());
    } else if (tipe === 'likert') {
      isiTipe.push(bagianLikert());
    } else if (tipe === 'instrumen') {
      isiTipe.push(el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
        'Kosongkan daftar untuk mode wawancara bebas — murid menulis sendiri pertanyaan dan jawabannya.'));
      isiTipe.push(daftarTeks({
        kunci: 'pertanyaan', label: 'Daftar Pertanyaan Tetap (opsional)',
        placeholder: 'Pertanyaan wawancara'
      }));
    } else if (tipe === 'kesepakatan') {
      isiTipe.push(el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
        'Kosongkan untuk memakai tiga poin kesepakatan bawaan.'));
      isiTipe.push(daftarTeks({
        kunci: 'poin', label: 'Poin Kesepakatan',
        placeholder: 'Poin yang disepakati bersama', banyakBaris: true
      }));
    } else if (PUNYA_BAWAAN[tipe]) {
      isiTipe.push(el('div', { class: 'panel-info' },
        tipe === 'kanvas'
          ? 'Tipe Kanvas memakai 9 blok Business Model Canvas standar. Untuk menyusun blok sendiri, gunakan mode lanjutan.'
          : 'Tipe Tahapan memakai 5 tahap Design Thinking standar (Empathize hingga Test). Untuk mengubahnya, gunakan mode lanjutan.'));
    } else {
      isiTipe.push(bagianMedan());
    }

    isi(wadah, [
      ...isiTipe,
      el('div', { style: 'display:flex;justify-content:flex-end;margin-top:4px;' }, [
        el('button', {
          class: 'tombol tombol-hantu tombol-kecil', type: 'button',
          onclick: () => {
            if (modeLanjutan) {
              const ta = document.getElementById('l-struktur-json');
              try { struktur = JSON.parse(ta.value || '{}'); }
              catch { roti('JSON belum valid — perbaiki dulu sebelum kembali ke mode visual.', 'galat'); return; }
            }
            modeLanjutan = !modeLanjutan;
            gambar();
          }
        }, modeLanjutan ? 'Kembali ke Mode Visual' : 'Mode Lanjutan (JSON)')
      ])
    ]);
  }

  gambar();

  return {
    elemen: wadah,
    setTipe(tipeBaru) { tipe = tipeBaru; gambar(); },
    ambilStruktur() {
      if (modeLanjutan) {
        const ta = document.getElementById('l-struktur-json');
        return JSON.parse(ta.value || '{}');
      }
      // Buang entri kosong agar struktur tetap bersih.
      const bersih = JSON.parse(JSON.stringify(struktur));
      for (const k of ['kolom', 'butir', 'poin', 'pertanyaan']) {
        if (Array.isArray(bersih[k])) {
          bersih[k] = bersih[k].filter(x => String(x).trim() !== '');
          if (bersih[k].length === 0) delete bersih[k];
        }
      }
      if (Array.isArray(bersih.medan)) {
        bersih.medan = bersih.medan.filter(m => (m.label || '').trim() !== '');
        if (bersih.medan.length === 0) delete bersih.medan;
      }
      if (Array.isArray(bersih.klaster)) {
        bersih.klaster = bersih.klaster.filter(k => (k.kode || k.nama) && (k.butir || []).length > 0);
        if (bersih.klaster.length === 0) delete bersih.klaster;
      }
      if (Array.isArray(bersih.kolom_terhitung)) {
        bersih.kolom_terhitung = bersih.kolom_terhitung.filter(t => (t.dari || []).length > 0);
        if (bersih.kolom_terhitung.length === 0) delete bersih.kolom_terhitung;
      }
      return bersih;
    }
  };
}
