// src/halaman/asesmen-guru.js — Guru melihat hasil asesmen non-tes yang
// terkumpul: rangkuman penilaian sejawat, refleksi murid, dan riwayat
// observasi sikap. (Menutup celah: data ini sebelumnya terkumpul tapi tidak
// pernah bisa dibaca guru.)
// `roti` dipakai saat guru menyembunyikan/menampilkan tanggapan. Sebelumnya
// tidak ikut diimpor, sehingga tombol Sembunyikan melempar ReferenceError —
// dan penangkap galatnya pun memanggil roti, jadi kegagalannya tidak
// tertangani sama sekali.
import { el, isi, roti, tanggalId } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilPenugasan } from '../lib/data-papan.js';
import { rangkumanSejawatGuru, daftarRefleksiPenugasan, daftarSikapKelas, promptRefleksiProgram, INDIKATOR_SIKAP, hasilDiagnostik, daftarTanggapanPameran, ubahSembunyiTanggapan, JENIS_TANGGAPAN } from '../lib/data-asesmen.js';
import { buatWidgetLembar } from '../lib/lembar-widget.js';
import { daftarKelompok } from '../lib/data-kelas.js';
import { rekapRotasi } from '../lib/rotasi-pameran.js';

export async function renderAsesmenGuru(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '', tab = 'sejawat';
  let penugasan = null, sejawat = [], refleksi = [], sikap = [], promptRefleksi = [];
  let diagnostik = { lembar: [], isian: [] };
  let galatDiagnostik = '';
  let tanggapan = [], kelompokKelas = [];

  async function muatSemua() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      sejawat = await rangkumanSejawatGuru(penugasanId);
      refleksi = await daftarRefleksiPenugasan(penugasanId);
      sikap = await daftarSikapKelas(penugasan.kelas_id);
      // Nama kelompok dibutuhkan agar rekap tanggapan tidak lagi menampilkan
      // potongan id yang tidak berarti apa pun bagi guru.
      kelompokKelas = await daftarKelompok(penugasan.kelas_id).catch(() => []);
      promptRefleksi = await promptRefleksiProgram(penugasan.tujuan_pembelajaran_id);
      // Galat sengaja DISIMPAN, bukan ditelan — tanpa ini, migrasi yang
      // belum dijalankan hanya membuat tab hilang tanpa penjelasan apa pun.
      try {
        diagnostik = await hasilDiagnostik(penugasanId, penugasan.tujuan_pembelajaran_id);
        tanggapan = await daftarTanggapanPameran(penugasanId).catch(() => []);
        galatDiagnostik = '';
      } catch (err) {
        diagnostik = { lembar: [], isian: [] };
        galatDiagnostik = pesanGalat(err);
      }
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  // ---------- Sejawat: rata-rata skor yang DITERIMA tiap murid ----------
  function gambarSejawat() {
    if (sejawat.length === 0) return el('div', { class: 'kartu-kosong' }, 'Belum ada penilaian sejawat yang masuk.');

    const perMurid = new Map();
    for (const s of sejawat) {
      const kunci = s.dinilai_id;
      if (!perMurid.has(kunci)) perMurid.set(kunci, { nama: s.dinilai?.nama || kunci, skor: [], komentar: [] });
      const entri = perMurid.get(kunci);
      const nilai = Object.values(s.skor || {}).map(Number).filter(n => !isNaN(n));
      if (nilai.length) entri.skor.push(nilai.reduce((a, b) => a + b, 0) / nilai.length);
      if (s.komentar) entri.komentar.push({ dari: s.penilai?.nama || 'Rekan', teks: s.komentar });
    }

    const baris = [...perMurid.values()]
      .map(m => ({ ...m, rata: m.skor.length ? m.skor.reduce((a, b) => a + b, 0) / m.skor.length : null }))
      .sort((a, b) => (b.rata ?? 0) - (a.rata ?? 0));

    return el('div', {}, [
      el('div', { class: 'panel-info', style: 'margin-bottom:16px;' },
        'Rata-rata skor (skala 1–5) yang DITERIMA tiap murid dari rekan sekelompoknya. Murid tidak bisa melihat halaman ini — gunakan sebagai bahan pertimbangan, bukan nilai mentah.'),
      el('div', { class: 'daftar-baris' }, baris.map(m => el('div', { class: 'kartu' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;' }, [
          el('span', { style: 'font-weight:700;' }, m.nama),
          el('span', { class: `nilai-kotak ${m.rata >= 4 ? 'nilai-hijau' : m.rata >= 3 ? 'nilai-kuning' : 'nilai-merah'}` },
            m.rata !== null ? m.rata.toFixed(1) + ' / 5' : '—')
        ]),
        el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:6px;' }, `${m.skor.length} penilaian diterima`),
        ...m.komentar.map(k => el('div', { style: 'font-size:13px;padding:6px 10px;background:var(--netral);border-radius:var(--radius-sm);margin-top:4px;' },
          `"${k.teks}" — ${k.dari}`))
      ])))
    ]);
  }

  // ---------- Refleksi ----------
  function gambarRefleksi() {
    if (refleksi.length === 0) return el('div', { class: 'kartu-kosong' }, 'Belum ada refleksi yang diisi murid.');
    return el('div', { class: 'daftar-baris' }, refleksi.map(r => el('div', { class: 'kartu' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;' }, [
        el('span', { style: 'font-weight:700;' }, r.profil?.nama || r.murid_id),
        el('span', { class: 'lencana' },
          r.sprint?.nomor ? `Tahap ${r.sprint.nomor}` : 'Seluruh Program')
      ]),
      ...promptRefleksi.map(p => r.jawaban?.[p.key]
        ? el('div', { style: 'margin-bottom:8px;' }, [
            el('div', { style: 'font-size:12px;font-weight:600;color:var(--abu-teks);' }, p.label),
            el('div', { style: 'font-size:13px;' }, r.jawaban[p.key])
          ])
        : null),
      el('div', { style: 'font-size:11px;color:var(--abu-teks-halus);' }, tanggalId(r.diubah_pada, true))
    ])));
  }

  // ---------- Observasi Sikap ----------
  function gambarSikap() {
    if (sikap.length === 0) return el('div', { class: 'kartu-kosong' }, 'Belum ada observasi sikap yang dicatat. Catat lewat tombol "Sikap" di roster kelas.');
    return el('div', { class: 'daftar-baris' }, sikap.map(s => el('div', { class: 'kartu' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;' }, [
        el('span', { style: 'font-weight:700;' }, s.profil?.nama || s.murid_id),
        el('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' }, [
          el('span', { class: 'lencana' },
            s.tujuan_pembelajaran
              ? (s.tujuan_pembelajaran.kode || s.tujuan_pembelajaran.judul)
              : 'Umum'),
          el('span', { style: 'font-size:11px;color:var(--abu-teks-halus);' }, tanggalId(s.dibuat_pada, true))
        ])
      ]),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;' },
        INDIKATOR_SIKAP.map(ind => el('span', { class: 'lencana' }, `${ind.label}: ${s.skor?.[ind.key] ?? '—'}`))),
      s.catatan ? el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, s.catatan) : null
    ])));
  }

  /** Hasil asesmen diagnostik per murid, dikelompokkan per lembar. */
  function gambarDiagnostik() {
    if (galatDiagnostik) {
      return el('div', {}, [
        el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;margin-bottom:12px;' },
          `Gagal memuat asesmen diagnostik: ${galatDiagnostik}`),
        el('div', { class: 'kartu-kosong' },
          'Bila pesan di atas menyebut kolom "diagnostik" tidak ditemukan, berarti migrasi 002900_asesmen_diagnostik.sql belum dijalankan di Supabase. Jalankan migrasi itu lalu muat ulang halaman ini.')
      ]);
    }
    if (diagnostik.lembar.length === 0) {
      return el('div', { class: 'kartu-kosong' },
        'Program ini belum punya lembar bertanda diagnostik. Buka Penyunting Program → tab Lembar Kerja → pilih lembarnya → atur "Peran Lembar Ini" menjadi Diagnostik Non-Kognitif atau Kognitif.');
    }
    return el('div', {}, diagnostik.lembar.map(l => {
      const isian = diagnostik.isian
        .filter(i => i.lembar_kerja_id === l.id)
        .sort((a, b) => (a.profil?.no_absen ?? 999) - (b.profil?.no_absen ?? 999));
      const selesai = isian.filter(i => i.selesai_pada).length;

      return el('div', { style: 'margin-bottom:20px;' }, [
        el('div', { class: 'judul-grup' }, [
          el('span', {}, `${l.kode} — ${l.judul}`),
          el('span', { class: 'lencana' },
            `${l.diagnostik === 'kognitif' ? 'Kognitif' : 'Non-Kognitif'} · ${selesai} selesai`)
        ]),
        isian.length === 0
          ? el('div', { class: 'kartu-kosong' }, 'Belum ada murid yang mengerjakan.')
          : el('div', {}, isian.map(i => el('details', { class: 'rujukan-sejawat' }, [
              el('summary', {}, [
                (i.profil?.no_absen ? `${i.profil.no_absen}. ` : '') +
                (i.profil?.nama || i.kelompok?.nama || 'Murid') +
                (i.selesai_pada ? '' : '  (belum ditandai selesai)')
              ].join('')),
              el('div', { style: 'margin-top:8px;' }, [
                buatWidgetLembar({
                  lembar: l, isian: i, bisaEdit: false, profil: null,
                  anggotaKelompok: [], tampilanGuru: true
                }).elemen
              ])
            ])))
      ]);
    }));
  }

  /** Papan tanggapan antar kelompok, dengan moderasi guru. */
  /** Rekap pelaksanaan rotasi: kelompok mana yang BELUM menanggapi
   *  sasarannya. Inilah yang tidak bisa dilihat guru sebelumnya — tanggapan
   *  yang masuk terlihat, tetapi yang tidak masuk tidak meninggalkan jejak. */
  function gambarRekapRotasi() {
    if (!penugasan?.tujuan_pembelajaran?.pameran_rotasi) return null;
    if (kelompokKelas.length < 2) {
      return el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
        'Rotasi tanggapan aktif, tetapi kelas ini belum punya dua kelompok.');
    }
    const rekap = rekapRotasi(kelompokKelas, tanggapan);
    const belum = rekap.filter(r => !r.sudah);
    return el('div', { class: 'kartu', style: 'padding:12px;margin-bottom:16px;' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;' }, [
        el('div', { style: 'font-weight:650;font-size:13px;' }, 'Pelaksanaan Rotasi'),
        el('span', {
          class: 'lencana',
          style: belum.length === 0 ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : ''
        }, belum.length === 0 ? 'Semua kelompok sudah menanggapi' : `${belum.length} kelompok belum menanggapi`)
      ]),
      el('div', { class: 'daftar-baris' }, rekap.map(r => el('div', { class: 'baris-item' }, [
        el('span', {
          class: 'lencana',
          style: r.sudah ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : ''
        }, r.sudah ? '✓' : '—'),
        el('div', { class: 'isi-utama' }, [
          el('div', { class: 'judul-baris' }, `${r.kelompok.nama} → ${r.sasaran?.nama || '(tidak ada sasaran)'}`),
          el('div', { class: 'meta-baris' }, r.sudah
            ? `${r.jumlah} tanggapan terkirim`
            : 'Belum mengirim tanggapan ke sasarannya')
        ])
      ])))
    ]);
  }

  function gambarPameran() {
    const namaKelompok = new Map(kelompokKelas.map(k => [k.id, k.nama]));
    if (tanggapan.length === 0) {
      return el('div', {}, [
        gambarRekapRotasi(),
        el('div', { class: 'kartu-kosong' },
          'Belum ada tanggapan. Pastikan Papan Tanggapan sudah diaktifkan di Penyunting Program → Edit Detail.')
      ]);
    }
    const perKelompok = new Map();
    for (const t of tanggapan) {
      const k = t.kelompok_tujuan;
      if (!perKelompok.has(k)) perKelompok.set(k, []);
      perKelompok.get(k).push(t);
    }
    return el('div', {}, [gambarRekapRotasi(), ...[...perKelompok.entries()].map(([kid, isi]) => el('div', { style: 'margin-bottom:18px;' }, [
      el('div', { class: 'judul-grup' }, [
        el('span', {}, `Tanggapan untuk ${namaKelompok.get(kid) || 'kelompok (sudah dihapus)'}`),
        el('span', { class: 'lencana' }, `${isi.filter(t => !t.disembunyikan).length} tampil`)
      ]),
      el('div', { class: 'daftar-baris' }, isi.map(t => el('div', { class: 'baris-item' + (t.disembunyikan ? ' baris-redup' : '') }, [
        el('span', { class: 'lencana' }, JENIS_TANGGAPAN.find(j => j.nilai === t.jenis)?.label || t.jenis),
        el('div', { class: 'isi-utama' }, [
          el('div', { style: 'font-size:13.5px;' }, t.isi),
          el('div', { class: 'meta-baris' },
            `${t.penulis?.nama || 'Murid'}${t.kelompok_asal?.nama ? ` · ${t.kelompok_asal.nama}` : ''} · ${tanggalId(t.dibuat_pada, true)}` +
            (t.disembunyikan ? ' · disembunyikan' : ''))
        ]),
        el('button', {
          class: 'tombol tombol-hantu tombol-kecil',
          onclick: async () => {
            try {
              await ubahSembunyiTanggapan(t.id, !t.disembunyikan, profil.id);
              t.disembunyikan = !t.disembunyikan;
              roti(t.disembunyikan ? 'Tanggapan disembunyikan.' : 'Tanggapan ditampilkan.', 'sukses');
              render();
            } catch (err) { roti(pesanGalat(err), 'galat'); }
          }
        }, t.disembunyikan ? 'Tampilkan' : 'Sembunyikan')
      ])))
    ]))]);
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
              gambarTabTombol('diagnostik',
                diagnostik.lembar.length > 0 ? `Diagnostik (${diagnostik.lembar.length})` : 'Diagnostik'),
              gambarTabTombol('pameran', `Pameran (${tanggapan.length})`),
              gambarTabTombol('sejawat', 'Nilai Sejawat'),
              gambarTabTombol('refleksi', `Refleksi (${refleksi.length})`),
              gambarTabTombol('sikap', `Observasi Sikap (${sikap.length})`)
            ]),
            tab === 'diagnostik' ? gambarDiagnostik() :
            tab === 'pameran' ? gambarPameran() :
            tab === 'sejawat' ? gambarSejawat() : tab === 'refleksi' ? gambarRefleksi() : gambarSikap()
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Asesmen Non-Tes', sub: penugasan?.tujuan_pembelajaran?.judul, onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: '#/guru/kelas' }, '← Kelas')]),
        konten
      ]
    }));
  }

  render();
  await muatSemua();
}
