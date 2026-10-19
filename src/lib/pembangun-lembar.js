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

    /** Daftar pilihan untuk medan bertipe pilihan. Hanya digambar bila
     *  tipenya memang pilihan, supaya isian teks biasa tetap sederhana. */
    function bagianOpsi(m) {
      const opsi = Array.isArray(m.opsi) ? m.opsi : (m.opsi = []);
      const wadahOpsi = el('div', { style: 'margin-top:8px;' });

      function gambarOpsi() {
        isi(wadahOpsi, [
          el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:5px;' }, 'Pilihan yang tersedia:'),
          ...opsi.map((o, oi) => el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:5px;' }, [
            el('span', { style: 'width:18px;flex-shrink:0;text-align:right;color:var(--abu-teks-halus);font-size:12px;' }, String(oi + 1)),
            el('input', {
              value: o, placeholder: 'mis. Ya, bisa dibuat',
              oninput: (e) => { opsi[oi] = e.target.value; struktur.medan = medan; }
            }),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              onclick: () => { opsi.splice(oi, 1); gambarOpsi(); }
            }, ikon('tutup', 14))
          ])),
          el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px;' }, [
            el('button', {
              class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
              onclick: () => { opsi.push(''); gambarOpsi(); }
            }, [ikon('tambah', 14), el('span', {}, ' Tambah Pilihan')]),
            el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12.5px;' }, [
              el('input', {
                type: 'checkbox', checked: !!m.lain_lain,
                onchange: (e) => { m.lain_lain = e.target.checked; struktur.medan = medan; }
              }),
              el('span', {}, 'Sediakan kotak "Lainnya"')
            ])
          ])
        ]);
      }
      gambarOpsi();
      return wadahOpsi;
    }

    function gambar() {
      isi(area, [
        ...medan.map((m, i) => {
          const tipeSekarang = m.tipe ?? 'textarea';
          const pilihan = tipeSekarang === 'pilihan' || tipeSekarang === 'pilihan_ganda';
          return el('div', { class: 'kartu', style: 'padding:10px;margin-bottom:8px;background:var(--permukaan-2);' }, [
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
                style: 'width:170px;flex-shrink:0;',
                onchange: (e) => {
                  m.tipe = e.target.value;
                  // Beri satu pilihan kosong supaya guru langsung melihat
                  // tempat mengetiknya, bukan daftar kosong tanpa petunjuk.
                  if ((m.tipe === 'pilihan' || m.tipe === 'pilihan_ganda') && !m.opsi?.length) m.opsi = [''];
                  struktur.medan = medan;
                  gambar();
                }
              }, [
                el('option', { value: 'textarea', selected: tipeSekarang === 'textarea' }, 'Jawaban panjang'),
                el('option', { value: 'input', selected: tipeSekarang === 'input' }, 'Jawaban pendek'),
                el('option', { value: 'pilihan', selected: tipeSekarang === 'pilihan' }, 'Pilih satu'),
                el('option', { value: 'pilihan_ganda', selected: tipeSekarang === 'pilihan_ganda' }, 'Pilih beberapa')
              ]),
              el('button', {
                class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
                onclick: () => { medan.splice(i, 1); struktur.medan = medan; gambar(); }
              }, ikon('tutup', 14))
            ]),
            pilihan ? bagianOpsi(m) : null
          ]);
        }),
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

  /**
   * Daftar bagian bernama + keterangan. Dipakai Kanvas (kotak) dan Tahapan
   * (langkah), yang bentuk strukturnya sama: deretan objek {key, label, ...}.
   *
   * Khusus Kanvas, posisi kotak TIDAK diminta dari guru. Kotak cukup
   * diurutkan dan jumlah kolomnya dipilih; perendernya yang menata. Meminta
   * guru mengisi "kol: 1 / 3" sama saja dengan tetap memaksa mode JSON.
   */
  function bagianBernama({ kunci, label, keterangan, labelItem, pakaiDeskripsi, pakaiKolom }) {
    const daftar = Array.isArray(struktur[kunci]) ? struktur[kunci] : [];
    const area = el('div', {});

    /** Kunci data dibuat dari labelnya agar mudah dilacak, tapi tetap aman
     *  sebagai kunci JSON. Kunci yang sudah ada TIDAK diubah: mengubahnya
     *  akan memutus hubungan dengan jawaban murid yang sudah tersimpan. */
    function kunciDari(teks, i) {
      const dasar = String(teks || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
      return dasar || `b${i + 1}`;
    }

    function gambarDaftar() {
      isi(area, [
        ...daftar.map((b, i) => el('div', { class: 'kartu', style: 'padding:10px;margin-bottom:8px;background:var(--permukaan-2);' }, [
          el('div', { style: 'display:flex;gap:6px;align-items:center;' }, [
            el('span', { style: 'width:20px;flex-shrink:0;text-align:right;color:var(--abu-teks-halus);font-size:12px;' }, String(i + 1)),
            el('input', {
              value: b.label || '', placeholder: labelItem,
              style: 'font-weight:600;',
              oninput: (e) => {
                b.label = e.target.value;
                if (!b.key) b.key = kunciDari(e.target.value, i);
                struktur[kunci] = daftar;
              }
            }),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              title: 'Naikkan',
              onclick: () => {
                if (i === 0) return;
                [daftar[i - 1], daftar[i]] = [daftar[i], daftar[i - 1]];
                struktur[kunci] = daftar; gambarDaftar();
              }
            }, '↑'),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              title: 'Turunkan',
              onclick: () => {
                if (i === daftar.length - 1) return;
                [daftar[i + 1], daftar[i]] = [daftar[i], daftar[i + 1]];
                struktur[kunci] = daftar; gambarDaftar();
              }
            }, '↓'),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil', type: 'button', style: 'flex-shrink:0;',
              onclick: () => { daftar.splice(i, 1); struktur[kunci] = daftar; gambarDaftar(); }
            }, ikon('tutup', 14))
          ]),
          pakaiDeskripsi ? el('input', {
            value: b.deskripsi || '', placeholder: 'Pertanyaan pemandu untuk langkah ini (opsional)',
            style: 'margin-top:6px;font-size:12.5px;',
            oninput: (e) => { b.deskripsi = e.target.value; struktur[kunci] = daftar; }
          }) : null
        ])),
        el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', type: 'button',
          onclick: () => {
            daftar.push({ key: '', label: '', ...(pakaiDeskripsi ? { deskripsi: '' } : {}) });
            struktur[kunci] = daftar; gambarDaftar();
          }
        }, [ikon('tambah', 14), el('span', {}, ` Tambah ${labelItem}`)])
      ]);
    }
    gambarDaftar();

    return el('div', {}, [
      el('div', { class: 'panel-info', style: 'margin-bottom:12px;' }, keterangan),
      pakaiKolom ? el('div', { class: 'medan' }, [
        el('label', {}, 'Jumlah Kolom'),
        el('div', { class: 'keterangan', style: 'margin:0 0 6px;' },
          'Kotak akan mengisi kisi berurutan dari kiri ke kanan. Kanvas Konsep Produk 4 kotak cukup 2 kolom.'),
        el('select', {
          style: 'width:120px;',
          onchange: (e) => { struktur.kolom_kanvas = Number(e.target.value); }
        }, [1, 2, 3, 4, 5].map(n => el('option', {
          value: n, selected: (Number(struktur.kolom_kanvas) || 2) === n
        }, `${n} kolom`)))
      ]) : null,
      el('div', { class: 'medan' }, [
        el('label', {}, label),
        area
      ])
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
    } else if (tipe === 'periksa') {
      isiTipe.push(el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
        'Tiap langkah menjadi satu baris, dan tiap anggota kelompok mendapat kolom centangnya sendiri. ' +
        'Murid hanya bisa mencentang kolom namanya sendiri, sehingga lembar ini terbaca sebagai bukti siapa mengerjakan apa. ' +
        'Pada lembar mandiri, kolomnya satu saja.'));
      isiTipe.push(daftarTeks({
        kunci: 'butir_periksa', label: 'Daftar Langkah',
        placeholder: 'mis. Membuat repositori dari templat'
      }));
    } else if (tipe === 'kesepakatan') {
      isiTipe.push(el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
        'Kosongkan untuk memakai tiga poin kesepakatan bawaan.'));
      isiTipe.push(daftarTeks({
        kunci: 'poin', label: 'Poin Kesepakatan',
        placeholder: 'Poin yang disepakati bersama', banyakBaris: true
      }));
    } else if (tipe === 'kanvas') {
      isiTipe.push(bagianBernama({
        kunci: 'blok', label: 'Kotak Kanvas', labelItem: 'Kotak',
        pakaiKolom: true,
        keterangan: 'Kosongkan daftar untuk memakai 9 blok Business Model Canvas standar beserta tata letak bakunya. ' +
          'Begitu Anda menambah kotak sendiri, kanvas memakai tata letak mengalir sesuai jumlah kolom di bawah — ' +
          'itulah yang dipakai untuk kanvas selain BMC, mis. Kanvas Konsep Produk 4 kotak.'
      }));
    } else if (tipe === 'tahapan') {
      isiTipe.push(bagianBernama({
        kunci: 'tahap', label: 'Langkah', labelItem: 'Langkah',
        pakaiDeskripsi: true,
        keterangan: 'Kosongkan daftar untuk memakai 5 tahap Design Thinking standar (Empathize hingga Test). ' +
          'Isi sendiri untuk bentuk lain, mis. alur pengguna 4 langkah.'
      }));
    } else if (PUNYA_BAWAAN[tipe]) {
      isiTipe.push(el('div', { class: 'panel-info' }, 'Tipe ini memakai bentuk bawaannya.'));
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
      for (const k of ['kolom', 'butir', 'poin', 'pertanyaan', 'butir_periksa']) {
        if (Array.isArray(bersih[k])) {
          bersih[k] = bersih[k].filter(x => String(x).trim() !== '');
          if (bersih[k].length === 0) delete bersih[k];
        }
      }
      if (Array.isArray(bersih.medan)) {
        bersih.medan = bersih.medan.filter(m => (m.label || '').trim() !== '');
        for (const m of bersih.medan) {
          if (m.tipe !== 'pilihan' && m.tipe !== 'pilihan_ganda') {
            // Bekas pilihan dari tipe sebelumnya dibuang agar struktur bersih.
            delete m.opsi; delete m.lain_lain;
            continue;
          }
          m.opsi = (m.opsi || []).map(o => String(o).trim()).filter(Boolean);
          if (!m.lain_lain) delete m.lain_lain;
        }
        if (bersih.medan.length === 0) delete bersih.medan;
      }
      if (Array.isArray(bersih.klaster)) {
        bersih.klaster = bersih.klaster.filter(k => (k.kode || k.nama) && (k.butir || []).length > 0);
        if (bersih.klaster.length === 0) delete bersih.klaster;
      }
      // Kanvas & Tahapan: buang bagian tanpa nama, dan pastikan tiap bagian
      // punya kunci data. Tanpa kunci, jawaban murid tidak punya tempat
      // tersimpan dan hilang tanpa pesan.
      for (const k of ['blok', 'tahap']) {
        if (!Array.isArray(bersih[k])) continue;
        bersih[k] = bersih[k].filter(b => String(b.label || '').trim() !== '');
        const terpakai = new Set();
        bersih[k].forEach((b, i) => {
          let kunci = String(b.key || '').trim()
            || String(b.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
            || `b${i + 1}`;
          // Dua label yang menghasilkan kunci sama akan saling menimpa.
          while (terpakai.has(kunci)) kunci += '_2';
          terpakai.add(kunci);
          b.key = kunci;
        });
        if (bersih[k].length === 0) { delete bersih[k]; if (k === 'blok') delete bersih.kolom_kanvas; }
      }
      if (Array.isArray(bersih.kolom_terhitung)) {
        bersih.kolom_terhitung = bersih.kolom_terhitung.filter(t => (t.dari || []).length > 0);
        if (bersih.kolom_terhitung.length === 0) delete bersih.kolom_terhitung;
      }
      return bersih;
    }
  };
}
