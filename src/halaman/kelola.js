// src/halaman/kelola.js — Pengaturan global admin.
import { el, isi, roti, dialog, konfirmasi } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilSemuaPengaturan, simpanPengaturan } from '../lib/data-pengaturan.js';
import { daftarMapel, buatMapel, updateMapel, hapusMapel } from '../lib/data-kurikulum.js';

export async function renderKelola(root, { profil, onKeluar, tab = 'pengaturan' }) {
  let memuat = true, galat = '';
  let pengaturan = {};
  let mapelList = [];

  async function muat() {
    memuat = true; render();
    try {
      if (tab === 'mapel') mapelList = await daftarMapel();
      else pengaturan = await ambilSemuaPengaturan();
    }
    catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  async function simpan(kunci, nilaiBaru) {
    try {
      await simpanPengaturan(kunci, nilaiBaru);
      pengaturan[kunci] = nilaiBaru;
      roti('Pengaturan disimpan.', 'sukses');
    } catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function gambarPengaturan() {
    const antiSalin = pengaturan.anti_salin || { aktif: false };
    const ranah = pengaturan.ranah || { tampilkan: true, sumber_afektif: 'gabungan', pakai_bobot: false, bobot: { kognitif: 50, psikomotor: 25, afektif: 25 } };
    const ambang = pengaturan.ambang || { kkm: 75, hijau: 85 };
    const susulan = pengaturan.susulan || { penalti: 10 };
    const kecepatan = pengaturan.kecepatan || { durasi_target_jam: 24 };
    const jamLayanan = pengaturan.jam_layanan || { aktif: true, mulai: '07:00', selesai: '15:00', hari: [1,2,3,4,5], catatan: '' };
    const skalaHuruf = pengaturan.skala_huruf || [{ huruf: 'A', min: 90 }, { huruf: 'B', min: 80 }, { huruf: 'C', min: 70 }, { huruf: 'D', min: 60 }, { huruf: 'E', min: 0 }];

    return el('div', { style: 'display:flex;flex-direction:column;gap:16px;max-width:640px;' }, [
      el('div', { class: 'kartu' }, [
        el('h3', {}, 'Anti Salin-Tempel'),
        el('p', { style: 'color:var(--abu-teks);font-size:13px;margin:6px 0 12px;' },
          'Bila aktif, halaman MURID memblokir salin/tempel, klik-kanan, dan seleksi teks. ' +
          'Kolom isian tetap bisa diketik normal. Guru & admin tidak terpengaruh. ' +
          'Ini penghalang browser biasa, bukan proteksi mutlak — paling efektif digabung dengan Kemiripan.'),
        el('label', { style: 'display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;' }, [
          el('input', {
            type: 'checkbox', checked: antiSalin.aktif,
            onchange: (e) => simpan('anti_salin', { aktif: e.target.checked })
          }),
          'Aktifkan anti salin-tempel untuk murid'
        ])
      ]),
      el('div', { class: 'kartu' }, [
        el('h3', {}, 'Penilaian Tiga Ranah'),
        el('p', { style: 'color:var(--abu-teks);font-size:13px;margin:6px 0 12px;' },
          'Nilai kognitif, psikomotor, dan afektif dihitung dari penanda ranah pada tiap kriteria rubrik ' +
          '(diatur per program lewat tombol Rubrik), ditambah observasi sikap yang Anda catat di roster kelas.'),

        el('label', { style: 'display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;margin-bottom:14px;' }, [
          el('input', {
            type: 'checkbox', checked: ranah.tampilkan !== false,
            onchange: (e) => simpan('ranah', { ...ranah, tampilkan: e.target.checked })
          }),
          'Tampilkan kolom per ranah di Rekap Nilai dan ekspor CSV'
        ]),

        el('div', { class: 'medan' }, [
          el('label', {}, 'Sumber Nilai Afektif'),
          el('select', {
            onchange: (e) => simpan('ranah', { ...ranah, sumber_afektif: e.target.value })
          }, [
            el('option', { value: 'gabungan', selected: (ranah.sumber_afektif ?? 'gabungan') === 'gabungan' },
              'Rubrik dan/atau observasi sikap (disarankan)'),
            el('option', { value: 'rubrik', selected: ranah.sumber_afektif === 'rubrik' },
              'Hanya kriteria rubrik bertanda afektif'),
            el('option', { value: 'sikap', selected: ranah.sumber_afektif === 'sikap' },
              'Hanya observasi sikap guru')
          ]),
          el('div', { class: 'keterangan' },
            'Pada pilihan pertama: bila salah satu sumber kosong, nilai diambil dari yang ada; ' +
            'bila keduanya terisi, keduanya dirata-rata.')
        ]),

        el('label', { style: 'display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;margin-bottom:10px;' }, [
          el('input', {
            type: 'checkbox', checked: !!ranah.pakai_bobot,
            onchange: (e) => simpan('ranah', { ...ranah, pakai_bobot: e.target.checked })
          }),
          'Hitung Nilai Akhir berbobot per ranah'
        ]),
        el('div', { class: 'keterangan', style: 'margin-bottom:10px;' },
          'Bila dimatikan, Nilai Akhir tetap berupa rata-rata seluruh misi seperti sebelumnya. ' +
          'Ranah yang belum ada nilainya tidak menyeret nilai turun — bobotnya dinormalkan ulang.'),
        el('div', { class: 'baris-medan' }, [
          medanAngka('Kognitif (%)', ranah.bobot?.kognitif ?? 50,
            v => simpan('ranah', { ...ranah, bobot: { ...ranah.bobot, kognitif: v } })),
          medanAngka('Psikomotor (%)', ranah.bobot?.psikomotor ?? 25,
            v => simpan('ranah', { ...ranah, bobot: { ...ranah.bobot, psikomotor: v } })),
          medanAngka('Afektif (%)', ranah.bobot?.afektif ?? 25,
            v => simpan('ranah', { ...ranah, bobot: { ...ranah.bobot, afektif: v } }))
        ])
      ]),
      el('div', { class: 'kartu' }, [
        el('h3', {}, 'Jam Layanan Obrolan'),
        el('p', { style: 'color:var(--abu-teks);font-size:13px;margin:6px 0 12px;' },
          'Penanda kapan guru biasanya membalas pesan. Di luar jam ini murid tetap bisa mengirim — hanya ditampilkan keterangan agar mereka tidak menunggu balasan sia-sia.'),
        el('label', { style: 'display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;margin-bottom:12px;' }, [
          el('input', {
            type: 'checkbox', checked: jamLayanan.aktif !== false,
            onchange: (e) => simpan('jam_layanan', { ...jamLayanan, aktif: e.target.checked })
          }),
          'Tampilkan penanda jam layanan'
        ]),
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Mulai'),
            el('input', { type: 'time', value: jamLayanan.mulai || '07:00',
              onchange: (e) => simpan('jam_layanan', { ...jamLayanan, mulai: e.target.value }) })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Selesai'),
            el('input', { type: 'time', value: jamLayanan.selesai || '15:00',
              onchange: (e) => simpan('jam_layanan', { ...jamLayanan, selesai: e.target.value }) })
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Hari Layanan'),
          el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
            ['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map((nama, i) => {
              const dipilih = (jamLayanan.hari || []).includes(i);
              return el('button', {
                type: 'button',
                class: `tombol tombol-kecil ${dipilih ? 'tombol-primer' : 'tombol-sekunder'}`,
                onclick: () => {
                  const hari = [...(jamLayanan.hari || [])];
                  const idx = hari.indexOf(i);
                  if (idx >= 0) hari.splice(idx, 1); else hari.push(i);
                  hari.sort();
                  simpan('jam_layanan', { ...jamLayanan, hari });
                }
              }, nama);
            }))
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Keterangan untuk Murid'),
          el('textarea', { style: 'min-height:60px;',
            onchange: (e) => simpan('jam_layanan', { ...jamLayanan, catatan: e.target.value.trim() })
          }, jamLayanan.catatan || '')
        ])
      ]),
      el('div', { class: 'kartu' }, [
        el('h3', {}, 'KKM & Ambang Nilai'),
        el('div', { class: 'baris-medan' }, [
          medanAngka('KKM (batas lulus)', ambang.kkm, v => simpan('ambang', { ...ambang, kkm: v })),
          medanAngka('Ambang "Sangat Baik"', ambang.hijau, v => simpan('ambang', { ...ambang, hijau: v }))
        ])
      ]),
      el('div', { class: 'kartu' }, [
        el('h3', {}, 'Skala Huruf'),
        el('p', { style: 'color:var(--abu-teks);font-size:13px;margin:6px 0 12px;' },
          'Batas nilai minimum (0–100) untuk tiap huruf. Dipakai langsung oleh sistem penilaian di halaman Nilai guru.'),
        el('div', { class: 'deret-isian' }, skalaHuruf.map((s, i) => el('div', { class: 'isian-mini' }, [
          el('label', {}, `Huruf ${s.huruf}`),
          el('input', {
            type: 'number', min: '0', max: '100', value: s.min,
            onchange: (e) => {
              const baru = skalaHuruf.map((x, j) => j === i ? { ...x, min: Number(e.target.value) || 0 } : x);
              simpan('skala_huruf', baru);
            }
          })
        ])))
      ]),
      el('div', { class: 'kartu' }, [
        el('h3', {}, 'Susulan & Kecepatan'),
        el('div', { class: 'baris-medan' }, [
          medanAngka('Penalti Susulan (poin)', susulan.penalti, v => simpan('susulan', { ...susulan, penalti: v })),
          medanAngka('Durasi Target (jam)', kecepatan.durasi_target_jam, v => simpan('kecepatan', { ...kecepatan, durasi_target_jam: v }))
        ])
      ])
    ]);
  }

  function medanAngka(label, nilai, onUbah) {
    return el('div', { class: 'medan' }, [
      el('label', {}, label),
      el('input', {
        type: 'number', value: nilai, min: '0',
        onchange: (e) => onUbah(Number(e.target.value) || 0)
      })
    ]);
  }

  function bukaDialogMapel(mapelLama) {
    const { tutup } = dialog({
      judul: mapelLama ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran',
      isi: el('div', {}, [
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Kode'),
            el('input', { id: 'mp-kode', value: mapelLama?.kode || '', placeholder: 'mis. KIK' })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Fase'),
            el('input', { id: 'mp-fase', value: mapelLama?.fase || 'F', placeholder: 'mis. F' })
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Mata Pelajaran'),
          el('input', { id: 'mp-nama', value: mapelLama?.nama || '', placeholder: 'mis. Kreativitas, Inovasi, dan Kewirausahaan' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Konsentrasi (opsional)'),
          el('input', { id: 'mp-konsentrasi', value: mapelLama?.konsentrasi || '', placeholder: 'mis. Bisnis dan Manajemen' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const kode = document.getElementById('mp-kode').value.trim();
              const nama = document.getElementById('mp-nama').value.trim();
              if (!kode || !nama) { roti('Kode dan nama wajib diisi.', 'galat'); return; }
              const payload = {
                kode, nama,
                fase: document.getElementById('mp-fase').value.trim() || null,
                konsentrasi: document.getElementById('mp-konsentrasi').value.trim() || null
              };
              try {
                if (mapelLama) await updateMapel(mapelLama.id, payload);
                else await buatMapel(payload);
                tutup(); roti('Mata pelajaran disimpan.', 'sukses'); await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function hapusMapelDenganKonfirmasi(m) {
    const ok = await konfirmasi(
      `Hapus mata pelajaran "${m.nama}"? Kalau ada Program Inkubasi yang memakainya, program itu (beserta tahap, misi, dan lembar kerjanya) IKUT TERHAPUS PERMANEN. Kelas yang masih memakainya akan mencegah penghapusan ini.`,
      { labelYa: 'Hapus Permanen', labelTidak: 'Batal' }
    );
    if (!ok) return;
    try { await hapusMapel(m.id); roti('Mata pelajaran dihapus.', 'sukses'); await muat(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function gambarMapel() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:16px;' }, [
        el('button', { class: 'tombol tombol-primer', onclick: () => bukaDialogMapel(null) }, '+ Tambah Mata Pelajaran')
      ]),
      mapelList.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada mata pelajaran.')
        : el('div', { class: 'daftar-baris' }, mapelList.map(m => el('div', { class: 'baris-item' }, [
            el('div', { class: 'isi-utama' }, [
              el('div', { class: 'judul-baris' }, `${m.kode} — ${m.nama}`),
              el('div', { class: 'meta-baris' }, [m.konsentrasi, m.fase ? `Fase ${m.fase}` : null].filter(Boolean).join(' · ') || '—')
            ]),
            el('div', { class: 'aksi-baris' }, [
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogMapel(m) }, 'Edit'),
              el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: () => hapusMapelDenganKonfirmasi(m) }, 'Hapus')
            ])
          ])))
    ]);
  }

  function render() {
    const konten = memuat
      ? el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat pengaturan…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : tab === 'mapel' ? gambarMapel() : gambarPengaturan();

    isi(root, renderShell({
      profil, judulHalaman: tab === 'mapel' ? 'Mata Pelajaran' : 'Pengaturan', onKeluar,
      sub: 'Pengaturan berlaku untuk seluruh sekolah.',
      konten
    }));
  }

  render();
  await muat();
}
