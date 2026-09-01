// src/halaman/guru-kelas.js — Kelas untuk guru: daftar, buat, detail (roster,
// kelompok, penugasan).
import { el, isi, roti, dialog, konfirmasi, tanggalId } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { navigasi } from '../lib/rute.js';
import { daftarMapel } from '../lib/data-kurikulum.js';
import {
  daftarKelasGuru, buatKelas, hapusKelas, ambilKelas,
  daftarMuridKelas, daftarKelompok, buatKelompok, hapusKelompok, tambahAnggota, keluarkanAnggota, jadikanKetua,
  daftarPenugasanKelas, daftarProgramTerbit, buatPenugasan, updatePenugasan, hapusPenugasan
} from '../lib/data-kelas.js';
import { daftarSusulanPenugasan, beriSusulan, cabutSusulan } from '../lib/data-susulan.js';
import { ambilStrukturProgram } from '../lib/data-papan.js';
import { simpanObservasiSikap, INDIKATOR_SIKAP } from '../lib/data-asesmen.js';
import { ubahKendaliMurid, ubahAktifPendaftaran, hitungPekerjaanMurid, keluarkanMuridDariKelas } from '../lib/data-kelas.js';
import { updateProfil } from '../lib/data-profil.js';
import { bukaKanalPrivat } from '../lib/data-obrolan.js';

// ============================================================
// DAFTAR KELAS
// ============================================================
export async function renderGuruKelasList(root, { profil, onKeluar }) {
  let memuat = true, galat = '', daftar = [];

  async function bukaDialogBuat() {
    let mapelList = [];
    try { mapelList = await daftarMapel(); }
    catch (err) { roti(pesanGalat(err), 'galat'); return; }
    if (mapelList.length === 0) {
      roti('Belum ada mata pelajaran. Minta admin menambahkannya di menu Mata Pelajaran.', 'galat');
      return;
    }

    const { tutup } = dialog({
      judul: 'Buat Kelas Baru',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Kelas'),
          el('input', { id: 'k-nama', placeholder: 'mis. XI KIK 1' })
        ]),
        mapelList.length > 1 ? el('div', { class: 'medan' }, [
          el('label', {}, 'Mata Pelajaran'),
          el('select', { id: 'k-mapel' }, mapelList.map(m => el('option', { value: m.id }, `${m.kode} — ${m.nama}`)))
        ]) : null,
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const nama = document.getElementById('k-nama').value.trim();
              if (!nama) { roti('Nama kelas wajib diisi.', 'galat'); return; }
              const mapelId = document.getElementById('k-mapel')?.value || mapelList[0].id;
              try {
                const baru = await buatKelas({ nama, mata_pelajaran_id: mapelId, guru_id: profil.id });
                tutup();
                navigasi(`#/guru/kelas/${baru.id}`);
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Buat Kelas')
        ])
      ])
    });
  }

  async function hapus(k) {
    const ok = await konfirmasi(`Hapus kelas "${k.nama}"? Seluruh pendaftaran, kelompok, dan penugasan ikut terhapus.`, { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusKelas(k.id); roti('Kelas dihapus.', 'sukses'); await muat(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  async function muat() {
    memuat = true; render();
    try { daftar = await daftarKelasGuru(); } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  function render() {
    const isiHalaman = memuat
      ? el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat kelas…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : daftar.length === 0
          ? el('div', { class: 'kartu-kosong' }, [
              el('h3', {}, 'Belum ada kelas'),
              el('p', { style: 'margin:8px 0 16px;' }, 'Buat kelas untuk mendapat kode gabung yang bisa dibagikan ke murid.'),
              el('button', { class: 'tombol tombol-primer', onclick: bukaDialogBuat }, '+ Buat Kelas Pertama')
            ])
          : el('div', { class: 'grid-kartu' }, daftar.map(k => el('div', {
              class: 'kartu kartu-interaktif', onclick: () => navigasi(`#/guru/kelas/${k.id}`)
            }, [
              el('h3', {}, k.nama),
              el('div', { style: 'display:flex;align-items:center;gap:6px;margin:10px 0;' }, [
                el('span', { style: 'font-size:12px;color:var(--abu-teks);' }, 'Kode gabung'),
                el('code', { style: 'background:var(--biru-kabut);color:var(--biru-tua);padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;' }, k.kode_gabung)
              ]),
              el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
                el('span', { style: 'font-size:12px;color:var(--abu-teks-halus);' }, `${k.pendaftaran?.[0]?.count ?? 0} murid`),
                el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: (e) => { e.stopPropagation(); hapus(k); } }, 'Hapus')
              ])
            ])));

    isi(root, renderShell({
      profil, judulHalaman: 'Kelas', sub: 'Kelola kelas, kode gabung, kelompok, dan penugasan.', onKeluar,
      konten: [
        el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:16px;' }, [
          daftar.length > 0 ? el('button', { class: 'tombol tombol-primer', onclick: bukaDialogBuat }, '+ Kelas Baru') : null
        ]),
        isiHalaman
      ]
    }));
  }

  render();
  await muat();
}

// ============================================================
// DETAIL KELAS (roster / kelompok / penugasan)
// ============================================================
export async function renderGuruKelasDetail(root, { profil, onKeluar, kelasId }) {
  let memuat = true, galat = '', tab = 'roster';
  let kelas = null, murid = [], kelompokList = [], penugasanList = [], programTerbit = [];

  async function muatSemua() {
    memuat = true; render();
    try {
      [kelas, murid, kelompokList, penugasanList, programTerbit] = await Promise.all([
        ambilKelas(kelasId), daftarMuridKelas(kelasId), daftarKelompok(kelasId), daftarPenugasanKelas(kelasId), daftarProgramTerbit()
      ]);
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  // ---------- Kelompok ----------
  function muridSudahBerkelompok(muridId) {
    return kelompokList.some(k => k.anggota_kelompok.some(a => a.murid_id === muridId));
  }

  function bukaDialogBuatKelompok() {
    const { tutup } = dialog({
      judul: 'Buat Kelompok Baru',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Kelompok'),
          el('input', { id: 'kk-nama', placeholder: `mis. Kelompok ${kelompokList.length + 1}` })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const nama = document.getElementById('kk-nama').value.trim() || `Kelompok ${kelompokList.length + 1}`;
              try { await buatKelompok(kelasId, nama); tutup(); roti('Kelompok dibuat.', 'sukses'); await muatSemua(); }
              catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Buat')
        ])
      ])
    });
  }

  async function hapusKelompokDenganKonfirmasi(k) {
    const ok = await konfirmasi(`Hapus kelompok "${k.nama}"?`, { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusKelompok(k.id); roti('Kelompok dihapus.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function bukaDialogTambahAnggota(kelompok) {
    const belumBerkelompok = murid.filter(m => !muridSudahBerkelompok(m.murid_id));
    if (belumBerkelompok.length === 0) { roti('Semua murid sudah tergabung di suatu kelompok.', 'info'); return; }
    const { tutup } = dialog({
      judul: `Tambah Anggota — ${kelompok.nama}`,
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Pilih Murid'),
          el('select', { id: 'ta-murid' }, belumBerkelompok.map(m =>
            el('option', { value: m.murid_id }, m.profil?.nama || m.murid_id)))
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const muridId = document.getElementById('ta-murid').value;
              try { await tambahAnggota(kelompok.id, muridId); tutup(); roti('Anggota ditambahkan.', 'sukses'); await muatSemua(); }
              catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Tambahkan')
        ])
      ])
    });
  }

  // ---------- Penugasan ----------
  function bukaDialogPenugasan(penugasanLama) {
    if (programTerbit.length === 0) {
      roti('Belum ada Program Inkubasi yang diterbitkan. Terbitkan program dulu di menu Program Inkubasi.', 'galat');
      return;
    }
    const { tutup } = dialog({
      judul: penugasanLama ? 'Edit Penugasan' : 'Tugaskan Program ke Kelas Ini',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Program Inkubasi'),
          el('select', { id: 'pn-program', disabled: !!penugasanLama }, programTerbit.map(p =>
            el('option', { value: p.id, selected: penugasanLama?.tujuan_pembelajaran_id === p.id }, p.judul)))
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Tenggat (WIB)'),
          el('input', {
            id: 'pn-tenggat', type: 'datetime-local',
            value: penugasanLama ? keDatetimeLocal(penugasanLama.tenggat) : ''
          })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const tenggatVal = document.getElementById('pn-tenggat').value;
              if (!tenggatVal) { roti('Tenggat wajib diisi.', 'galat'); return; }
              const tenggat = new Date(tenggatVal).toISOString();
              try {
                if (penugasanLama) {
                  await updatePenugasan(penugasanLama.id, { tenggat });
                } else {
                  const tujuan_pembelajaran_id = document.getElementById('pn-program').value;
                  await buatPenugasan({ kelas_id: kelasId, tujuan_pembelajaran_id, tenggat, dibuka: true });
                }
                tutup(); roti('Penugasan disimpan.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  function keDatetimeLocal(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function ubahBukaTutup(p) {
    try { await updatePenugasan(p.id, { dibuka: !p.dibuka }); roti(p.dibuka ? 'Penugasan ditutup.' : 'Penugasan dibuka.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  async function hapusPenugasanDenganKonfirmasi(p) {
    const ok = await konfirmasi('Hapus penugasan ini? Progres murid pada penugasan ini ikut terhapus.', { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusPenugasan(p.id); roti('Penugasan dihapus.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function bukaDialogSikap(m) {
    const { tutup } = dialog({
      judul: `Observasi Sikap — ${m.profil?.nama}`,
      isi: el('div', {}, [
        ...INDIKATOR_SIKAP.map(ind => el('div', { class: 'medan' }, [
          el('label', {}, ind.label),
          el('select', { id: `sk-${ind.key}` }, [1, 2, 3, 4, 5].map(n => el('option', { value: n, selected: n === 4 }, String(n))))
        ])),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Catatan (opsional)'),
          el('textarea', { id: 'sk-catatan' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const skor = {};
              for (const ind of INDIKATOR_SIKAP) skor[ind.key] = Number(document.getElementById(`sk-${ind.key}`).value);
              const catatan = document.getElementById('sk-catatan').value.trim();
              try {
                await simpanObservasiSikap({ kelasId, muridId: m.murid_id, guruId: profil.id, skor, catatan });
                tutup(); roti('Observasi sikap tersimpan.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  function bukaDialogDataMurid(m) {
    const { tutup } = dialog({
      judul: 'Data Murid',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Perbaiki nama, nomor absen, atau NIS bila murid salah mengisi. Nomor absen dipakai untuk mengurutkan Rekap Nilai dan ekspor CSV.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Lengkap'),
          el('input', { id: 'dm-nama', value: m.profil?.nama || '' })
        ]),
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Nomor Absen'),
            el('input', { id: 'dm-absen', type: 'number', min: '1', value: m.profil?.no_absen ?? '' })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'NIS'),
            el('input', { id: 'dm-nis', value: m.profil?.nis || '' })
          ])
        ]),
        el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:12px;' }, m.profil?.email || ''),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              try {
                await updateProfil(m.murid_id, {
                  nama: document.getElementById('dm-nama').value,
                  nis: document.getElementById('dm-nis').value,
                  no_absen: document.getElementById('dm-absen').value
                });
                tutup(); roti('Data murid diperbarui.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  /** Nonaktifkan atau keluarkan murid dari kelas. */
  async function bukaDialogKeanggotaan(m) {
    const nama = m.profil?.nama || '(tanpa nama)';
    let jumlahKerja = 0;
    try { jumlahKerja = await hitungPekerjaanMurid(kelasId, m.murid_id); }
    catch (err) { roti(pesanGalat(err), 'galat'); return; }

    const { tutup } = dialog({
      judul: `Keanggotaan — ${nama}`,
      isi: el('div', {}, [
        jumlahKerja > 0
          ? el('div', { class: 'panel-info', style: 'margin-bottom:14px;background:var(--kuning-lembut);border-color:transparent;color:var(--kuning-teks);' },
              `Murid ini sudah punya ${jumlahKerja} catatan pekerjaan di kelas ini. Bila hanya berhenti mengikuti kelas, pilih Nonaktifkan agar nilainya tetap tercatat.`)
          : el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
              'Murid ini belum punya catatan pekerjaan di kelas ini, jadi aman dikeluarkan sepenuhnya.'),

        el('div', { class: 'kartu', style: 'padding:12px;margin-bottom:10px;' }, [
          el('div', { style: 'font-weight:600;margin-bottom:4px;' },
            m.aktif === false ? 'Aktifkan Kembali' : 'Nonaktifkan'),
          el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:10px;' },
            m.aktif === false
              ? 'Murid dapat mengakses kelas ini lagi.'
              : 'Murid kehilangan akses ke kelas ini, tetapi seluruh nilai dan pekerjaannya tetap tersimpan dan tetap muncul di Rekap Nilai. Cocok untuk murid yang pindah di tengah semester.'),
          el('button', {
            class: 'tombol tombol-sekunder',
            onclick: async () => {
              try {
                await ubahAktifPendaftaran(m.id, m.aktif === false);
                tutup();
                roti(m.aktif === false ? 'Murid diaktifkan kembali.' : 'Murid dinonaktifkan.', 'sukses');
                await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, m.aktif === false ? 'Aktifkan Kembali' : 'Nonaktifkan')
        ]),

        el('div', { class: 'kartu', style: 'padding:12px;border-color:var(--merah-lembut);' }, [
          el('div', { style: 'font-weight:600;margin-bottom:4px;color:var(--merah);' }, 'Keluarkan dari Kelas'),
          el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:10px;' },
            'Murid dihapus dari daftar kelas dan dari kelompoknya, serta hilang dari Rekap Nilai. ' +
            'Cocok untuk murid yang salah masuk kelas atau akun uji coba. ' +
            'Pekerjaannya sendiri tidak ikut terhapus — bila ia bergabung lagi dengan kode yang sama, pekerjaannya muncul kembali.'),
          el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              const ok = await konfirmasi(
                `Keluarkan ${nama} dari kelas ini?` +
                (jumlahKerja > 0 ? ` Ia punya ${jumlahKerja} catatan pekerjaan yang akan hilang dari Rekap Nilai.` : ''),
                { labelYa: 'Keluarkan', labelTidak: 'Batal' });
              if (!ok) return;
              try {
                await keluarkanMuridDariKelas(m.id, m.murid_id, kelasId);
                tutup(); roti('Murid dikeluarkan dari kelas.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Keluarkan dari Kelas')
        ])
      ])
    });
  }

  async function ubahKendali(m, kendaliBaru) {
    try {
      await ubahKendaliMurid(m.id, kendaliBaru);
      m.kendali = kendaliBaru;
      roti(`Akses ${m.profil?.nama} diubah ke "${kendaliBaru}".`, 'sukses');
      render();
    } catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  // ---------- Render tab ----------
  /** Urutkan menurut nomor absen; murid yang belum mengisi absen di bawah. */
  function muridTerurut() {
    return [...murid].sort((a, b) => {
      const na = a.profil?.no_absen, nb = b.profil?.no_absen;
      if (na != null && nb != null) return na - nb;
      if (na != null) return -1;
      if (nb != null) return 1;
      return (a.profil?.nama || '').localeCompare(b.profil?.nama || '');
    });
  }

  function gambarTabRoster() {
    return el('div', { class: 'daftar-baris' }, murid.length === 0
      ? [el('div', { class: 'kartu-kosong' }, 'Belum ada murid. Bagikan kode gabung kelas ini agar murid bisa bergabung.')]
      : muridTerurut().map(m => el('div', { class: 'baris-item' }, [
          el('span', {
            class: 'lencana',
            style: m.profil?.no_absen ? '' : 'background:var(--kuning-lembut);color:var(--kuning-teks);border-color:transparent;',
            title: 'Nomor absen'
          }, m.profil?.no_absen ? String(m.profil.no_absen) : '—'),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, m.profil?.nama || '(tanpa nama)'),
            el('div', { class: 'meta-baris' },
              [m.profil?.nis ? `NIS ${m.profil.nis}` : null, m.profil?.email].filter(Boolean).join(' · '))
          ]),
          m.aktif === false
            ? el('span', { class: 'lencana', style: 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;' }, 'Nonaktif')
            : muridSudahBerkelompok(m.murid_id)
              ? el('span', { class: 'lencana lencana-tim' }, 'Berkelompok')
              : el('span', { class: 'lencana' }, 'Belum berkelompok'),
          el('div', { style: 'display:flex;gap:2px;' }, [
            el('button', {
              class: `tombol tombol-kecil ${m.kendali === 'aktif' || !m.kendali ? 'tombol-primer' : 'tombol-hantu'}`,
              title: 'Aktifkan', onclick: () => ubahKendali(m, 'aktif')
            }, ikon('mulai', 15)),
            el('button', {
              class: `tombol tombol-kecil ${m.kendali === 'dijeda' ? 'tombol-primer' : 'tombol-hantu'}`,
              title: 'Jeda', onclick: () => ubahKendali(m, 'dijeda')
            }, ikon('jeda', 15)),
            el('button', {
              class: `tombol tombol-kecil ${m.kendali === 'dikunci' ? 'tombol-bahaya' : 'tombol-hantu'}`,
              title: 'Kunci', onclick: () => ubahKendali(m, 'dikunci')
            }, ikon('gembok', 15))
          ]),
          el('div', { class: 'aksi-baris' }, [
            el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogDataMurid(m) }, ikonTeks('ubah', 'Data')),
            el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogSikap(m) }, ikonTeks('catatan', 'Sikap')),
            el('button', {
              class: 'tombol tombol-hantu tombol-kecil',
              onclick: async () => {
                try {
                  const kanal = await bukaKanalPrivat(kelasId, m.murid_id);
                  navigasi(`#/obrolan/${kanal.id}`);
                } catch (err) { roti(pesanGalat(err), 'galat'); }
              }
            }, ikonTeks('refleksi', 'Pesan')),
            el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogKeanggotaan(m) }, ikonTeks('keluar', 'Keanggotaan'))
          ])
        ])));
  }

  function gambarTabKelompok() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:12px;' }, [
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: bukaDialogBuatKelompok }, '+ Buat Kelompok')
      ]),
      kelompokList.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada kelompok.')
        : el('div', { class: 'grid-kartu' }, kelompokList.map(k => el('div', { class: 'kartu' }, [
            el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;' }, [
              el('h3', {}, k.nama),
              el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: () => hapusKelompokDenganKonfirmasi(k) }, 'Hapus')
            ]),
            k.anggota_kelompok.length === 0
              ? el('div', { style: 'color:var(--abu-teks);font-size:13px;' }, 'Belum ada anggota.')
              : el('div', { class: 'daftar-baris', style: 'margin-bottom:10px;' }, k.anggota_kelompok.map(a => el('div', { class: 'baris-item', style: 'padding:8px 12px;' }, [
                  el('div', { class: 'isi-utama' }, [
                    el('span', { style: 'font-weight:600;' }, a.profil?.nama || a.murid_id),
                    a.peran_dalam_kelompok === 'ketua' ? el('span', { class: 'lencana lencana-tim', style: 'margin-left:6px;' }, 'Ketua') : null
                  ]),
                  el('div', { class: 'aksi-baris', style: 'opacity:1;' }, [
                    a.peran_dalam_kelompok !== 'ketua'
                      ? el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: async () => { try { await jadikanKetua(k.id, a.id); await muatSemua(); } catch (err) { roti(pesanGalat(err), 'galat'); } } }, 'Jadikan Ketua')
                      : null,
                    el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: async () => { try { await keluarkanAnggota(a.id); roti('Anggota dikeluarkan.', 'sukses'); await muatSemua(); } catch (err) { roti(pesanGalat(err), 'galat'); } } }, 'Keluarkan')
                  ])
                ]))),
            el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: () => bukaDialogTambahAnggota(k) }, '+ Tambah Anggota')
          ])))
    ]);
  }

  // ---------- Susulan ----------
  async function bukaDialogSusulan(p) {
    let sprintsProgram = [];
    try { sprintsProgram = await ambilStrukturProgram(p.tujuan_pembelajaran_id); }
    catch (err) { roti(pesanGalat(err), 'galat'); return; }
    if (sprintsProgram.length === 0) { roti('Program ini belum punya tahap.', 'galat'); return; }

    let daftarSekarang = [];
    try { daftarSekarang = await daftarSusulanPenugasan(p.id); } catch { /* biarkan kosong */ }

    const { tutup } = dialog({
      judul: 'Kelonggaran / Susulan',
      isi: el('div', {}, [
        daftarSekarang.length > 0 ? el('div', { style: 'margin-bottom:16px;' }, [
          el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:8px;' }, 'Susulan aktif'),
          el('div', { class: 'daftar-baris' }, daftarSekarang.map(s => el('div', { class: 'baris-item', style: 'padding:8px 12px;' }, [
            el('div', { class: 'isi-utama' }, [
              el('div', { style: 'font-weight:600;font-size:13px;' }, `${s.profil?.nama} — Tahap ${s.sprint?.nomor}`),
              el('div', { class: 'meta-baris' }, `Tenggat baru: ${tanggalId(s.tenggat_khusus, true)}${s.susulan ? ' · kena penalti' : ''}`)
            ]),
            el('button', {
              class: 'tombol tombol-bahaya tombol-kecil',
              onclick: async () => { try { await cabutSusulan(s.id); tutup(); roti('Susulan dicabut.', 'sukses'); bukaDialogSusulan(p); } catch (err) { roti(pesanGalat(err), 'galat'); } }
            }, 'Cabut')
          ])))
        ]) : null,
        el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:8px;' }, 'Beri susulan baru'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Murid'),
          el('select', { id: 'su-murid' }, murid.map(m => el('option', { value: m.murid_id }, m.profil?.nama || m.murid_id)))
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Tahap'),
          el('select', { id: 'su-sprint' }, sprintsProgram.map(s => el('option', { value: s.id }, `Tahap ${s.nomor} — ${s.nama}`)))
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Tenggat Baru'),
          el('input', { id: 'su-tenggat', type: 'datetime-local' })
        ]),
        el('div', { class: 'medan', style: 'display:flex;align-items:center;gap:8px;' }, [
          el('input', { type: 'checkbox', id: 'su-penalti', checked: true }),
          el('label', { style: 'margin:0;' }, 'Kenakan penalti susulan saat dinilai nanti')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Tutup'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const tenggatVal = document.getElementById('su-tenggat').value;
              if (!tenggatVal) { roti('Tenggat baru wajib diisi.', 'galat'); return; }
              try {
                await beriSusulan({
                  penugasanId: p.id,
                  sprintId: document.getElementById('su-sprint').value,
                  muridId: document.getElementById('su-murid').value,
                  tenggatKhusus: new Date(tenggatVal).toISOString(),
                  penalti: document.getElementById('su-penalti').checked
                });
                tutup(); roti('Susulan diberikan.', 'sukses'); bukaDialogSusulan(p);
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Beri Susulan')
        ])
      ])
    });
  }

  function gambarTabPenugasan() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:12px;' }, [
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => bukaDialogPenugasan(null) }, '+ Tugaskan Program')
      ]),
      penugasanList.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada program yang ditugaskan ke kelas ini.')
        : el('div', { class: 'daftar-baris' }, penugasanList.map(p => el('div', { class: 'baris-item' }, [
            el('div', { class: 'isi-utama' }, [
              el('div', { class: 'judul-baris' }, p.tujuan_pembelajaran?.judul || '(program dihapus)'),
              el('div', { class: 'meta-baris' }, `Tenggat: ${tanggalId(p.tenggat, true)}`)
            ]),
            el('span', { class: p.dibuka ? 'lencana' : 'lencana lencana-susulan', style: p.dibuka ? 'background:var(--hijau-lembut);color:#006644;' : '' }, p.dibuka ? 'Terbuka' : 'Ditutup'),
            el('div', { class: 'aksi-baris' }, [
              el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => navigasi(`#/guru/pantau/${p.id}`) }, ikonTeks('papan', 'Pantau')),
              el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: () => navigasi(`#/guru/nilai/${p.id}`) }, ikonTeks('nilai', 'Nilai')),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => navigasi(`#/guru/asesmen/${p.id}`) }, ikonTeks('asesmen', 'Asesmen')),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => navigasi(`#/guru/kemiripan/${p.id}`) }, ikonTeks('cari', 'Kemiripan')),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogSusulan(p) }, ikonTeks('kalender', 'Susulan')),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogPenugasan(p) }, 'Ubah Tenggat'),
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => ubahBukaTutup(p) }, p.dibuka ? 'Tutup' : 'Buka'),
              el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: () => hapusPenugasanDenganKonfirmasi(p) }, 'Hapus')
            ])
          ])))
    ]);
  }

  function render() {
    if (memuat) {
      isi(root, renderShell({ profil, judulHalaman: 'Memuat…', onKeluar, konten: el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat kelas…') }));
      return;
    }
    if (galat || !kelas) {
      isi(root, renderShell({ profil, judulHalaman: 'Kelas tidak ditemukan', onKeluar, konten: el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat || 'Kelas tidak ditemukan.') }));
      return;
    }
    isi(root, renderShell({
      profil, judulHalaman: kelas.nama, onKeluar,
      sub: `Kode gabung: ${kelas.kode_gabung}`,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: '#/guru/kelas' }, '← Kelas')]),
        el('div', { class: 'deret-tab' }, [
          gambarTabTombol('roster', `Murid (${murid.length})`),
          gambarTabTombol('kelompok', `Kelompok (${kelompokList.length})`),
          gambarTabTombol('penugasan', `Penugasan (${penugasanList.length})`)
        ]),
        tab === 'roster' ? gambarTabRoster() : tab === 'kelompok' ? gambarTabKelompok() : gambarTabPenugasan()
      ]
    }));
  }

  function gambarTabTombol(kunci, label) {
    const aktif = tab === kunci;
    return el('button', {
      class: 'tab' + (aktif ? ' aktif' : ''),
      onclick: () => { tab = kunci; render(); }
    }, label);
  }

  render();
  await muatSemua();
}
