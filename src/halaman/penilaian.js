// src/halaman/penilaian.js — Penilaian (Fase 5): antrean review, dialog
// beri nilai (dengan faktor kontribusi untuk misi kelompok), riwayat.
import { el, isi, roti, dialog, tanggalId } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilPenugasan } from '../lib/data-papan.js';
import { daftarAntreanPenilaian, daftarSudahDinilai, nilaiTugas, perbaikiNilai, daftarKontribusi, simpanKontribusi, ambilRubrikProgram, kembalikanTugas } from '../lib/data-nilai.js';
import { daftarBadgeProgram, beriBadgeManual } from '../lib/data-asesmen.js';
import { buatPanelPekerjaan } from '../lib/tampil-pekerjaan.js';
import { cetakPekerjaan } from '../lib/cetak.js';
import { daftarMuridKelas, daftarKelompok } from '../lib/data-kelas.js';

const WARNA_HURUF = { A: 'nilai-hijau', B: 'nilai-hijau', C: 'nilai-kuning', D: 'nilai-kuning', E: 'nilai-merah' };

export async function renderPenilaian(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let penugasan = null, antrean = [], riwayat = [];
  let badgeList = [], muridList = [], kelompokList = [], rubrik = null;
  let kelompokAn = 'kelompok';   // 'kelompok' | 'tugas'
  let daftarSedangTampil = [];
  let tab = 'antrean';

  async function muatSemua() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      antrean = await daftarAntreanPenilaian(penugasanId);
      riwayat = await daftarSudahDinilai(penugasanId);
      badgeList = await daftarBadgeProgram(penugasan.tujuan_pembelajaran_id);
      muridList = await daftarMuridKelas(penugasan.kelas_id);
      kelompokList = await daftarKelompok(penugasan.kelas_id);
      rubrik = await ambilRubrikProgram(penugasan.tujuan_pembelajaran_id);
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  /** Cetak hasil pekerjaan untuk dikoreksi luring. */
  async function jalankanCetak(daftar) {
    if (daftar.length === 0) { roti('Tidak ada pekerjaan untuk dicetak.', 'galat'); return; }
    const kemajuan = roti(`Menyiapkan cetak… 0 dari ${daftar.length}`, 'info', 0);
    try {
      await cetakPekerjaan(daftar, {
        namaKelas: penugasan?.kelas?.nama,
        namaProgram: penugasan?.tujuan_pembelajaran?.judul,
        rubrik
      }, (sudah, total) => {
        if (kemajuan) kemajuan.textContent = `Menyiapkan cetak… ${sudah} dari ${total}`;
      });
      kemajuan?.remove();
    } catch (err) {
      kemajuan?.remove();
      roti(pesanGalat(err), 'galat');
    }
  }

  function bukaDialogCetak(daftarTampil) {
    const { tutup } = dialog({
      judul: 'Cetak untuk Koreksi Luring',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Halaman cetak memuat isi lembar kerja, bukti karya yang diunggah, dan tabel rubrik kosong untuk dicentang dengan pena. ' +
          'Pada dialog cetak peramban, pilih tujuan "Simpan sebagai PDF" bila ingin berkas PDF.'),
        el('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, [
          el('button', {
            class: 'tombol tombol-primer',
            onclick: () => { tutup(); jalankanCetak(daftarTampil); }
          }, `Cetak semua yang tampil (${daftarTampil.length} pekerjaan)`),
          el('div', { class: 'keterangan' },
            'Mengikuti pengelompokan dan urutan yang sedang Anda lihat. Tiap pekerjaan dimulai di halaman baru.')
        ])
      ])
    });
  }

  /** Kembalikan tugas ke murid agar bisa dikerjakan ulang. */
  function bukaDialogKembalikan(p) {
    const sudahDinilai = !!p.disetujui_pada;
    const tenggatLewat = penugasan?.tenggat && new Date(penugasan.tenggat) < new Date();
    const { tutup } = dialog({
      judul: 'Kembalikan ke Murid',
      isi: el('div', {}, [
        el('div', { style: 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;' }, [
          el('span', { class: 'lencana' }, p.tugas?.judul || ''),
          el('span', { class: 'lencana' }, p.kelompok_id ? (p.kelompok?.nama || 'Kelompok') : (p.profil?.nama || 'Murid'))
        ]),
        sudahDinilai
          ? el('div', { class: 'panel-info', style: 'margin-bottom:12px;background:var(--kuning-lembut);border-color:transparent;color:var(--kuning-teks);' },
              `Tugas ini sudah dinilai (${p.nilai_huruf || '-'}, ${p.xp_diberikan} XP). Nilai dan XP-nya akan ditarik kembali, dan tugas kembali bisa dikerjakan.`)
          : el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
              'Tugas dikembalikan ke kolom Dikerjakan. Murid melihat catatan Anda di kartu misinya.'),
        tenggatLewat
          ? el('div', { class: 'panel-info', style: 'margin-bottom:12px;background:var(--merah-lembut);border-color:transparent;color:var(--merah-teks);' },
              'Tenggat penugasan ini sudah lewat, jadi murid TIDAK akan bisa menyimpan perbaikannya. Beri Susulan lebih dulu lewat halaman Kelas agar pengembalian ini berguna.')
          : null,
        el('div', { class: 'medan' }, [
          el('label', {}, 'Catatan untuk Murid (wajib)'),
          el('textarea', { id: 'kb-catatan', placeholder: 'mis. Lembar B masih kosong, mohon dilengkapi dulu sebelum diserahkan kembali.' }),
          el('div', { class: 'keterangan' }, 'Catatan ini yang dibaca murid, jadi sebutkan apa persisnya yang perlu diperbaiki.')
        ]),
        el('label', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;' }, [
          el('input', { type: 'checkbox', id: 'kb-backlog' }),
          el('span', { style: 'font-size:13.5px;' }, 'Kembalikan ke kolom "Belum Dikerjakan" (bukan "Dikerjakan")')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              const catatan = document.getElementById('kb-catatan').value.trim();
              if (!catatan) { roti('Catatan untuk murid wajib diisi.', 'galat'); return; }
              try {
                await kembalikanTugas(p.id, catatan, document.getElementById('kb-backlog').checked);
                tutup(); roti('Tugas dikembalikan ke murid.', 'sukses');
                await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Kembalikan')
        ])
      ])
    });
  }

  function bukaDialogNilai(p, modePerbaikan = false) {
    let daftarKontrib = [];
    const areaKontribusi = el('div', { style: 'margin-top:12px;' });

    async function muatKontribusi() {
      if (p.kelompok_id) {
        try {
          daftarKontrib = await daftarKontribusi(p.kelompok_id, p.id);
          gambarKontribusi();
        } catch (err) { roti(pesanGalat(err), 'galat'); }
      }
    }

    function gambarKontribusi() {
      isi(areaKontribusi, [
        el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:8px;' }, 'Faktor Kontribusi Anggota'),
        el('p', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:8px;' },
          '1.0 = kontribusi standar. Turunkan (mis. 0.7) untuk anggota yang kurang berkontribusi, naikkan (maks 1.5) untuk yang melebihi ekspektasi. XP tiap anggota = XP dasar × faktor ini.'),
        ...daftarKontrib.map(k => el('div', { class: 'baris-medan', style: 'align-items:center;margin-bottom:6px;' }, [
          el('span', { style: 'flex:2;font-size:13px;' }, k.nama + (k.peran === 'ketua' ? ' (Ketua)' : '')),
          el('input', {
            type: 'number', step: '0.1', min: '0', max: '1.5', value: k.faktor,
            style: 'flex:1;',
            onchange: async (e) => {
              const faktor = Number(e.target.value) || 1.0;
              try { await simpanKontribusi(p.id, k.muridId, faktor, k.catatan); roti('Faktor disimpan.', 'sukses'); }
              catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          })
        ]))
      ]);
    }
    muatKontribusi();

    // ---- Rubrik (kalau program mendefinisikannya) ----
    // Hanya kriteria yang berkaitan dengan misi INI yang ditampilkan.
    // Kriteria tanpa daftar misi dianggap berlaku umum (mis. "Keterlibatan
    // dan kerja sama"), sedangkan yang punya daftar hanya muncul di misi
    // yang disebutkan — dulu semuanya muncul di setiap misi, sehingga guru
    // dipaksa menilai kriteria yang tidak ada kaitannya.
    const kodeMisi = (p.tugas?.kode || '').toLowerCase();
    const kriteriaDipakai = (rubrik?.kriteria || []).filter(k => {
      const daftar = (k.misi || []).map(x => String(x).toLowerCase());
      return daftar.length === 0 || daftar.includes(kodeMisi);
    });
    const adaYangDisaring = (rubrik?.kriteria || []).length !== kriteriaDipakai.length;

    const areaRubrik = el('div', {});
    const skorRubrik = { ...(modePerbaikan && p.nilai_rubrik ? p.nilai_rubrik : {}) };

    function hitungDariRubrik() {
      if (!rubrik || kriteriaDipakai.length === 0) return null;
      const maks = (rubrik.skor_maks || 4) * kriteriaDipakai.length;
      const total = kriteriaDipakai.reduce((t, k) => t + (Number(skorRubrik[k.nama]) || 0), 0);
      return maks > 0 ? Math.round((total / maks) * 100) : 0;
    }

    function gambarRubrik() {
      if (!rubrik) { isi(areaRubrik, []); return; }
      const maksSkor = rubrik.skor_maks || 4;
      const nilaiHitung = hitungDariRubrik();

      if (kriteriaDipakai.length === 0) {
        isi(areaRubrik, [
          el('div', { class: 'panel-info', style: 'margin:16px 0;background:var(--kuning-lembut);border-color:transparent;color:var(--kuning-teks);' },
            `Tidak ada kriteria rubrik yang ditetapkan untuk misi ${p.tugas?.kode || ''}. ` +
            'Isi nilainya secara manual, atau atur kaitan kriteria–misi lewat tombol Rubrik di Penyunting Program.')
        ]);
        return;
      }

      isi(areaRubrik, [
        el('div', { style: 'font-weight:700;font-size:13px;margin:16px 0 4px;' }, 'Rubrik Penilaian'),
        adaYangDisaring
          ? el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:8px;' },
              `Menampilkan ${kriteriaDipakai.length} dari ${rubrik.kriteria.length} kriteria — hanya yang berkaitan dengan misi ${p.tugas?.kode || ''}.`)
          : null,
        ...kriteriaDipakai.map((k, i) => {
          const kunci = k.nama;
          const levelTersedia = Object.keys(k.level || {}).map(Number).sort((a, b) => b - a);
          return el('div', { class: 'kartu', style: 'padding:10px;margin-bottom:8px;' }, [
            el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:2px;' },
              k.nama + (k.bagian ? ` (Bagian ${k.bagian})` : '')),
            // Deskripsi level ditampilkan UTUH dan membungkus. Dulu dipotong
            // 28 karakter, sehingga guru justru tidak bisa membaca pembeda
            // antar level — padahal itulah gunanya rubrik.
            el('div', { class: 'pilihan-level' },
              levelTersedia.map(lv => {
                const aktif = Number(skorRubrik[kunci]) === lv;
                return el('button', {
                  type: 'button',
                  class: 'level-rubrik' + (aktif ? ' level-aktif' : ''),
                  onclick: () => { skorRubrik[kunci] = lv; gambarRubrik(); }
                }, [
                  el('span', { class: 'level-angka' }, String(lv)),
                  el('span', { class: 'level-teks' }, String(k.level[lv]))
                ]);
              }))
          ]);
        }),
        el('div', { class: 'panel-info', style: 'display:flex;justify-content:space-between;align-items:center;' }, [
          el('span', {}, `Total ${kriteriaDipakai.reduce((t, k) => t + (Number(skorRubrik[k.nama]) || 0), 0)} dari ${maksSkor * kriteriaDipakai.length}`),
          el('span', { style: 'font-size:18px;font-weight:800;' }, `Nilai ${nilaiHitung}`)
        ])
      ]);
      const medanNilai = document.getElementById('n-nilai');
      if (medanNilai) medanNilai.value = nilaiHitung;
    }
    gambarRubrik();

    const { tutup } = dialog({
      judul: (modePerbaikan ? 'Perbaiki Nilai: ' : 'Nilai: ') + (p.tugas?.judul || ''),
      isi: el('div', {}, [
        modePerbaikan ? el('div', { class: 'panel-info', style: 'margin-bottom:12px;background:var(--kuning-lembut);border-color:#ffe380;color:#974F00;' },
          `Nilai saat ini: ${p.nilai_huruf || '—'} (${p.xp_diberikan} XP). XP lama akan ditarik lebih dulu, lalu diberikan ulang sesuai nilai baru.`) : null,
        el('div', { style: 'display:flex;gap:8px;margin-bottom:12px;' }, [
          el('span', { class: 'lencana' }, p.kelompok_id ? `Kelompok: ${p.kelompok?.nama}` : `Murid: ${p.profil?.nama}`),
          el('span', { class: 'lencana' }, `Waktu kerja: ${formatDetik(p.detik_terpakai)}`)
        ]),
        buatPanelPekerjaan(p),
        areaRubrik,
        el('div', { class: 'medan', style: 'margin-top:16px;' }, [
          el('label', {}, (rubrik && kriteriaDipakai.length > 0) ? 'Nilai Akhir (dihitung dari rubrik)' : 'Nilai (0–100)'),
          el('input', {
            id: 'n-nilai', type: 'number', min: '0', max: '100',
            readonly: (rubrik && kriteriaDipakai.length > 0) ? true : undefined,
            style: (rubrik && kriteriaDipakai.length > 0) ? 'background:var(--netral);font-weight:700;' : '',
            value: modePerbaikan ? (p.nilai_angka ?? 80) : ((rubrik && kriteriaDipakai.length > 0) ? 0 : 80)
          })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Umpan Balik untuk Murid'),
          el('textarea', { id: 'n-umpan', placeholder: 'Catatan atau masukan…' }, modePerbaikan ? (p.umpan_balik || '') : '')
        ]),
        p.kelompok_id ? areaKontribusi : null,
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const pakaiRubrik = rubrik && kriteriaDipakai.length > 0;
              if (pakaiRubrik) {
                const belum = kriteriaDipakai.filter(k => !skorRubrik[k.nama]);
                if (belum.length > 0) { roti(`Masih ada ${belum.length} kriteria rubrik yang belum dipilih.`, 'galat'); return; }
              }
              const nilai = pakaiRubrik ? hitungDariRubrik() : Number(document.getElementById('n-nilai').value);
              if (isNaN(nilai) || nilai < 0 || nilai > 100) { roti('Nilai harus 0–100.', 'galat'); return; }
              const umpan = document.getElementById('n-umpan').value.trim();
              try {
                const rincianRubrik = (rubrik && kriteriaDipakai.length > 0) ? skorRubrik : null;
                if (modePerbaikan) await perbaikiNilai(p.id, nilai, umpan, rincianRubrik);
                else await nilaiTugas(p.id, nilai, umpan, rincianRubrik);
                tutup(); roti(modePerbaikan ? 'Nilai diperbaiki & XP disesuaikan.' : 'Nilai disimpan & XP diberikan.', 'sukses');
                await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, modePerbaikan ? 'Simpan Perbaikan' : 'Simpan Nilai')
        ])
      ])
    });
  }

  function formatDetik(total) {
    const j = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
    return j > 0 ? `${j} jam ${m} mnt` : `${m} mnt`;
  }

  /** Urutan tugas: tahap dulu, lalu urutan di dalam tahap, lalu kodenya. */
  function kunciUrutTugas(p) {
    const tahap = p.tugas?.sprint?.nomor ?? 99;
    const urut = p.tugas?.urutan ?? 99;
    return [tahap, urut, p.tugas?.kode || ''];
  }

  /** Bandingkan angka di dalam teks secara wajar, supaya "Kelompok 10"
   *  jatuh SETELAH "Kelompok 2", bukan sebelumnya. */
  function bandingAlami(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
  }

  function bandingUrut(a, b) {
    const ka = kunciUrutTugas(a), kb = kunciUrutTugas(b);
    return (ka[0] - kb[0]) || (ka[1] - kb[1]) || bandingAlami(ka[2], kb[2]);
  }

  /** Nama pengerjanya: kelompok untuk misi kelompok, murid untuk misi mandiri. */
  function namaPengerja(p) {
    if (p.kelompok_id) return p.kelompok?.nama || 'Kelompok';
    const absen = p.profil?.no_absen ? `${p.profil.no_absen}. ` : '';
    return absen + (p.profil?.nama || 'Murid');
  }

  /** Susun daftar menjadi kelompok-kelompok siap tampil. */
  function susunGrup(daftar) {
    const peta = new Map();
    for (const p of daftar) {
      const kunci = kelompokAn === 'kelompok' ? namaPengerja(p)
                                              : `${p.tugas?.kode || ''} — ${p.tugas?.judul || ''}`;
      if (!peta.has(kunci)) peta.set(kunci, []);
      peta.get(kunci).push(p);
    }

    const grup = [...peta.entries()].map(([judul, isi]) => ({ judul, isi }));

    if (kelompokAn === 'kelompok') {
      // Antar grup: nama pengerja secara alami. Di dalam grup: urutan tugas.
      grup.sort((a, b) => bandingAlami(a.judul, b.judul));
      for (const g of grup) g.isi.sort(bandingUrut);
    } else {
      // Antar grup: urutan tugas. Di dalam grup: nama pengerja.
      grup.sort((a, b) => bandingUrut(a.isi[0], b.isi[0]));
      for (const g of grup) g.isi.sort((x, y) => bandingAlami(namaPengerja(x), namaPengerja(y)));
    }
    return grup;
  }

  function gambarPemilihKelompokan() {
    return el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;' }, [
      el('span', { style: 'font-size:12.5px;color:var(--abu-teks);' }, 'Kelompokkan menurut:'),
      el('div', { style: 'display:flex;gap:4px;' }, [
        el('button', {
          class: `tombol tombol-kecil ${kelompokAn === 'kelompok' ? 'tombol-primer' : 'tombol-sekunder'}`,
          onclick: () => { kelompokAn = 'kelompok'; render(); }
        }, 'Kelompok / Murid'),
        el('button', {
          class: `tombol tombol-kecil ${kelompokAn === 'tugas' ? 'tombol-primer' : 'tombol-sekunder'}`,
          onclick: () => { kelompokAn = 'tugas'; render(); }
        }, 'Misi')
      ]),
      el('button', {
        class: 'tombol tombol-sekunder tombol-kecil', style: 'margin-left:auto;',
        onclick: () => bukaDialogCetak(daftarSedangTampil)
      }, ikonTeks('unduh', 'Cetak / PDF'))
    ]);
  }

  /** Bungkus daftar menjadi bagian-bagian berjudul. */
  function gambarBerGrup(daftar, gambarBaris) {
    const grup = susunGrup(daftar);
    // Urutan cetak mengikuti urutan yang sedang dilihat guru.
    daftarSedangTampil = grup.flatMap(g => g.isi);
    return el('div', {}, [
      gambarPemilihKelompokan(),
      ...grup.map(g => el('div', { style: 'margin-bottom:18px;' }, [
        el('div', { class: 'judul-grup' }, [
          el('span', {}, g.judul),
          el('span', { class: 'jumlah-kolom' }, String(g.isi.length))
        ]),
        el('div', { class: 'daftar-baris' }, g.isi.map(gambarBaris))
      ]))
    ]);
  }

  function gambarTabAntrean() {
    if (antrean.length === 0) return el('div', { class: 'kartu-kosong' }, 'Tidak ada yang menunggu penilaian saat ini.');
    return gambarBerGrup(antrean, (p) => el('div', { class: 'baris-item' }, [
      el('span', { class: p.kelompok_id ? 'lencana lencana-tim' : 'lencana lencana-mandiri' }, p.kelompok_id ? 'Kelompok' : 'Mandiri'),
      el('div', { class: 'isi-utama' }, [
        el('div', { class: 'judul-baris' }, p.tugas?.judul),
        el('div', { class: 'meta-baris' }, `${p.kelompok?.nama || p.profil?.nama || '—'} · diserahkan ${tanggalId(p.diserahkan_pada, true)}`)
      ]),
      el('div', { class: 'aksi-baris' }, [
        el('button', { class: 'tombol tombol-hantu tombol-kecil', title: 'Cetak pekerjaan ini', onclick: () => jalankanCetak([p]) }, ikonTeks('berkas', 'Cetak')),
        el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogKembalikan(p) }, 'Kembalikan'),
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => bukaDialogNilai(p) }, 'Beri Nilai')
      ])
    ]));
  }

  function gambarTabRiwayat() {
    if (riwayat.length === 0) return el('div', { class: 'kartu-kosong' }, 'Belum ada yang dinilai.');
    return gambarBerGrup(riwayat, (p) => el('div', { class: 'baris-item' }, [
      el('span', { class: `nilai-kotak ${WARNA_HURUF[p.nilai_huruf] || 'nilai-kuning'}` }, p.nilai_huruf || '—'),
      el('div', { class: 'isi-utama' }, [
        el('div', { class: 'judul-baris' }, p.tugas?.judul),
        el('div', { class: 'meta-baris' }, `${p.kelompok?.nama || p.profil?.nama || '—'} · ${p.xp_diberikan} XP${p.kena_penalti_susulan ? ' · kena penalti susulan' : ''}`)
      ]),
      el('div', { class: 'aksi-baris' }, [
        el('button', { class: 'tombol tombol-hantu tombol-kecil', title: 'Cetak pekerjaan ini', onclick: () => jalankanCetak([p]) }, ikonTeks('berkas', 'Cetak')),
        el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogKembalikan(p) }, 'Kembalikan'),
        el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogNilai(p, true) }, ikonTeks('ubah', 'Perbaiki'))
      ])
    ]));
  }

  function bukaDialogBeriLencana() {
    if (badgeList.length === 0) { roti('Program ini belum punya lencana. Tambahkan dulu di Penyunting Program.', 'galat'); return; }
    const { tutup } = dialog({
      judul: 'Beri Lencana Manual',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Lencana'),
          el('select', { id: 'bl-badge' }, badgeList.map(b => el('option', { value: b.id }, `${b.emoji} ${b.nama} (+${b.xp} XP)`)))
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Penerima'),
          el('select', { id: 'bl-tipe' }, [
            el('option', { value: 'murid' }, 'Satu Murid'),
            el('option', { value: 'kelompok' }, 'Satu Kelompok (semua anggota)')
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Pilih'),
          el('select', { id: 'bl-penerima' }, muridList.map(m => el('option', { value: m.murid_id }, m.profil?.nama || m.murid_id)))
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const badgeId = document.getElementById('bl-badge').value;
              const tipe = document.getElementById('bl-tipe').value;
              const penerimaId = document.getElementById('bl-penerima').value;
              try {
                await beriBadgeManual(tipe === 'murid' ? { badgeId, muridId: penerimaId } : { badgeId, kelompokId: penerimaId });
                tutup(); roti('Lencana diberikan.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Beri Lencana')
        ])
      ])
    });
    // Ganti opsi "Pilih" sesuai tipe penerima yang dipilih.
    const selTipe = document.getElementById('bl-tipe');
    const selPenerima = document.getElementById('bl-penerima');
    selTipe.addEventListener('change', () => {
      isi(selPenerima, (selTipe.value === 'murid' ? muridList.map(m => ({ id: m.murid_id, label: m.profil?.nama || m.murid_id })) : kelompokList.map(k => ({ id: k.id, label: k.nama })))
        .map(o => el('option', { value: o.id }, o.label)));
    });
  }

  function gambarTabLencana() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:12px;' }, [
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: bukaDialogBeriLencana }, ikonTeks('lencana', 'Beri Lencana Manual'))
      ]),
      badgeList.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada lencana untuk program ini.')
        : el('div', { class: 'grid-kartu' }, badgeList.map(b => el('div', { class: 'kartu', style: 'text-align:center;' }, [
            el('div', { style: 'font-size:32px;' }, b.emoji),
            el('div', { style: 'font-weight:700;margin:4px 0;' }, b.nama),
            el('span', { class: 'lencana' }, b.syarat?.jenis ? 'Otomatis' : 'Manual')
          ])))
    ]);
  }

  function gambarTabTombol(kunci, label) {
    const aktif = tab === kunci;
    return el('button', {
      class: 'tab' + (aktif ? ' aktif' : ''),
      onclick: () => { tab = kunci; render(); }
    }, label);
  }

  function render() {
    const konten = memuat
      ? el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : el('div', {}, [
            el('div', { class: 'deret-tab' }, [
              gambarTabTombol('antrean', `Menunggu Penilaian (${antrean.length})`),
              gambarTabTombol('riwayat', `Sudah Dinilai (${riwayat.length})`),
              gambarTabTombol('lencana', `Lencana (${badgeList.length})`)
            ]),
            tab === 'antrean' ? gambarTabAntrean() : tab === 'riwayat' ? gambarTabRiwayat() : gambarTabLencana()
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Penilaian', onKeluar,
      sub: penugasan?.tujuan_pembelajaran?.judul,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: '#/guru/kelas' }, '← Kelas')]),
        konten
      ]
    }));
  }

  render();
  await muatSemua();
}
