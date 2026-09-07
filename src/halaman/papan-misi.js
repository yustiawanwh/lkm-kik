// src/halaman/papan-misi.js — Papan Misi murid: kanban per tugas, timer
// dengan penyimpanan andal (autosave berkala + saat jeda/tutup/tab disembunyikan).
import { el, isi, roti, dialog, konfirmasi, tanggalId } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { teksKeHtml } from '../lib/teks.js';
import { navigasi } from '../lib/rute.js';
import {
  ambilPenugasan, ambilStrukturProgram, ambilKelompokSaya,
  ambilProgresPenugasan, ambilAtauBuatProgres, ubahStatusProgres, simpanDetikTerpakai
} from '../lib/data-papan.js';
import { daftarLembarProgram, ambilAtauBuatIsian, anggotaKelompokLembar } from '../lib/data-lembar.js';
import { LABEL_TIPE_LEMBAR } from '../lib/data-kurikulum.js';
import { buatWidgetLembar } from '../lib/lembar-widget.js';
import { daftarLampiran, tambahLampiran, hapusLampiran } from '../lib/data-lampiran.js';
import {
  daftarTemanSekelompok, ambilPenilaianSejawatSaya, simpanPenilaianSejawat,
  ambilRefleksi, simpanRefleksi, promptRefleksiProgram, refleksiPerTahap
} from '../lib/data-asesmen.js';
import { ambilKendaliSaya } from '../lib/data-kelas.js';
import { pantauKendali } from '../lib/realtime-kendali.js';
import { ambilRubrikProgram } from '../lib/data-nilai.js';
import { pasangSeret, baruSajaDiseret } from '../lib/seret.js';
import { state } from '../main.js';

const KOLOM = [
  { kunci: 'backlog', label: 'Belum Dikerjakan' },
  { kunci: 'dikerjakan', label: 'Dikerjakan' },
  { kunci: 'review', label: 'Menunggu Penilaian' },
  { kunci: 'selesai', label: 'Selesai' }
];

/** Perpindahan status yang boleh dilakukan MURID dengan menyeret kartu.
 *  'selesai' sengaja tidak ada di mana pun: status itu hanya sah bila
 *  ditetapkan guru lewat penilaian (dikunci juga di database, migrasi 001600). */
const PINDAH_BOLEH = {
  backlog: ['dikerjakan', 'review'],
  dikerjakan: ['backlog', 'review'],
  review: ['backlog', 'dikerjakan'],
  selesai: []
};

const WARNA_HURUF = { A: 'nilai-hijau', B: 'nilai-hijau', C: 'nilai-kuning', D: 'nilai-kuning', E: 'nilai-merah' };

const JEDA_SIMPAN_MS = 15000; // simpan detik_terpakai tiap 15 detik saat timer jalan

export async function renderPapanMisi(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let penugasan = null, sprints = [], kelompokSaya = null, progresMap = new Map(); // tugasId -> progres row
  let lembarList = [];
  let lembarLepas = [];
  let kendali = 'aktif';
  let petunjukTerbuka = false;
  let promptRefleksi = [];
  let rubrikProgram = null;
  let modeRefleksiPerTahap = false;
  let lepasKendali = null;
  let tab = 'misi'; // 'misi' | 'lembar' | 'sejawat' | 'refleksi'
  let sprintTerbukaSejawat = new Set();
  let sprintTerbukaRefleksi = new Set();

  async function muatSemua() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      sprints = await ambilStrukturProgram(penugasan.tujuan_pembelajaran_id);
      kelompokSaya = await ambilKelompokSaya(penugasan.kelas_id, profil.id);
      const progresRows = await ambilProgresPenugasan(penugasanId, profil.id, kelompokSaya?.id);
      progresMap = new Map(progresRows.map(p => [p.tugas_id, p]));
      lembarList = await daftarLembarProgram(penugasan.tujuan_pembelajaran_id);
      // Lembar yang sudah ditautkan ke misi dikerjakan DI DALAM misi.
      // Tab ini hanya untuk lembar lepas, supaya tidak jadi pintu kedua
      // yang menembus kunci timer.
      const kodeTertaut = new Set(
        sprints.flatMap(sp => sp.tugas).flatMap(t =>
          (t.lembar_kode || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean))
      );
      lembarLepas = lembarList.filter(l => !kodeTertaut.has(l.kode.toLowerCase()));
      promptRefleksi = await promptRefleksiProgram(penugasan.tujuan_pembelajaran_id);
      modeRefleksiPerTahap = await refleksiPerTahap(penugasan.tujuan_pembelajaran_id);
      rubrikProgram = await ambilRubrikProgram(penugasan.tujuan_pembelajaran_id);

      const kendaliRow = await ambilKendaliSaya(penugasan.kelas_id, profil.id);
      kendali = kendaliRow?.kendali || 'aktif';
      lepasKendali = pantauKendali(profil.id, (kendaliBaru, kelasId) => {
        if (kelasId === penugasan.kelas_id) { kendali = kendaliBaru; render(); }
      });
      state.pembersihHalaman = () => { lepasKendali?.(); lepasKendali = null; };
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  function semuaTugas() {
    return sprints.flatMap(s => s.tugas.map(t => ({ ...t, sprintNama: s.nama, sprintNomor: s.nomor })));
  }

  function statusTugas(t) {
    return progresMap.get(t.id)?.status || 'backlog';
  }

  function lembarTertaut(t) {
    if (!t.lembar_kode) return [];
    const kodeList = t.lembar_kode.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    return lembarList.filter(l => kodeList.includes(l.kode.toLowerCase()));
  }

  // ============ Dialog detail misi + timer ============
  function bukaDetailMisi(t) {
    let progres = progresMap.get(t.id) || null;
    let detikBerjalan = progres?.detik_terpakai || 0;
    let waktuMulaiLokal = null; // Date.now() saat timer aktif berjalan
    let intervalId = null;
    let simpanIntervalId = null;
    let lampiranList = [];
    let mengunggah = false;
    const widgetLembar = [];   // simpan agar kanal realtimenya bisa dilepas

    const elWaktu = el('span', { style: 'font-variant-numeric:tabular-nums;font-weight:700;font-size:20px;' }, formatDetik(detikBerjalan));
    const elStatus = el('span', { class: 'lencana' }, labelStatus(statusTugas(t)));
    const areaLembar = el('div', { style: 'margin-top:16px;' });
    const areaBukti = el('div', { style: 'margin-top:16px;' });

    function detikTotal() {
      return detikBerjalan + (waktuMulaiLokal ? Math.floor((Date.now() - waktuMulaiLokal) / 1000) : 0);
    }

    async function simpanSekarang() {
      if (!progres) return;
      try { await simpanDetikTerpakai(progres.id, detikTotal()); } catch { /* jangan ganggu UX kalau gagal sesaat */ }
    }

    async function gambarUlangLembar() {
      const daftar = lembarTertaut(t);
      if (daftar.length === 0) { isi(areaLembar, []); return; }
      const bisaEdit = !!waktuMulaiLokal;
      if (!progres) {
        // Belum ada progres (timer belum pernah dijalankan) — tampilkan terkunci tanpa memuat isian.
        isi(areaLembar, daftar.map(l => el('div', { class: 'kartu', style: 'padding:12px;margin-top:10px;background:var(--netral);' }, [
          el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
            el('span', { style: 'font-weight:600;font-size:13px;' }, `${l.judul}`),
            el('span', { class: 'lencana', style: 'background:var(--kuning-lembut);color:#974F00;' }, 'Jalankan timer untuk mengisi')
          ])
        ])));
        return;
      }
      // Lepas kanal widget sebelumnya sebelum menggambar ulang.
      while (widgetLembar.length) widgetLembar.pop().lepas();
      const potongan = [];
      for (const l of daftar) {
        try {
          const isian = await ambilAtauBuatIsian({
            lembarKerjaId: l.id, penugasanId,
            milikKelompok: l.milik_kelompok, muridId: profil.id, kelompokId: kelompokSaya?.id
          });
          const widget = buatWidgetLembar({
            lembar: l, isian, bisaEdit, profil,
            anggotaKelompok: kelompokSaya ? await anggotaKelompokLembar(kelompokSaya.id) : [],
            realtime: bisaEdit,   // kolaborasi menyala selagi lembar bisa diisi
            onSimpanGagal: (err) => roti(pesanGalat(err), 'galat')
          });
          widgetLembar.push(widget);
          potongan.push(el('div', { class: 'kartu', style: 'padding:12px;margin-top:10px;' }, widget.elemen));
        } catch (err) {
          potongan.push(el('div', { class: 'panel-info', style: 'margin-top:10px;background:var(--merah-lembut);color:var(--merah);' }, pesanGalat(err)));
        }
      }
      isi(areaLembar, potongan);
    }

    async function gambarUlangBukti() {
      const bisaEdit = !!waktuMulaiLokal;
      isi(areaBukti, [
        el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:8px;' }, 'Bukti Karya'),
        lampiranList.length === 0
          ? el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:8px;' }, 'Belum ada bukti diunggah.')
          : el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;' }, lampiranList.map(la => el('div', {
              style: 'position:relative;width:72px;height:72px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--garis);background:var(--netral);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--abu-teks);text-align:center;'
            }, [
              la.mime?.startsWith('image/') ? '️' : '',
              bisaEdit ? el('button', {
                onclick: async () => {
                  try { await hapusLampiran(la); lampiranList = lampiranList.filter(x => x.id !== la.id); gambarUlangBukti(); }
                  catch (err) { roti(pesanGalat(err), 'galat'); }
                },
                style: 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;'
              }, ikon('tutup', 14)) : null
            ]))),
        bisaEdit ? el('div', {}, [
          el('input', {
            type: 'file', accept: 'image/*,.pdf', multiple: true,
            disabled: mengunggah,
            onchange: async (e) => {
              const files = [...e.target.files];
              if (files.length === 0) return;
              mengunggah = true; gambarUlangBukti();
              for (const file of files) {
                try {
                  const baru = await tambahLampiran({ progresTugasId: progres.id, file, muridId: profil.id, kelompokId: t.sifat_kerja === 'kelompok' ? kelompokSaya?.id : null });
                  lampiranList.push(baru);
                } catch (err) { roti(pesanGalat(err), 'galat'); }
              }
              mengunggah = false;
              e.target.value = '';
              gambarUlangBukti();
            }
          })
        ]) : el('span', { class: 'lencana', style: 'background:var(--kuning-lembut);color:#974F00;' }, 'Jalankan timer untuk unggah bukti')
      ]);
    }

    async function mulaiTimer() {
      if (kendali !== 'aktif') {
        roti(kendali === 'dikunci' ? 'Akses Anda sedang dikunci oleh guru.' : 'Akses Anda sedang dijeda oleh guru — tidak bisa memulai misi baru.', 'galat');
        return;
      }
      if (!progres) {
        try {
          progres = await ambilAtauBuatProgres({ penugasanId, tugas: t, muridId: profil.id, kelompokId: kelompokSaya?.id });
          progresMap.set(t.id, progres);
          detikBerjalan = progres.detik_terpakai || 0;
          lampiranList = await daftarLampiran(progres.id);
        } catch (err) { roti(pesanGalat(err), 'galat'); return; }
      }
      if (progres.status === 'backlog') {
        try {
          progres = await ubahStatusProgres(progres.id, 'dikerjakan');
          progresMap.set(t.id, progres);
          elStatus.textContent = labelStatus('dikerjakan');
        } catch (err) { roti(pesanGalat(err), 'galat'); }
      }
      waktuMulaiLokal = Date.now();
      intervalId = setInterval(() => { elWaktu.textContent = formatDetik(detikTotal()); }, 1000);
      simpanIntervalId = setInterval(simpanSekarang, JEDA_SIMPAN_MS);
      render(); // re-render papan di belakang agar status/lencana ikut update
      gambarUlangAksi();
      gambarUlangLembar();
      gambarUlangBukti();
    }

    async function jedaTimer() {
      if (waktuMulaiLokal) {
        detikBerjalan = detikTotal();
        waktuMulaiLokal = null;
      }
      clearInterval(intervalId); clearInterval(simpanIntervalId);
      intervalId = null; simpanIntervalId = null;
      await simpanSekarang();
      gambarUlangAksi();
      gambarUlangLembar();
      gambarUlangBukti();
    }

    async function tandaiSelesai() {
      // Konfirmasi wajib: penyerahan mengunci pekerjaan, dan salah tekan
      // hanya bisa dipulihkan lewat pengembalian oleh guru.
      const ok = await konfirmasi(
        `Serahkan misi "${t.kode} — ${t.judul}" untuk dinilai? ` +
        'Setelah diserahkan, Anda tidak bisa mengubah jawabannya lagi kecuali guru mengembalikannya.',
        { labelYa: 'Ya, Serahkan', labelTidak: 'Belum, Periksa Lagi' });
      if (!ok) return;

      await jedaTimer();
      if (!progres) return;
      try {
        progres = await ubahStatusProgres(progres.id, 'review');
        progresMap.set(t.id, progres);
        elStatus.textContent = labelStatus('review');
        roti('Misi diserahkan untuk dinilai guru.', 'sukses');
        gambarUlangAksi();
        render();
      } catch (err) { roti(pesanGalat(err), 'galat'); }
    }

    const areaAksi = el('div', { class: 'aksi-misi' });
    const areaNilai = el('div', {});
    function gambarUlangAksi() {
      const sedangJalan = !!waktuMulaiLokal;
      const sudahDinilai = progres?.status === 'selesai';
      const sudahSelesai = progres?.status === 'review' || sudahDinilai;
      isi(areaAksi, [
        // Kelompok tombol kerja sehari-hari di kiri.
        el('div', { class: 'aksi-misi-kiri' }, [
          !sudahSelesai ? el('button', {
            class: 'tombol tombol-primer',
            onclick: sedangJalan ? jedaTimer : mulaiTimer
          }, sedangJalan ? ikonTeks('jeda', 'Jeda') : ikonTeks('mulai', 'Mulai Mengerjakan')) : null
        ]),
        // Serahkan sengaja dipisah jauh ke kanan dan diberi warna
        // peringatan: sekali diserahkan, murid tidak bisa mengubahnya lagi.
        !sudahSelesai ? el('div', { class: 'aksi-misi-kanan' }, [
          el('button', { class: 'tombol tombol-bahaya', onclick: tandaiSelesai }, 'Serahkan'),
          el('span', { class: 'catatan-serahkan' }, 'Tidak bisa diubah lagi')
        ]) : null,
        (sudahSelesai && !sudahDinilai)
          ? el('span', { class: 'panel-info', style: 'flex:1;' }, 'Misi ini sudah diserahkan, menunggu dinilai guru.')
          : null
      ]);
      isi(areaNilai, sudahDinilai ? [
        el('div', { class: 'kartu', style: 'margin-top:12px;background:var(--netral);' }, [
          el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;' }, [
            el('span', { class: `nilai-kotak ${WARNA_HURUF[progres.nilai_huruf] || 'nilai-kuning'}` }, progres.nilai_huruf || '—'),
            progres.nilai_angka !== null && progres.nilai_angka !== undefined
              ? el('span', { style: 'font-size:20px;font-weight:700;' }, String(progres.nilai_angka))
              : null,
            el('span', { class: 'lencana' }, `${progres.xp_diberikan} XP`),
            progres.kena_penalti_susulan ? el('span', { class: 'lencana lencana-susulan' }, 'Kena penalti susulan') : null
          ]),
          progres.umpan_balik
            ? el('div', { style: 'margin-bottom:8px;' }, [
                el('div', { style: 'font-size:12px;font-weight:600;color:var(--abu-teks);' }, 'Umpan balik guru'),
                el('p', { style: 'font-size:13.5px;margin:2px 0 0;' }, progres.umpan_balik)
              ])
            : null,
          gambarRincianRubrik(progres)
        ])
      ] : []);
    }
    gambarUlangAksi();
    if (progres) { daftarLampiran(progres.id).then(l => { lampiranList = l; gambarUlangBukti(); }); }
    gambarUlangLembar();
    gambarUlangBukti();

    const { tutup: tutupAsli, kotak } = dialog({
      judul: `${t.kode} — ${t.judul}`,
      bisaTutup: true,
      isi: el('div', {}, [
        el('div', { style: 'display:flex;gap:8px;margin-bottom:12px;' }, [
          elStatus,
          el('span', { class: t.sifat_kerja === 'kelompok' ? 'lencana lencana-tim' : 'lencana lencana-mandiri' },
            t.sifat_kerja === 'kelompok' ? 'Kelompok' : 'Mandiri'),
          el('span', { class: 'lencana' }, `${t.xp} XP`)
        ]),
        t.deskripsi ? el('div', { html: teksKeHtml(t.deskripsi) }) : el('p', { style: 'color:var(--abu-teks);' }, 'Tidak ada deskripsi tambahan.'),
        el('div', { style: 'margin-top:16px;padding:14px;background:var(--biru-kabut);border-radius:var(--radius);display:flex;align-items:center;justify-content:space-between;' }, [
          el('span', { style: 'color:var(--abu-teks);font-size:13px;' }, 'Waktu dikerjakan'),
          elWaktu
        ]),
        areaAksi,
        areaNilai,
        areaLembar,
        areaBukti
      ])
    });

    // Tutup dialog → hentikan timer & simpan andal (jangan biarkan waktu hilang).
    function tutupDenganSimpan() {
      if (waktuMulaiLokal) { jedaTimer(); }
      while (widgetLembar.length) widgetLembar.pop().lepas();
      tutupAsli();
    }
    kotak.parentElement.addEventListener('click', (e) => { if (e.target === kotak.parentElement) tutupDenganSimpan(); }, { once: true });

    // Simpan andal juga saat tab disembunyikan / sebelum unload.
    const simpanSaatSembunyi = () => { if (document.hidden) simpanSekarang(); };
    const simpanSaatUnload = () => { simpanSekarang(); };
    document.addEventListener('visibilitychange', simpanSaatSembunyi);
    window.addEventListener('beforeunload', simpanSaatUnload);
  }

  function labelStatus(s) {
    return { backlog: 'Belum Dikerjakan', dikerjakan: 'Dikerjakan', review: 'Menunggu Penilaian', selesai: 'Selesai' }[s] || s;
  }

  function formatDetik(total) {
    const j = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), d = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return j > 0 ? `${j}:${pad(m)}:${pad(d)}` : `${pad(m)}:${pad(d)}`;
  }

  function kartuMisi(t) {
    const s = statusTugas(t);
    const progres = progresMap.get(t.id);
    const kartu = el('div', {
      class: 'kartu kartu-interaktif kartu-misi', style: 'padding:12px;margin-bottom:10px;',
      onclick: () => { if (!baruSajaDiseret(kartu)) bukaDetailMisi(t); }
    }, [
      el('div', { style: 'font-size:12px;color:var(--abu-teks-halus);margin-bottom:4px;' }, `Tahap ${t.sprintNomor} · ${t.sprintNama}`),
      el('div', { style: 'font-weight:600;margin-bottom:6px;' }, `${t.kode} — ${t.judul}`),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, [
        el('span', { class: t.sifat_kerja === 'kelompok' ? 'lencana lencana-tim' : 'lencana lencana-mandiri' },
          t.sifat_kerja === 'kelompok' ? 'Kelompok' : 'Mandiri'),
        progres?.nilai_huruf
          ? el('span', { class: `nilai-kotak ${WARNA_HURUF[progres.nilai_huruf] || 'nilai-kuning'}`, style: 'padding:1px 8px;font-size:12px;' }, progres.nilai_huruf)
          : el('span', { class: 'lencana' }, `${t.xp} XP`)
      ]),
      progres?.catatan_kembali
        ? el('div', { class: 'tanda-dikembalikan' }, [
            ikon('peringatan', 13),
            el('span', {}, 'Dikembalikan guru')
          ])
        : null
    ]);

    pasangSeret({
      kartu,
      bolehSeret: () => {
        if (kendali !== 'aktif') {
          roti(kendali === 'dikunci'
            ? 'Akses Anda sedang dikunci oleh guru.'
            : 'Akses Anda sedang dijeda oleh guru.', 'galat');
          return false;
        }
        if (s === 'selesai') {
          roti('Misi yang sudah dinilai tidak bisa dipindahkan lagi.', 'info');
          return false;
        }
        return true;
      },
      ambilZona: () => Array.from(document.querySelectorAll('[data-zona]')),
      zonaSah: (zona) => (PINDAH_BOLEH[s] || []).includes(zona.dataset.zona),
      onJatuh: (zona) => pindahkanStatus(t, zona.dataset.zona)
    });

    return kartu;
  }

  /** Terapkan perpindahan status hasil seret. */
  async function pindahkanStatus(t, statusBaru) {
    const lama = statusTugas(t);
    if (lama === statusBaru) return;

    let progres = progresMap.get(t.id);
    try {
      if (!progres) {
        progres = await ambilAtauBuatProgres({
          penugasanId, tugas: t, muridId: profil.id, kelompokId: kelompokSaya?.id
        });
        progresMap.set(t.id, progres);
      }
      // Perbarui tampilan lebih dulu agar kartu langsung pindah kolom,
      // lalu kembalikan bila server menolak (mis. tenggat sudah lewat).
      const sebelum = { ...progres };
      progresMap.set(t.id, { ...progres, status: statusBaru });
      render();

      try {
        const hasil = await ubahStatusProgres(progres.id, statusBaru);
        progresMap.set(t.id, hasil);
        if (statusBaru === 'review') roti('Misi diserahkan untuk dinilai guru.', 'sukses');
        render();
      } catch (err) {
        progresMap.set(t.id, sebelum);
        render();
        roti(pesanGalat(err), 'galat');
      }
    } catch (err) {
      roti(pesanGalat(err), 'galat');
    }
  }

  function gambarTabMisi() {
    const tugasList = semuaTugas();
    if (tugasList.length === 0) return el('div', { class: 'kartu-kosong' }, 'Program ini belum memiliki misi.');
    return el('div', {}, [
      el('div', { class: 'petunjuk-seret' }, [
        ikon('papan', 14),
        el('span', {}, 'Seret kartu untuk memindahkan status. Di HP, tahan kartu sejenak dulu. Kolom "Selesai" hanya bisa diisi guru lewat penilaian.')
      ]),
      el('div', { class: 'papan-kanban' },
        KOLOM.map(k => {
          const isiKolom = tugasList.filter(t => statusTugas(t) === k.kunci);
          return el('div', {
            class: 'kolom-kanban',
            // Kolom "selesai" sengaja TIDAK diberi data-zona: murid tidak
            // boleh menjatuhkan kartu ke sana (lihat migrasi 001600).
            ...(k.kunci === 'selesai' ? {} : { 'data-zona': k.kunci })
          }, [
            el('div', { class: 'kolom-kanban-judul' }, [
              el('span', {}, k.label),
              el('span', { class: 'jumlah-kolom' }, String(isiKolom.length))
            ]),
            el('div', { class: 'kolom-isi' },
              isiKolom.length === 0
                ? [el('div', { style: 'font-size:12px;color:var(--abu-teks-halus);padding:8px 4px;' }, '—')]
                : isiKolom.map(kartuMisi))
          ]);
        })
      )
    ]);
  }

  function gambarTabLembar() {
    if (lembarLepas.length === 0) {
      return el('div', { class: 'kartu-kosong' },
        'Semua lembar kerja program ini dikerjakan di dalam misi. Buka tab Misi, pilih misinya, lalu tekan Mulai Mengerjakan.');
    }
    return el('div', { class: 'grid-kartu' }, lembarLepas.map(l => el('div', {
      class: 'kartu kartu-interaktif',
      onclick: () => navigasi(`#/murid/lembar/${penugasanId}/${l.id}`)
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;' }, [
        el('h3', {}, l.judul),
        el('span', { class: 'lencana' }, LABEL_TIPE_LEMBAR[l.tipe] || l.tipe)
      ]),
      l.keterangan ? el('p', { style: 'font-size:13px;color:var(--abu-teks);margin:0 0 10px;' }, l.keterangan) : null,
      el('span', { class: l.milik_kelompok ? 'lencana lencana-tim' : 'lencana lencana-mandiri' },
        l.milik_kelompok ? 'Berkelompok' : 'Individu')
    ])));
  }

  // ============ Tab Sejawat (Penilaian Rekan) ============
  function gambarTabSejawat() {
    if (!kelompokSaya) return el('div', { class: 'kartu-kosong' }, 'Penilaian sejawat hanya berlaku untuk misi berkelompok — Anda belum tergabung di kelompok manapun.');
    if (sprints.length === 0) return el('div', { class: 'kartu-kosong' }, 'Belum ada tahap pada program ini.');
    return el('div', { class: 'daftar-baris' }, sprints.map(gambarSprintSejawat));
  }

  function gambarSprintSejawat(s) {
    const terbuka = sprintTerbukaSejawat.has(s.id);
    return el('div', { class: 'kartu', style: 'padding:0;overflow:hidden;' }, [
      el('div', {
        class: 'baris-item', style: 'border:none;border-radius:0;cursor:pointer;',
        onclick: () => { terbuka ? sprintTerbukaSejawat.delete(s.id) : sprintTerbukaSejawat.add(s.id); render(); }
      }, [
        el('span', { class: 'pil-tahap' }, String(s.nomor)),
        el('div', { class: 'isi-utama' }, [el('div', { class: 'judul-baris' }, s.nama)]),
        el('span', { style: 'color:var(--abu-teks-halus);' }, terbuka ? '▾' : '▸')
      ]),
      terbuka ? el('div', { style: 'padding:12px 16px 16px;border-top:1px solid var(--garis-halus);background:var(--netral);' },
        el('div', { id: `sejawat-isi-${s.id}` }, 'Memuat…')) : null
    ]);
  }

  async function muatFormSejawat(s) {
    const wadah = document.getElementById(`sejawat-isi-${s.id}`);
    if (!wadah) return;
    try {
      const teman = await daftarTemanSekelompok(kelompokSaya.id, profil.id);
      const sudahDinilai = await ambilPenilaianSejawatSaya(penugasanId, s.id, profil.id);
      const petaSudah = new Map(sudahDinilai.map(x => [x.dinilai_id, x]));
      if (teman.length === 0) {
        isi(wadah, [el('div', { style: 'color:var(--abu-teks);font-size:13px;' }, 'Belum ada anggota lain di kelompokmu.')]);
        return;
      }
      isi(wadah, teman.map(t => {
        const ada = petaSudah.get(t.murid_id);
        const idKerjasama = `sj-${s.id}-${t.murid_id}-kerjasama`;
        const idKontribusi = `sj-${s.id}-${t.murid_id}-kontribusi`;
        const idKomunikasi = `sj-${s.id}-${t.murid_id}-komunikasi`;
        const idKomentar = `sj-${s.id}-${t.murid_id}-komentar`;
        return el('div', { class: 'kartu', style: 'margin-bottom:10px;' }, [
          el('div', { style: 'font-weight:600;margin-bottom:8px;' }, t.profil?.nama || t.murid_id),
          el('div', { class: 'baris-medan' }, [
            medanSkor('Kerja Sama', idKerjasama, ada?.skor?.kerjasama),
            medanSkor('Kontribusi', idKontribusi, ada?.skor?.kontribusi),
            medanSkor('Komunikasi', idKomunikasi, ada?.skor?.komunikasi)
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Komentar (opsional)'),
            el('textarea', { id: idKomentar, style: 'min-height:50px;' }, ada?.komentar || '')
          ]),
          el('button', {
            class: 'tombol tombol-primer tombol-kecil',
            onclick: async () => {
              const skor = {
                kerjasama: Number(document.getElementById(idKerjasama).value) || 3,
                kontribusi: Number(document.getElementById(idKontribusi).value) || 3,
                komunikasi: Number(document.getElementById(idKomunikasi).value) || 3
              };
              const komentar = document.getElementById(idKomentar).value.trim();
              try {
                await simpanPenilaianSejawat({
                  penugasanId, sprintId: s.id, kelompokId: kelompokSaya.id,
                  penilaiId: profil.id, dinilaiId: t.murid_id, skor, komentar
                });
                roti('Penilaian tersimpan.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, ada ? 'Perbarui' : 'Simpan')
        ]);
      }));
    } catch (err) {
      isi(wadah, [el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, pesanGalat(err))]);
    }
  }

  function medanSkor(label, id, nilaiAwal) {
    return el('div', { class: 'medan' }, [
      el('label', {}, label),
      el('select', { id }, [1, 2, 3, 4, 5].map(n => el('option', { value: n, selected: (nilaiAwal ?? 3) === n }, String(n))))
    ]);
  }

  // ============ Tab Refleksi ============
  function gambarTabRefleksi() {
    // Bawaan: SATU refleksi untuk seluruh program. Pertanyaan refleksi
    // bersifat retrospektif atas keseluruhan proses, jadi mengulangnya di
    // tiap tahap hanya mendorong murid menyalin jawabannya sendiri.
    if (!modeRefleksiPerTahap) {
      return el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
          'Isi refleksi ini setelah seluruh tahap selesai. Jawaban tersimpan otomatis saat Anda menekan Simpan, dan boleh diperbarui kapan saja.'),
        el('div', { class: 'kartu', id: 'refleksi-program' }, 'Memuat…')
      ]);
    }
    if (sprints.length === 0) return el('div', { class: 'kartu-kosong' }, 'Belum ada tahap pada program ini.');
    return el('div', { class: 'daftar-baris' }, sprints.map(gambarSprintRefleksi));
  }

  function gambarSprintRefleksi(s) {
    const terbuka = sprintTerbukaRefleksi.has(s.id);
    return el('div', { class: 'kartu', style: 'padding:0;overflow:hidden;' }, [
      el('div', {
        class: 'baris-item', style: 'border:none;border-radius:0;cursor:pointer;',
        onclick: () => { terbuka ? sprintTerbukaRefleksi.delete(s.id) : sprintTerbukaRefleksi.add(s.id); render(); }
      }, [
        el('span', { class: 'pil-tahap' }, String(s.nomor)),
        el('div', { class: 'isi-utama' }, [el('div', { class: 'judul-baris' }, s.nama)]),
        el('span', { style: 'color:var(--abu-teks-halus);' }, terbuka ? '▾' : '▸')
      ]),
      terbuka ? el('div', { style: 'padding:12px 16px 16px;border-top:1px solid var(--garis-halus);background:var(--netral);' },
        el('div', { id: `refleksi-isi-${s.id}` }, 'Memuat…')) : null
    ]);
  }

  /** Formulir refleksi tingkat program (sprintId = null). */
  async function muatFormRefleksiProgram() {
    const wadah = document.getElementById('refleksi-program');
    if (!wadah) return;
    try {
      const ada = await ambilRefleksi(penugasanId, null, profil.id);
      const jawaban = ada?.jawaban || {};
      isi(wadah, [
        ...promptRefleksi.map(p => el('div', { class: 'medan' }, [
          el('label', {}, p.label),
          el('textarea', { id: `refprog-${p.key}` }, jawaban[p.key] || '')
        ])),
        el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const jawabanBaru = {};
              for (const p of promptRefleksi) {
                jawabanBaru[p.key] = document.getElementById(`refprog-${p.key}`).value.trim();
              }
              try {
                await simpanRefleksi(penugasanId, null, profil.id, jawabanBaru);
                roti('Refleksi tersimpan.', 'sukses');
                muatFormRefleksiProgram();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, ada ? 'Perbarui Refleksi' : 'Simpan Refleksi'),
          ada ? el('span', { style: 'font-size:12px;color:var(--abu-teks);' },
            `Terakhir disimpan ${tanggalId(ada.diubah_pada, true)}`) : null
        ])
      ]);
    } catch (err) {
      isi(wadah, [el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, pesanGalat(err))]);
    }
  }

  async function muatFormRefleksi(s) {
    const wadah = document.getElementById(`refleksi-isi-${s.id}`);
    if (!wadah) return;
    try {
      const ada = await ambilRefleksi(penugasanId, s.id, profil.id);
      const jawaban = ada?.jawaban || {};
      isi(wadah, [
        ...promptRefleksi.map(p => el('div', { class: 'medan' }, [
          el('label', {}, p.label),
          el('textarea', { id: `ref-${s.id}-${p.key}` }, jawaban[p.key] || '')
        ])),
        el('button', {
          class: 'tombol tombol-primer tombol-kecil',
          onclick: async () => {
            const jawabanBaru = {};
            for (const p of promptRefleksi) jawabanBaru[p.key] = document.getElementById(`ref-${s.id}-${p.key}`).value.trim();
            try { await simpanRefleksi(penugasanId, s.id, profil.id, jawabanBaru); roti('Refleksi tersimpan.', 'sukses'); }
            catch (err) { roti(pesanGalat(err), 'galat'); }
          }
        }, ada ? 'Perbarui Refleksi' : 'Simpan Refleksi')
      ]);
    } catch (err) {
      isi(wadah, [el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, pesanGalat(err))]);
    }
  }

  /** Rincian penilaian per kriteria untuk murid.
   *
   *  Nilai huruf saja tidak memberi tahu apa yang perlu diperbaiki. Dengan
   *  menampilkan level tiap kriteria beserta bunyi deskripsinya, murid tahu
   *  persis di bagian mana ia sudah kuat dan di mana masih kurang. */
  function gambarRincianRubrik(progres) {
    const rincian = progres?.nilai_rubrik;
    if (!rincian || !rubrikProgram?.kriteria?.length) return null;

    const maks = rubrikProgram.skor_maks || 4;
    const dipakai = rubrikProgram.kriteria.filter(k => rincian[k.nama] !== undefined);
    if (dipakai.length === 0) return null;

    return el('details', { class: 'rincian-nilai' }, [
      el('summary', {}, `Rincian penilaian (${dipakai.length} kriteria)`),
      el('div', { style: 'margin-top:8px;display:flex;flex-direction:column;gap:8px;' },
        dipakai.map(k => {
          const skor = Number(rincian[k.nama]);
          const persen = Math.round((skor / maks) * 100);
          const warna = persen >= 85 ? 'var(--hijau)' : persen >= 60 ? 'var(--kuning)' : 'var(--merah)';
          return el('div', { class: 'baris-kriteria' }, [
            el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:baseline;' }, [
              el('span', { style: 'font-weight:600;font-size:13px;' }, k.nama),
              el('span', { style: `font-weight:700;font-size:13px;color:${warna};flex-shrink:0;` }, `${skor} / ${maks}`)
            ]),
            k.level?.[skor]
              ? el('div', { style: 'font-size:12.5px;color:var(--abu-teks);margin-top:2px;' }, k.level[skor])
              : null,
            // Tunjukkan apa yang perlu dicapai untuk naik satu tingkat.
            (skor < maks && k.level?.[skor + 1])
              ? el('div', { class: 'target-berikut' }, `Untuk ${skor + 1}: ${k.level[skor + 1]}`)
              : null
          ]);
        }))
    ]);
  }

  function gambarRingkasProgres() {
    const semua = semuaTugas();
    if (semua.length === 0) return null;
    const selesai = semua.filter(t => statusTugas(t) === 'selesai').length;
    const dikerjakan = semua.filter(t => ['dikerjakan', 'review'].includes(statusTugas(t))).length;
    const persen = Math.round((selesai / semua.length) * 100);
    return el('div', { class: 'kartu', style: 'margin-bottom:16px;padding:14px 16px;' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;' }, [
        el('span', { style: 'font-weight:600;font-size:13px;' }, `${selesai} dari ${semua.length} misi selesai`),
        el('span', { style: 'font-size:18px;font-weight:800;color:var(--biru);' }, `${persen}%`)
      ]),
      el('div', { class: 'bilah-progres' }, el('span', { style: `width:${persen}%;` })),
      dikerjakan > 0
        ? el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-top:6px;' }, `${dikerjakan} misi sedang berjalan`)
        : null
    ]);
  }

  /** Petunjuk Umum & Materi Awal dari program — sebelumnya tersimpan tapi
   *  tidak pernah terlihat murid. */
  function gambarPetunjuk() {
    const tp = penugasan?.tujuan_pembelajaran;
    const punya = tp?.petunjuk_umum || tp?.materi_awal || tp?.deskripsi;
    if (!punya) return null;
    return el('div', { class: 'kartu', style: 'margin-bottom:16px;padding:0;overflow:hidden;' }, [
      el('button', {
        style: 'display:flex;width:100%;align-items:center;gap:8px;padding:12px 16px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:550;color:var(--navy);text-align:left;',
        onclick: () => { petunjukTerbuka = !petunjukTerbuka; render(); }
      }, [
        ikon('program', 17),
        el('span', { style: 'flex:1;' }, 'Petunjuk & Materi Awal'),
        el('span', { style: 'color:var(--abu-teks-halus);' }, petunjukTerbuka ? '▾' : '▸')
      ]),
      petunjukTerbuka ? el('div', { style: 'padding:0 16px 16px;border-top:1px solid var(--garis-halus);' }, [
        tp.deskripsi ? el('div', { style: 'margin-top:12px;', html: teksKeHtml(tp.deskripsi) }) : null,
        tp.petunjuk_umum ? el('div', { style: 'margin-top:12px;', html: teksKeHtml(tp.petunjuk_umum) }) : null,
        tp.materi_awal ? el('div', { style: 'margin-top:12px;', html: teksKeHtml(tp.materi_awal) }) : null
      ]) : null
    ]);
  }

  function gambarStatusTenggat() {
    if (!penugasan) return null;
    if (!penugasan.dibuka) {
      return el('div', { class: 'panel-info', style: 'margin-bottom:16px;background:var(--merah-lembut);border-color:#ffbdad;color:var(--merah);' },
        'Penugasan ini sedang ditutup guru — pekerjaan tidak bisa disimpan.');
    }
    if (penugasan.mulai) {
      const mulai = new Date(penugasan.mulai + 'T00:00:00+07:00');
      if (Date.now() < mulai.getTime()) {
        return el('div', { class: 'panel-info', style: 'margin-bottom:16px;' },
          `️ Penugasan ini baru dibuka ${tanggalId(penugasan.mulai)}.`);
      }
    }
    const sisaMs = new Date(penugasan.tenggat).getTime() - Date.now();
    if (sisaMs < 0) {
      return el('div', { class: 'panel-info', style: 'margin-bottom:16px;background:var(--merah-lembut);border-color:#ffbdad;color:var(--merah);' },
        `Tenggat sudah lewat (${tanggalId(penugasan.tenggat, true)}). Pekerjaan tidak bisa disimpan lagi — hubungi guru bila perlu susulan.`);
    }
    const jam = Math.floor(sisaMs / 3600000);
    if (jam < 24) {
      return el('div', { class: 'panel-info', style: 'margin-bottom:16px;background:var(--kuning-lembut);border-color:#ffe380;color:#974F00;' },
        `Tersisa ${jam} jam menuju tenggat (${tanggalId(penugasan.tenggat, true)}).`);
    }
    return el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-bottom:16px;' },
      `Tenggat: ${tanggalId(penugasan.tenggat, true)} · sisa ${Math.floor(jam / 24)} hari`);
  }

  function gambarTabTombol(kunci, label) {
    const aktif = tab === kunci;
    return el('button', {
      class: 'tab' + (aktif ? ' aktif' : ''),
      onclick: () => { tab = kunci; render(); }
    }, label);
  }

  function render() {
    if (memuat) {
      isi(root, renderShell({ profil, judulHalaman: 'Memuat…', onKeluar, konten: el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat papan misi…') }));
      return;
    }
    if (galat || !penugasan) {
      isi(root, renderShell({ profil, judulHalaman: 'Tidak ditemukan', onKeluar, konten: el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat || 'Penugasan tidak ditemukan.') }));
      return;
    }
    if (kendali === 'dikunci') {
      isi(root, renderShell({
        profil, judulHalaman: penugasan.tujuan_pembelajaran?.judul || 'Papan Misi', onKeluar,
        konten: el('div', { class: 'kartu', style: 'text-align:center;padding:48px;' }, [
          el('div', { style: 'font-size:40px;margin-bottom:12px;' }, ikon('gembok', 15)),
          el('h2', {}, 'Akses Anda Sedang Dikunci'),
          el('p', { style: 'color:var(--abu-teks);' }, 'Guru Anda sedang mengunci akses ke kelas ini. Hubungi guru Anda kalau ini tidak sesuai harapan.')
        ])
      }));
      return;
    }
    isi(root, renderShell({
      profil, judulHalaman: penugasan.tujuan_pembelajaran?.judul || 'Papan Misi',
      sub: penugasan.kelas?.nama, onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: '#/murid' }, '← Papan Misi')]),
        kendali === 'dijeda' ? el('div', { class: 'panel-info', style: 'margin-bottom:16px;background:var(--kuning-lembut);border-color:#ffe380;color:#974F00;' }, 'Akses Anda sedang dijeda oleh guru — Anda bisa melihat, tapi tidak bisa memulai misi baru sampai diaktifkan kembali.') : null,
        gambarStatusTenggat(),
        gambarPetunjuk(),
        gambarRingkasProgres(),
        kelompokSaya ? el('div', { class: 'panel-info', style: 'margin-bottom:16px;' }, `Kelompok Anda: ${kelompokSaya.nama}`) : null,
        el('div', { class: 'deret-tab' }, [
          gambarTabTombol('misi', 'Misi'),
          lembarLepas.length > 0 ? gambarTabTombol('lembar', `Lembar Lepas (${lembarLepas.length})`) : null,
          gambarTabTombol('sejawat', 'Nilai Rekan'),
          gambarTabTombol('refleksi', 'Refleksi')
        ]),
        tab === 'misi' ? gambarTabMisi()
          : (tab === 'lembar' && lembarLepas.length > 0) ? gambarTabLembar()
          : tab === 'sejawat' ? gambarTabSejawat()
          : gambarTabRefleksi()
      ]
    }));

    if (tab === 'sejawat') { for (const id of sprintTerbukaSejawat) muatFormSejawat(sprints.find(s => s.id === id)); }
    if (tab === 'refleksi') {
      if (modeRefleksiPerTahap) {
        for (const id of sprintTerbukaRefleksi) muatFormRefleksi(sprints.find(s => s.id === id));
      } else {
        muatFormRefleksiProgram();
      }
    }
  }

  render();
  await muatSemua();
}
