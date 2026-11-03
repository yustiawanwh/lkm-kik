// src/halaman/peran-tp.js — Guru menyusun peran kelompok untuk SATU TP.
//
// Halaman ini punya dua bagian yang sengaja dipisah:
//   Daftar Peran  = katalog peran pada TP ini (bisa diekspor/diimpor)
//   Pembagian     = siapa memegang peran apa, per kelompok
// Pemisahan itu yang membuat katalog bisa dipakai ulang di TP lain tanpa
// ikut membawa nama murid.
import { el, isi, roti, dialog, konfirmasi } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { ambilPenugasan } from '../lib/data-papan.js';
import { daftarKelompok } from '../lib/data-kelas.js';
import { penugasanSekelas } from '../lib/data-kartu.js';
import {
  daftarPeranTp, simpanPeran, hapusPeran, simpanUrutanPeran,
  daftarPemegangPeran, berikanPeran, cabutPeran,
  keJson, dariJson, imporPeran, salinPeranDariPenugasan, CONTOH_PERAN
} from '../lib/data-peran.js';

export async function renderPeranTp(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let penugasan = null, kelompokList = [], peranList = [], pemegangList = [], sumberList = [];
  let tab = 'daftar';   // 'daftar' | 'bagi'

  async function muat() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      [kelompokList, peranList, pemegangList, sumberList] = await Promise.all([
        daftarKelompok(penugasan.kelas_id),
        daftarPeranTp(penugasanId),
        daftarPemegangPeran(penugasanId),
        penugasanSekelas(penugasan.kelas_id, penugasanId)
      ]);
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  function anggotaKelompok(k) {
    return [...(k.anggota_kelompok || [])].sort((a, b) => {
      // Ketua di atas, lalu urut nomor absen — sama seperti halaman kelompok.
      if (a.peran_dalam_kelompok !== b.peran_dalam_kelompok) {
        return a.peran_dalam_kelompok === 'ketua' ? -1 : 1;
      }
      return (a.profil?.no_absen ?? 999) - (b.profil?.no_absen ?? 999);
    });
  }

  function namaMurid(p) {
    return (p?.no_absen ? `${p.no_absen}. ` : '') + (p?.nama || 'Murid');
  }

  function pemegang(peranId, kelompokId) {
    return pemegangList.filter(x => x.peran_id === peranId && x.kelompok_id === kelompokId);
  }

  // ---------- Bagian 1: katalog peran ----------
  function bukaDialogPeran(peran) {
    const { tutup } = dialog({
      judul: peran ? `Ubah Peran — ${peran.nama}` : 'Tambah Peran',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Peran'),
          el('input', { id: 'pr-nama', value: peran?.nama || '', placeholder: 'mis. Pewawancara' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Tugas Peran Ini (opsional)'),
          el('textarea', { id: 'pr-deskripsi', style: 'min-height:70px;' }, peran?.deskripsi || '')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Kolom Tambahan yang Diisi Pemegangnya (opsional)'),
          el('div', { class: 'keterangan', style: 'margin:0 0 6px;' },
            'Mis. "Username GitHub". Pemegang peran akan melihat satu kotak isian berlabel ini di Papan Misi. Kosongkan bila tidak perlu.'),
          el('input', { id: 'pr-catatan', value: peran?.label_catatan || '', placeholder: 'mis. Username GitHub' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const nama = document.getElementById('pr-nama').value.trim();
              if (!nama) { roti('Nama peran belum diisi.', 'galat'); return; }
              try {
                await simpanPeran({
                  id: peran?.id, penugasanId, nama,
                  deskripsi: document.getElementById('pr-deskripsi').value,
                  labelCatatan: document.getElementById('pr-catatan').value,
                  urutan: peran?.urutan ?? peranList.length
                });
                tutup(); roti('Peran disimpan.', 'sukses'); await muat();
              } catch (err) {
                // Nama peran unik per penugasan; beri bunyi yang jelas.
                const t = pesanGalat(err);
                roti(/duplicate|unique/i.test(t) ? 'Sudah ada peran dengan nama itu pada TP ini.' : t, 'galat');
              }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function geser(i, arah) {
    const baru = [...peranList];
    const j = i + arah;
    if (j < 0 || j >= baru.length) return;
    [baru[i], baru[j]] = [baru[j], baru[i]];
    try {
      // Dikirim apa adanya: simpanUrutanPeran membandingkan urutan LAMA tiap
      // peran dengan posisi barunya, lalu menyimpan yang memang berubah.
      await simpanUrutanPeran(baru);
      await muat();
    } catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function bukaDialogContoh() {
    let pilihan = Object.keys(CONTOH_PERAN)[0];
    const { tutup } = dialog({
      judul: 'Pakai Contoh Peran',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Peran yang namanya sudah ada tidak akan ditimpa. Setelah dimuat, semuanya masih bisa Anda ubah.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Kumpulan Peran'),
          el('select', { onchange: (e) => { pilihan = e.target.value; } },
            Object.keys(CONTOH_PERAN).map(k => el('option', { value: k }, k)))
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              try {
                const h = await imporPeran(penugasanId, CONTOH_PERAN[pilihan]);
                tutup();
                roti(`${h.dibuat} peran dimuat` + (h.dilewati ? `, ${h.dilewati} dilewati karena namanya sudah ada` : '') + '.', 'sukses');
                await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Muat')
        ])
      ])
    });
  }

  // ---------- Ekspor / impor ----------
  function bukaDialogEksporImpor() {
    let sumber = '';
    let ikutPemegang = false;
    const areaJson = el('textarea', {
      style: 'font-family:ui-monospace,monospace;font-size:12px;min-height:150px;'
    }, peranList.length ? keJson(peranList) : '');

    const { tutup } = dialog({
      judul: 'Ekspor / Impor Peran',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
          'Dua cara memindahkan peran. Yang pertama paling cepat bila TP tujuan masih di kelas yang sama; ' +
          'yang kedua untuk memindahkan ke kelas lain, ke laptop lain, atau untuk disimpan sebagai cadangan.'),

        // --- Cara 1: salin dari penugasan lain ---
        el('div', { style: 'font-weight:650;font-size:13px;margin-bottom:6px;' }, '1. Salin dari TP lain di kelas ini'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Ambil Peran dari Penugasan'),
          el('select', { onchange: (e) => { sumber = e.target.value; } }, [
            el('option', { value: '' }, '— pilih penugasan sumber —'),
            ...sumberList.map(p => el('option', { value: p.id },
              `${p.tujuan_pembelajaran?.kode ? p.tujuan_pembelajaran.kode + ' — ' : ''}${p.tujuan_pembelajaran?.judul || 'Program'}`))
          ])
        ]),
        el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;' }, [
          el('input', { type: 'checkbox', onchange: (e) => { ikutPemegang = e.target.checked; } }),
          el('span', { style: 'font-size:13.5px;' }, 'Ikut menyalin pembagiannya (siapa memegang peran apa)')
        ]),
        el('div', { class: 'keterangan', style: 'margin:0 0 10px;' },
          'Pembagian hanya bisa disalin antar penugasan di kelas yang sama, karena di kelas lain kelompok dan muridnya berbeda.'),
        el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:18px;' }, [
          el('button', {
            class: 'tombol tombol-primer tombol-kecil',
            onclick: async (e) => {
              if (!sumber) { roti('Pilih penugasan sumber lebih dulu.', 'galat'); return; }
              e.currentTarget.disabled = true;
              try {
                const h = await salinPeranDariPenugasan(sumber, penugasanId, {
                  ikutPemegang, kelasSama: true
                });
                tutup();
                roti(`${h.dibuat} peran disalin` +
                     (h.dilewati ? `, ${h.dilewati} dilewati` : '') +
                     (h.pemegangDisalin ? `, ${h.pemegangDisalin} pembagian ikut disalin` : '') + '.', 'sukses');
                await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); e.currentTarget.disabled = false; }
            }
          }, 'Salin Sekarang')
        ]),

        // --- Cara 2: JSON ---
        el('div', { style: 'font-weight:650;font-size:13px;margin-bottom:6px;' }, '2. Ekspor / impor lewat teks JSON'),
        el('div', { class: 'keterangan', style: 'margin:0 0 6px;' },
          'Isi kotak di bawah adalah daftar peran TP ini. Salin untuk disimpan, atau tempel daftar dari TP lain lalu tekan Impor.'),
        areaJson,
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:10px;' }, [
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil',
            onclick: async () => {
              try { await navigator.clipboard.writeText(areaJson.value); roti('Tersalin ke papan klip.', 'sukses'); }
              catch { areaJson.select(); roti('Tekan Ctrl+C untuk menyalin.', 'info'); }
            }
          }, 'Salin'),
          el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: () => tutup() }, 'Tutup'),
          el('button', {
            class: 'tombol tombol-primer tombol-kecil',
            onclick: async () => {
              try {
                const daftar = dariJson(areaJson.value);
                const h = await imporPeran(penugasanId, daftar);
                tutup();
                roti(`${h.dibuat} peran diimpor` + (h.dilewati ? `, ${h.dilewati} dilewati` : '') + '.', 'sukses');
                await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Impor')
        ])
      ])
    });
  }

  function gambarTabDaftar() {
    return el('div', {}, [
      el('div', { class: 'panel-info', style: 'margin-bottom:14px;' }, [
        el('div', { style: 'font-weight:650;margin-bottom:4px;' }, 'Peran ini hanya berlaku pada TP ini'),
        el('div', { style: 'font-size:13px;' },
          'Peran "Ketua" di halaman Kelompok tetap berlaku sepanjang semester. Yang Anda susun di sini adalah pembagian kerja untuk satu TP saja, ' +
          'dan boleh berbeda sama sekali pada TP berikutnya.')
      ]),
      el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;flex-wrap:wrap;' }, [
        el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: bukaDialogEksporImpor }, ikonTeks('unduh', 'Ekspor / Impor')),
        el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: bukaDialogContoh }, 'Pakai Contoh'),
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => bukaDialogPeran(null) }, '+ Tambah Peran')
      ]),
      peranList.length === 0
        ? el('div', { class: 'kartu-kosong' },
            'Belum ada peran pada TP ini. Tekan "Pakai Contoh" untuk memuat kumpulan peran yang sudah siap, atau susun sendiri.')
        : el('div', { class: 'daftar-baris' }, peranList.map((p, i) => el('div', { class: 'baris-item' }, [
            el('span', { class: 'lencana' }, String(i + 1)),
            el('div', { class: 'isi-utama' }, [
              el('div', { class: 'judul-baris' }, p.nama),
              el('div', { class: 'meta-baris' }, [
                p.deskripsi || 'Tanpa keterangan tugas',
                p.label_catatan ? ` · kolom tambahan: ${p.label_catatan}` : '',
                ` · dipegang ${pemegangList.filter(x => x.peran_id === p.id).length} murid`
              ].join(''))
            ]),
            el('div', { style: 'display:flex;gap:4px;flex-shrink:0;' }, [
              el('button', { class: 'tombol tombol-hantu tombol-kecil', title: 'Naikkan', onclick: () => geser(i, -1) }, '↑'),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', title: 'Turunkan', onclick: () => geser(i, 1) }, '↓'),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogPeran(p) }, ikon('ubah', 14)),
              el('button', {
                class: 'tombol tombol-bahaya tombol-kecil',
                onclick: async () => {
                  const jml = pemegangList.filter(x => x.peran_id === p.id).length;
                  const ok = await konfirmasi(
                    `Hapus peran "${p.nama}"?` + (jml ? ` ${jml} pembagian pada peran ini ikut terhapus.` : ''),
                    { labelYa: 'Hapus', labelTidak: 'Batal' });
                  if (!ok) return;
                  try { await hapusPeran(p.id); roti('Peran dihapus.', 'sukses'); await muat(); }
                  catch (err) { roti(pesanGalat(err), 'galat'); }
                }
              }, ikon('tutup', 14))
            ])
          ])))
    ]);
  }

  // ---------- Bagian 2: pembagian per kelompok ----------
  function bukaDialogBagi(kelompok, peran) {
    const anggota = anggotaKelompok(kelompok);
    const sudah = pemegang(peran.id, kelompok.id);
    let muridId = sudah[0]?.murid_id || '';
    let catatan = sudah[0]?.catatan || '';

    const { tutup } = dialog({
      judul: `${peran.nama} — ${kelompok.nama}`,
      isi: el('div', {}, [
        peran.deskripsi
          ? el('div', { class: 'panel-info', style: 'margin-bottom:12px;' }, peran.deskripsi)
          : null,
        el('div', { class: 'medan' }, [
          el('label', {}, 'Pemegang Peran'),
          anggota.length === 0
            ? el('div', { class: 'keterangan', style: 'margin:0;' }, 'Kelompok ini belum punya anggota.')
            : el('select', { onchange: (e) => { muridId = e.target.value; } }, [
                el('option', { value: '' }, '— belum ditentukan —'),
                ...anggota.map(a => el('option', {
                  value: a.murid_id, selected: a.murid_id === muridId
                }, namaMurid(a.profil)))
              ])
        ]),
        peran.label_catatan ? el('div', { class: 'medan' }, [
          el('label', {}, peran.label_catatan),
          el('input', { value: catatan, oninput: (e) => { catatan = e.target.value; }, placeholder: peran.label_catatan })
        ]) : null,
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          sudah.length > 0 ? el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              try { for (const s of sudah) await cabutPeran(s.id); tutup(); roti('Pembagian dicabut.', 'sukses'); await muat(); }
              catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Cabut') : null,
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              if (!muridId) { roti('Pilih pemegang perannya lebih dulu.', 'galat'); return; }
              try {
                // Peran ini boleh dipegang satu orang per kelompok: pemegang
                // lama dicabut dulu supaya tidak tercatat dua-duanya.
                for (const s of sudah) if (s.murid_id !== muridId) await cabutPeran(s.id);
                await berikanPeran({ penugasanId, peranId: peran.id, kelompokId: kelompok.id, muridId, catatan });
                tutup(); roti('Pembagian disimpan.', 'sukses'); await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  function gambarTabBagi() {
    if (peranList.length === 0) {
      return el('div', { class: 'kartu-kosong' }, 'Susun daftar perannya dulu di tab "Daftar Peran".');
    }
    if (kelompokList.length === 0) {
      return el('div', { class: 'kartu-kosong' }, 'Belum ada kelompok di kelas ini.');
    }
    return el('div', {}, [
      el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
        'Pembagian ini boleh dibiarkan kosong: selama penugasan masih terbuka, KETUA tiap kelompok bisa membaginya sendiri dari Papan Misi — ' +
        'sesuai LKM yang meminta kelompok membagi perannya sendiri. Isi di sini hanya bila Anda ingin menentukannya.'),
      ...kelompokList.map(k => {
        const anggota = anggotaKelompok(k);
        const terbagi = peranList.filter(p => pemegang(p.id, k.id).length > 0).length;
        return el('details', { class: 'kartu', style: 'padding:12px;margin-bottom:10px;' }, [
          el('summary', { style: 'cursor:pointer;' }, [
            el('span', { style: 'font-weight:650;' }, k.nama),
            el('span', {
              class: 'lencana',
              style: 'margin-left:8px;' + (terbagi === peranList.length
                ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : '')
            }, `${terbagi} dari ${peranList.length} peran terbagi`),
            el('span', { style: 'margin-left:8px;font-size:12px;color:var(--abu-teks);' }, `${anggota.length} anggota`)
          ]),
          el('div', { class: 'daftar-baris', style: 'margin-top:10px;' }, peranList.map(p => {
            const pm = pemegang(p.id, k.id)[0] || null;
            return el('div', { class: 'baris-item' }, [
              el('div', { class: 'isi-utama' }, [
                el('div', { class: 'judul-baris' }, p.nama),
                el('div', { class: 'meta-baris' }, pm
                  ? namaMurid(pm.profil) + (p.label_catatan ? ` · ${p.label_catatan}: ${pm.catatan || '—'}` : '')
                  : 'Belum ada pemegang')
              ]),
              el('button', {
                class: pm ? 'tombol tombol-hantu tombol-kecil' : 'tombol tombol-sekunder tombol-kecil',
                onclick: () => bukaDialogBagi(k, p)
              }, pm ? 'Ubah' : 'Tentukan')
            ]);
          }))
        ]);
      })
    ]);
  }

  function gambarTabTombol(kunci, label) {
    return el('button', {
      class: 'tab' + (tab === kunci ? ' aktif' : ''),
      onclick: () => { tab = kunci; render(); }
    }, label);
  }

  function render() {
    const konten = memuat
      ? el('div', { class: 'kartu', style: 'padding:40px;text-align:center;color:var(--abu-teks);' }, 'Memuat…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : el('div', {}, [
            el('div', { class: 'deret-tab' }, [
              gambarTabTombol('daftar', `Daftar Peran (${peranList.length})`),
              gambarTabTombol('bagi', `Pembagian (${kelompokList.length} kelompok)`)
            ]),
            tab === 'daftar' ? gambarTabDaftar() : gambarTabBagi()
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Peran Kelompok',
      sub: penugasan?.tujuan_pembelajaran?.judul || '',
      onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [
          el('a', { href: penugasan?.kelas_id ? `#/guru/kelas/${penugasan.kelas_id}` : '#/guru/kelas' }, '← Kelas')
        ]),
        konten
      ]
    }));
  }

  render();
  await muat();
}
