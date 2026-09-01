// src/lib/lembar-tipe-khas.js — Perender khusus untuk 5 tipe lembar khas KIK:
// kanvas (BMC), tahapan (Design Thinking), kalkulator (keuangan),
// instrumen (wawancara/validasi), kesepakatan (kontrak kelompok).
//
// Semua fungsi menerima { struktur, data, bisaEdit, onUbah } dan MENGEMBALIKAN
// HTMLElement. onUbah(path:string[], nilai:string) dipanggil untuk setiap
// perubahan sel — pemanggil (lembar-kerja.js / lembar-widget.js) yang
// bertanggung jawab menyimpan & (opsional) menyiarkan lewat realtime.

import { el } from './dom.js';
import { atributJalur } from './jalur-sel.js';
import { ikon, ikonTeks } from './ikon.js';

function getNilaiPath(obj, path) {
  let cursor = obj;
  for (const seg of path) { cursor = cursor?.[seg]; if (cursor === undefined) return ''; }
  return cursor ?? '';
}

function kotakTeks(path, data, bisaEdit, onUbah, placeholder) {
  return el('textarea', {
    ...atributJalur(path),
    value: getNilaiPath(data, path), disabled: !bisaEdit, placeholder,
    style: 'width:100%;min-height:80px;border:1px solid var(--garis);border-radius:var(--radius-sm);padding:8px;font-family:inherit;font-size:13px;resize:vertical;',
    oninput: (e) => onUbah(path, e.target.value)
  });
}

// ============ 1. Kanvas (Business Model Canvas) ============
const BLOK_BMC_DEFAULT = [
  { key: 'mitra', label: 'Mitra Utama', kol: '1', baris: '1 / 3' },
  { key: 'aktivitas', label: 'Aktivitas Kunci', kol: '2', baris: '1' },
  { key: 'nilai', label: 'Proposisi Nilai', kol: '3', baris: '1 / 3' },
  { key: 'hubungan', label: 'Hubungan Pelanggan', kol: '4', baris: '1' },
  { key: 'segmen', label: 'Segmen Pelanggan', kol: '5', baris: '1 / 3' },
  { key: 'sumber_daya', label: 'Sumber Daya Kunci', kol: '2', baris: '2' },
  { key: 'saluran', label: 'Saluran', kol: '4', baris: '2' },
  { key: 'biaya', label: 'Struktur Biaya', kol: '1 / 3', baris: '3' },
  { key: 'pendapatan', label: 'Arus Pendapatan', kol: '3 / 6', baris: '3' }
];

export function gambarKanvas({ struktur, data, bisaEdit, onUbah }) {
  const blok = struktur?.blok?.length ? struktur.blok : BLOK_BMC_DEFAULT;
  return el('div', {
    style: 'display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(3,140px);gap:6px;'
  }, blok.map(b => el('div', {
    style: `grid-column:${b.kol};grid-row:${b.baris};background:var(--biru-kabut);border:1px solid var(--biru-lembut);border-radius:var(--radius-sm);padding:8px;display:flex;flex-direction:column;`
  }, [
    el('div', { style: 'font-size:11px;font-weight:700;color:var(--biru-tua);margin-bottom:4px;' }, b.label),
    el('textarea', {
      ...atributJalur([b.key]),
      value: getNilaiPath(data, [b.key]), disabled: !bisaEdit,
      style: 'flex:1;width:100%;border:none;background:transparent;font-size:12px;resize:none;font-family:inherit;',
      oninput: (e) => onUbah([b.key], e.target.value)
    })
  ])));
}

// ============ 2. Tahapan (Design Thinking) ============
const TAHAP_DT_DEFAULT = [
  { key: 'empati', label: 'Empathize', deskripsi: 'Apa yang kamu amati/dengar dari calon pelanggan?' },
  { key: 'definisi', label: 'Define', deskripsi: 'Masalah inti apa yang ingin kamu selesaikan?' },
  { key: 'ide', label: 'Ideate', deskripsi: 'Ide-ide solusi apa saja yang muncul?' },
  { key: 'prototipe', label: 'Prototype', deskripsi: 'Bagaimana bentuk purwarupa sederhananya?' },
  { key: 'uji', label: 'Test', deskripsi: 'Apa hasil uji coba ke pengguna?' }
];

export function gambarTahapan({ struktur, data, bisaEdit, onUbah }) {
  const tahap = struktur?.tahap?.length ? struktur.tahap : TAHAP_DT_DEFAULT;
  return el('div', { style: 'display:flex;flex-direction:column;gap:12px;' }, tahap.map((t, i) => el('div', {
    style: 'display:flex;gap:12px;align-items:flex-start;'
  }, [
    el('div', { class: 'pil-tahap', style: 'flex-shrink:0;margin-top:4px;' }, String(i + 1)),
    el('div', { style: 'flex:1;' }, [
      el('div', { style: 'font-weight:700;font-size:13px;margin-bottom:2px;' }, t.label),
      el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:6px;' }, t.deskripsi),
      kotakTeks([t.key], data, bisaEdit, onUbah, 'Tulis di sini…')
    ])
  ])));
}

// ============ 3. Kalkulator (Keuangan Sederhana) ============
export function gambarKalkulator({ data, bisaEdit, onUbah, onTambahBaris, onHapusBaris }) {
  const baris = data.baris || [];
  let totalMasuk = 0, totalKeluar = 0;
  for (const b of baris) {
    const jumlah = Number(b.jumlah) || 0;
    if (b.kategori === 'pengeluaran') totalKeluar += jumlah; else totalMasuk += jumlah;
  }
  const labaRugi = totalMasuk - totalKeluar;

  const tabel = el('table', { style: 'width:100%;border-collapse:collapse;margin-bottom:12px;' }, [
    el('thead', {}, el('tr', {}, [
      el('th', { style: 'text-align:left;padding:6px;font-size:12px;color:var(--abu-teks);' }, 'Uraian'),
      el('th', { style: 'text-align:left;padding:6px;font-size:12px;color:var(--abu-teks);width:140px;' }, 'Kategori'),
      el('th', { style: 'text-align:right;padding:6px;font-size:12px;color:var(--abu-teks);width:140px;' }, 'Jumlah (Rp)'),
      bisaEdit ? el('th', { style: 'width:32px;' }, '') : null
    ])),
    el('tbody', {}, baris.map((b, i) => el('tr', {}, [
      el('td', { style: 'padding:3px;border-bottom:1px solid var(--garis-halus);' },
        el('input', { ...atributJalur(['baris', String(i), 'nama']), value: b.nama || '', disabled: !bisaEdit, oninput: (e) => onUbah(['baris', String(i), 'nama'], e.target.value) })),
      el('td', { style: 'padding:3px;border-bottom:1px solid var(--garis-halus);' },
        el('select', {
          ...atributJalur(['baris', String(i), 'kategori']),
          disabled: !bisaEdit,
          onchange: (e) => onUbah(['baris', String(i), 'kategori'], e.target.value)
        }, [
          el('option', { value: 'pemasukan', selected: b.kategori !== 'pengeluaran' }, 'Pemasukan'),
          el('option', { value: 'pengeluaran', selected: b.kategori === 'pengeluaran' }, 'Pengeluaran')
        ])),
      el('td', { style: 'padding:3px;border-bottom:1px solid var(--garis-halus);' },
        el('input', {
          ...atributJalur(['baris', String(i), 'jumlah']),
          type: 'number', min: '0', value: b.jumlah || '', disabled: !bisaEdit, style: 'text-align:right;',
          oninput: (e) => onUbah(['baris', String(i), 'jumlah'], e.target.value)
        })),
      bisaEdit ? el('td', {}, el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => onHapusBaris(i) }, ikon('tutup', 14))) : null
    ])))
  ]);

  return el('div', {}, [
    tabel,
    bisaEdit ? el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: onTambahBaris, style: 'margin-bottom:16px;' }, '+ Tambah Baris') : null,
    el('div', { style: 'display:flex;gap:12px;' }, [
      kotakRingkasan('Total Pemasukan', totalMasuk, 'hijau'),
      kotakRingkasan('Total Pengeluaran', totalKeluar, 'merah'),
      kotakRingkasan(labaRugi >= 0 ? 'Laba' : 'Rugi', Math.abs(labaRugi), labaRugi >= 0 ? 'hijau' : 'merah')
    ])
  ]);
}

function kotakRingkasan(label, angka, warna) {
  return el('div', { class: 'kartu', style: `flex:1;text-align:center;padding:12px;background:var(--${warna}-lembut);` }, [
    el('div', { style: 'font-size:11px;color:var(--abu-teks);' }, label),
    el('div', { style: `font-size:18px;font-weight:800;color:var(--${warna === 'hijau' ? 'hijau' : 'merah'});` },
      'Rp ' + angka.toLocaleString('id-ID'))
  ]);
}

// ============ 4. Instrumen (Wawancara/Validasi) ============
export function gambarInstrumen({ struktur, data, bisaEdit, onUbah, onTambahBaris, onHapusBaris }) {
  const daftarPertanyaan = struktur?.pertanyaan?.length ? struktur.pertanyaan : null;
  const baris = data.baris || [];

  if (daftarPertanyaan) {
    return el('div', {}, daftarPertanyaan.map((p, i) => el('div', { class: 'medan' }, [
      el('label', {}, `${i + 1}. ${p}`),
      el('textarea', {
        ...atributJalur(['jawaban', String(i)]),
        value: getNilaiPath(data, ['jawaban', String(i)]), disabled: !bisaEdit,
        oninput: (e) => onUbah(['jawaban', String(i)], e.target.value)
      })
    ])));
  }

  return el('div', {}, [
    ...baris.map((b, i) => el('div', { class: 'kartu', style: 'margin-bottom:10px;padding:10px;' }, [
      el('div', { class: 'baris-medan' }, [
        el('div', { class: 'medan', style: 'flex:2;' }, [
          el('label', {}, 'Pertanyaan'),
          el('input', { ...atributJalur(['baris', String(i), 'pertanyaan']), value: b.pertanyaan || '', disabled: !bisaEdit, oninput: (e) => onUbah(['baris', String(i), 'pertanyaan'], e.target.value) })
        ]),
        bisaEdit ? el('button', { class: 'tombol tombol-hantu tombol-kecil', style: 'margin-top:22px;', onclick: () => onHapusBaris(i) }, ikon('tutup', 14)) : null
      ]),
      el('div', { class: 'medan' }, [
        el('label', {}, 'Jawaban / Temuan'),
        el('textarea', { ...atributJalur(['baris', String(i), 'jawaban']), value: b.jawaban || '', disabled: !bisaEdit, oninput: (e) => onUbah(['baris', String(i), 'jawaban'], e.target.value) })
      ])
    ])),
    bisaEdit ? el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: onTambahBaris }, '+ Tambah Pertanyaan') : null
  ]);
}

// ============ 5. Kesepakatan Kelompok ============
export function gambarKesepakatan({ struktur, data, bisaEdit, onUbah, profil, anggotaKelompok }) {
  const poin = struktur?.poin?.length ? struktur.poin : [
    'Setiap anggota hadir dan berkontribusi aktif pada setiap sesi kerja kelompok.',
    'Keputusan penting didiskusikan dan disepakati bersama.',
    'Tugas dibagi rata dan setiap anggota bertanggung jawab atas bagiannya.'
  ];
  const persetujuan = data.persetujuan || {};

  return el('div', {}, [
    el('div', { class: 'panel-info', style: 'margin-bottom:16px;' }, [
      el('div', { style: 'font-weight:700;margin-bottom:6px;' }, 'Poin Kesepakatan'),
      el('ol', { style: 'margin:0;padding-left:20px;' }, poin.map(p => el('li', { style: 'margin-bottom:4px;font-size:13px;' }, p)))
    ]),
    el('div', { style: 'font-weight:700;font-size:13px;margin-bottom:8px;' }, 'Persetujuan Anggota'),
    el('div', { class: 'daftar-baris' }, (anggotaKelompok || []).map(a => {
      const status = persetujuan[a.murid_id];
      const iniSaya = a.murid_id === profil?.id;
      return el('div', { class: 'baris-item' }, [
        el('div', { class: 'isi-utama' }, [
          el('div', { class: 'judul-baris' }, a.profil?.nama || a.murid_id)
        ]),
        status?.setuju
          ? el('span', { class: 'lencana', style: 'background:var(--hijau-lembut);color:#006644;' }, `✓ Setuju`)
          : (iniSaya && bisaEdit
              ? el('button', {
                  class: 'tombol tombol-primer tombol-kecil',
                  onclick: () => {
                    onUbah(['persetujuan', a.murid_id, 'setuju'], 'true');
                    onUbah(['persetujuan', a.murid_id, 'pada'], new Date().toISOString());
                  }
                }, 'Saya Setuju')
              : el('span', { class: 'lencana' }, 'Menunggu'))
      ]);
    }))
  ]);
}

// ============ 6. Likert (Instrumen Berskala + Skor Klaster Otomatis) ============
// struktur:
// {
//   "skala": [{"label":"SS","nilai":4},{"label":"S","nilai":3},{"label":"KS","nilai":2},{"label":"TS","nilai":1}],
//   "butir": ["Saya sering ...", "Saya senang ..."],
//   "klaster": [{"kode":"AN","nama":"Analitis-Logika","butir":[8,9,19,20]}],
//   "tambahan": {"nama":"Kesiapan Berkembang","butir":[21,22,23,24,25],
//                "tafsir":[{"min":17,"label":"Sangat Siap"},{"min":13,"label":"Siap"},
//                          {"min":9,"label":"Cukup"},{"min":0,"label":"Perlu Penguatan"}]}
// }
// Nomor butir pada "klaster"/"tambahan" memakai penomoran 1-based sesuai
// tampilan LKM, supaya guru bisa menyalin kunci skoring apa adanya.
const SKALA_DEFAULT = [
  { label: 'SS', nilai: 4 }, { label: 'S', nilai: 3 },
  { label: 'KS', nilai: 2 }, { label: 'TS', nilai: 1 }
];

export function gambarLikert({ struktur, data, bisaEdit, onUbah }) {
  const skala = struktur?.skala?.length ? struktur.skala : SKALA_DEFAULT;
  const butir = struktur?.butir || [];
  const klaster = struktur?.klaster || [];
  const tambahan = struktur?.tambahan || null;

  if (butir.length === 0) {
    return el('div', { class: 'panel-info' },
      'Instrumen belum punya butir pernyataan. Guru perlu mengisi "butir" pada struktur JSON lembar ini.');
  }

  const nilaiButir = (i) => Number(data?.butir?.[String(i)]) || 0;

  // ---- Tabel pernyataan ----
  const tabel = el('table', { style: 'width:100%;border-collapse:collapse;' }, [
    el('thead', {}, el('tr', {}, [
      el('th', { style: 'text-align:left;padding:6px;font-size:12px;color:var(--abu-teks);width:28px;' }, 'No'),
      el('th', { style: 'text-align:left;padding:6px;font-size:12px;color:var(--abu-teks);' }, 'Pernyataan'),
      ...skala.map(s => el('th', { style: 'padding:6px;font-size:12px;color:var(--abu-teks);width:44px;text-align:center;' }, s.label))
    ])),
    el('tbody', {}, butir.map((teks, idx) => {
      const nomor = idx + 1;
      const terpilih = nilaiButir(nomor);
      return el('tr', {}, [
        el('td', { style: 'padding:6px;font-size:12px;color:var(--abu-teks);border-bottom:1px solid var(--garis-halus);vertical-align:top;' }, String(nomor)),
        el('td', { style: 'padding:6px;font-size:13px;border-bottom:1px solid var(--garis-halus);' }, teks),
        ...skala.map(s => el('td', { style: 'text-align:center;border-bottom:1px solid var(--garis-halus);' }, [
          el('input', {
            ...atributJalur(['butir', String(nomor)]),
            type: 'radio', name: `likert-${nomor}`, disabled: !bisaEdit,
            value: s.nilai, checked: terpilih === s.nilai,
            onchange: () => onUbah(['butir', String(nomor)], String(s.nilai))
          })
        ]))
      ]);
    }))
  ]);

  // ---- Ringkasan skor klaster (dihitung otomatis) ----
  const bagianRingkas = [];
  if (klaster.length > 0) {
    const hasil = klaster.map(k => ({
      ...k,
      skor: (k.butir || []).reduce((total, n) => total + nilaiButir(n), 0),
      maks: (k.butir || []).length * Math.max(...skala.map(s => s.nilai))
    }));
    const urut = [...hasil].sort((a, b) => b.skor - a.skor);
    const peringkat = new Map(urut.map((k, i) => [k.kode, i + 1]));

    bagianRingkas.push(
      el('div', { style: 'font-weight:700;font-size:13px;margin:18px 0 8px;' }, 'Profil Diri (dihitung otomatis)'),
      el('table', { style: 'width:100%;border-collapse:collapse;' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { style: 'text-align:left;padding:6px;font-size:12px;color:var(--abu-teks);' }, 'Klaster'),
          el('th', { style: 'text-align:right;padding:6px;font-size:12px;color:var(--abu-teks);width:90px;' }, 'Jumlah'),
          el('th', { style: 'text-align:center;padding:6px;font-size:12px;color:var(--abu-teks);width:80px;' }, 'Peringkat')
        ])),
        el('tbody', {}, hasil.map(k => el('tr', {}, [
          el('td', { style: 'padding:6px;font-size:13px;border-bottom:1px solid var(--garis-halus);' }, `${k.kode} — ${k.nama}`),
          el('td', { style: 'padding:6px;font-size:13px;text-align:right;border-bottom:1px solid var(--garis-halus);font-weight:700;' },
            `${k.skor} / ${k.maks}`),
          el('td', { style: 'padding:6px;text-align:center;border-bottom:1px solid var(--garis-halus);' },
            peringkat.get(k.kode) <= 2
              ? el('span', { class: 'lencana lencana-tim' }, `#${peringkat.get(k.kode)}`)
              : el('span', { class: 'lencana' }, `#${peringkat.get(k.kode)}`))
        ])))
      ]),
      el('div', { class: 'panel-info', style: 'margin-top:10px;font-size:12px;' },
        `Klaster tertinggi: ${urut[0]?.kode || '—'} · Klaster kedua: ${urut[1]?.kode || '—'} · Terendah: ${urut[urut.length - 1]?.kode || '—'}. ` +
        'Skor ini membandingkan klaster di dalam dirimu sendiri, bukan membandingkanmu dengan teman.')
    );
  }

  if (tambahan) {
    const skorTambahan = (tambahan.butir || []).reduce((t, n) => t + nilaiButir(n), 0);
    const maksTambahan = (tambahan.butir || []).length * Math.max(...skala.map(s => s.nilai));
    const tafsir = (tambahan.tafsir || []).slice().sort((a, b) => b.min - a.min)
      .find(t => skorTambahan >= t.min);
    bagianRingkas.push(
      el('div', { class: 'kartu', style: 'margin-top:12px;background:var(--biru-kabut);text-align:center;' }, [
        el('div', { style: 'font-size:12px;color:var(--abu-teks);' }, tambahan.nama || 'Skor Tambahan'),
        el('div', { style: 'font-size:20px;font-weight:800;color:var(--biru);' }, `${skorTambahan} / ${maksTambahan}`),
        tafsir ? el('span', { class: 'lencana lencana-tim' }, tafsir.label) : null
      ])
    );
  }

  const terisi = butir.filter((_, i) => nilaiButir(i + 1) > 0).length;
  return el('div', {}, [
    el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:8px;' },
      `Terisi ${terisi} dari ${butir.length} pernyataan.`),
    tabel,
    ...bagianRingkas
  ]);
}

// ============ 7. Matriks dengan Kolom Terhitung ============
// struktur: {"kolom":["Gagasan","Kebaruan","Manfaat","Kelayakan"],
//            "kolom_terhitung":[{"label":"Total","dari":[1,2,3]}]}
// "dari" memakai indeks kolom 0-based dari array "kolom".
// Dipakai mis. Matriks Penyaringan Gagasan (TP 11.2 Bagian E).
export function gambarMatriksTerhitung({ struktur, data, bisaEdit, onUbah, onTambahBaris, onHapusBaris, barisDinamis }) {
  const kolom = struktur?.kolom || ['Kolom 1'];
  const terhitung = struktur?.kolom_terhitung || [];
  const baris = data.baris?.length ? data.baris : (data.baris = [{}]);

  const hitung = (row, def) => (def.dari || [])
    .reduce((total, ki) => total + (Number(row[`k${ki}`]) || 0), 0);

  return el('div', {}, [
    el('table', { style: 'width:100%;border-collapse:collapse;' }, [
      el('thead', {}, el('tr', {}, [
        ...kolom.map(k => el('th', { style: 'text-align:left;padding:6px;border-bottom:2px solid var(--garis);font-size:12px;color:var(--abu-teks);' }, k)),
        ...terhitung.map(t => el('th', { style: 'text-align:center;padding:6px;border-bottom:2px solid var(--garis);font-size:12px;color:var(--biru-tua);width:80px;' }, t.label)),
        bisaEdit && barisDinamis ? el('th', { style: 'width:32px;' }, '') : null
      ])),
      el('tbody', {}, baris.map((row, i) => el('tr', {}, [
        ...kolom.map((k, ki) => el('td', { style: 'padding:3px;border-bottom:1px solid var(--garis-halus);' }, [
          el('input', {
            ...atributJalur(['baris', String(i), `k${ki}`]),
            value: row[`k${ki}`] ?? '', disabled: !bisaEdit,
            style: 'border:1px solid transparent;background:transparent;width:100%;',
            oninput: (e) => onUbah(['baris', String(i), `k${ki}`], e.target.value)
          })
        ])),
        ...terhitung.map(t => el('td', {
          style: 'padding:3px;border-bottom:1px solid var(--garis-halus);text-align:center;font-weight:700;color:var(--biru-tua);'
        }, String(hitung(row, t)))),
        bisaEdit && barisDinamis
          ? el('td', {}, el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => onHapusBaris(i) }, ikon('tutup', 14)))
          : null
      ])))
    ]),
    bisaEdit && barisDinamis
      ? el('button', { class: 'tombol tombol-sekunder tombol-kecil', style: 'margin-top:8px;', onclick: onTambahBaris }, '+ Tambah Baris')
      : null
  ]);
}
