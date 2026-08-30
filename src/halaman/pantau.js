// src/halaman/pantau.js — Pantau Langsung: guru melihat progres pengerjaan
// seluruh kelas selagi pelajaran berlangsung, memperbarui diri sendiri.
//
// Sinyal "sedang aktif" diambil dari kedatangan pembaruan realtime: timer
// murid menyimpan detik_terpakai tiap 15 detik selagi berjalan, jadi baris
// yang baru saja berubah menandakan orangnya memang sedang bekerja —
// bukan sekadar meninggalkan tab terbuka.
import { el, isi, roti, tanggalId } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ikon } from '../lib/ikon.js';
import { ambilBahanPantau, pantauProgres } from '../lib/data-pantau.js';
import { state } from '../main.js';

const AMBANG_AKTIF_MS = 90_000; // dianggap "sedang aktif" bila berubah <90 detik lalu

const GAYA_STATUS = {
  backlog:    { label: 'Belum', kelas: 'sel-belum' },
  dikerjakan: { label: 'Jalan', kelas: 'sel-jalan' },
  review:     { label: 'Diserahkan', kelas: 'sel-review' },
  selesai:    { label: 'Dinilai', kelas: 'sel-selesai' }
};

export async function renderPantau(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let bahan = null;
  let petaProgres = new Map();      // "pemilikId::tugasId" -> baris progres
  let waktuUbah = new Map();        // id progres -> kapan terakhir berubah
  let lepasKanal = null;
  let idDenyut = null;

  function kunci(pemilikId, tugasId) { return `${pemilikId}::${tugasId}`; }

  function pemilikDari(baris) { return baris.kelompok_id || baris.murid_id; }

  async function muat() {
    memuat = true; render();
    try {
      bahan = await ambilBahanPantau(penugasanId);
      petaProgres = new Map();
      for (const p of bahan.progres) petaProgres.set(kunci(pemilikDari(p), p.tugas_id), p);

      lepasKanal?.();
      lepasKanal = pantauProgres(penugasanId, (baris) => {
        petaProgres.set(kunci(pemilikDari(baris), baris.tugas_id), baris);
        waktuUbah.set(baris.id, Date.now());
        render();
      });

      // Denyut: segarkan tampilan tiap 20 detik agar penanda "sedang aktif"
      // memudar sendiri walau tidak ada pembaruan masuk.
      clearInterval(idDenyut);
      idDenyut = setInterval(render, 20_000);

      state.pembersihHalaman = () => {
        lepasKanal?.(); lepasKanal = null;
        clearInterval(idDenyut); idDenyut = null;
      };
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  function sedangAktif(baris) {
    if (!baris || baris.status !== 'dikerjakan') return false;
    const t = waktuUbah.get(baris.id);
    return !!t && (Date.now() - t) < AMBANG_AKTIF_MS;
  }

  function formatDetik(total) {
    const j = Math.floor((total || 0) / 3600), m = Math.floor(((total || 0) % 3600) / 60);
    return j > 0 ? `${j}j ${m}m` : `${m}m`;
  }

  // ---------- Ringkasan angka ----------
  function gambarRingkasan(daftarBaris, daftarTugas) {
    const hitung = { backlog: 0, dikerjakan: 0, review: 0, selesai: 0 };
    let aktif = 0;
    for (const b of daftarBaris) {
      for (const t of daftarTugas) {
        const p = petaProgres.get(kunci(b.id, t.id));
        hitung[p?.status || 'backlog']++;
        if (sedangAktif(p)) aktif++;
      }
    }
    const total = daftarBaris.length * daftarTugas.length || 1;
    const persen = Math.round((hitung.selesai / total) * 100);

    return el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;' }, [
      kotakRingkas('Sedang dikerjakan', aktif, 'var(--biru)', true),
      kotakRingkas('Menunggu dinilai', hitung.review, 'var(--kuning)'),
      kotakRingkas('Sudah dinilai', hitung.selesai, 'var(--hijau)'),
      kotakRingkas('Belum disentuh', hitung.backlog, 'var(--abu-teks-halus)'),
      el('div', { class: 'kartu', style: 'flex:2;min-width:190px;' }, [
        el('div', { style: 'font-size:12px;color:var(--abu-teks);' }, 'Ketuntasan penilaian'),
        el('div', { style: 'font-size:24px;font-weight:650;' }, `${persen}%`),
        el('div', { class: 'bilah-progres' }, el('span', { style: `width:${persen}%;` }))
      ])
    ]);
  }

  function kotakRingkas(label, angka, warna, denyut = false) {
    return el('div', { class: 'kartu', style: 'flex:1;min-width:130px;' }, [
      el('div', { style: 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--abu-teks);' }, [
        denyut && angka > 0 ? el('span', { class: 'titik-denyut' }) : null,
        el('span', {}, label)
      ]),
      el('div', { style: `font-size:24px;font-weight:650;color:${warna};` }, String(angka))
    ]);
  }

  // ---------- Tabel matriks ----------
  function gambarMatriks(judul, daftarBaris, daftarTugas, labelBaris) {
    if (daftarBaris.length === 0 || daftarTugas.length === 0) return null;
    return el('div', { style: 'margin-bottom:24px;' }, [
      el('h3', { style: 'margin-bottom:10px;' }, judul),
      el('div', { class: 'kartu', style: 'padding:0;overflow-x:auto;' }, [
        el('table', { class: 'tabel tabel-pantau' }, [
          el('thead', {}, el('tr', {}, [
            el('th', { style: 'position:sticky;left:0;background:var(--permukaan);z-index:1;' }, labelBaris),
            ...daftarTugas.map(t => el('th', { title: t.judul }, `${t.sprintNomor}.${t.kode}`))
          ])),
          el('tbody', {}, daftarBaris.map(b => el('tr', {}, [
            el('td', { style: 'position:sticky;left:0;background:var(--permukaan);font-weight:550;white-space:nowrap;' }, [
              el('span', {}, b.nama),
              b.kendali && b.kendali !== 'aktif'
                ? el('span', { class: 'lencana', style: 'margin-left:6px;background:var(--kuning-lembut);color:var(--kuning-teks);' },
                    b.kendali === 'dikunci' ? 'dikunci' : 'dijeda')
                : null
            ]),
            ...daftarTugas.map(t => selStatus(b, t))
          ])))
        ])
      ])
    ]);
  }

  function selStatus(baris, tugas) {
    const p = petaProgres.get(kunci(baris.id, tugas.id));
    const status = p?.status || 'backlog';
    const gaya = GAYA_STATUS[status];
    const aktif = sedangAktif(p);

    return el('td', { style: 'text-align:center;' }, [
      el('span', {
        class: `sel-pantau ${gaya.kelas}${aktif ? ' sel-aktif' : ''}`,
        title: [
          `${tugas.kode} — ${tugas.judul}`,
          `Status: ${gaya.label}`,
          p?.detik_terpakai ? `Waktu: ${formatDetik(p.detik_terpakai)}` : null,
          p?.diserahkan_pada ? `Diserahkan: ${tanggalId(p.diserahkan_pada, true)}` : null,
          p?.nilai_huruf ? `Nilai: ${p.nilai_huruf}` : null
        ].filter(Boolean).join('\n')
      }, [
        aktif ? el('span', { class: 'titik-denyut' }) : null,
        el('span', {}, p?.nilai_huruf || gaya.label)
      ])
    ]);
  }

  function render() {
    if (memuat) {
      isi(root, renderShell({ profil, judulHalaman: 'Pantau Langsung', onKeluar,
        konten: el('div', { class: 'kartu', style: 'padding:40px;text-align:center;color:var(--abu-teks);' }, 'Memuat…') }));
      return;
    }
    if (galat || !bahan) {
      isi(root, renderShell({ profil, judulHalaman: 'Pantau Langsung', onKeluar,
        konten: el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat || 'Tidak ditemukan.') }));
      return;
    }

    const tugasKelompok = bahan.tugas.filter(t => t.sifat_kerja === 'kelompok');
    const tugasMandiri = bahan.tugas.filter(t => t.sifat_kerja !== 'kelompok');
    const barisKelompok = bahan.kelompok.map(k => ({ id: k.id, nama: k.nama }));
    const barisMurid = bahan.murid.map(m => ({
      id: m.id, kendali: m.kendali,
      nama: (m.no_absen ? `${m.no_absen}. ` : '') + (m.nama || '')
    }));

    const semuaBaris = [...barisKelompok, ...barisMurid];
    const ringkasan = tugasKelompok.length
      ? gambarRingkasan(barisKelompok, tugasKelompok)
      : gambarRingkasan(barisMurid, tugasMandiri);

    isi(root, renderShell({
      profil, judulHalaman: 'Pantau Langsung',
      sub: `${bahan.penugasan.kelas?.nama} · ${bahan.penugasan.tujuan_pembelajaran?.judul}`,
      onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: '#/guru/kelas' }, 'Kelas')]),
        el('div', { class: 'panel-info', style: 'margin-bottom:16px;display:flex;align-items:center;gap:8px;' }, [
          el('span', { class: 'titik-denyut' }),
          el('span', {}, 'Halaman ini memperbarui diri sendiri. Titik berdenyut menandai murid yang timernya sedang berjalan saat ini.')
        ]),
        ringkasan,
        gambarMatriks('Misi Kelompok', barisKelompok, tugasKelompok, 'Kelompok'),
        gambarMatriks('Misi Mandiri', barisMurid, tugasMandiri, 'Murid'),
        semuaBaris.length === 0
          ? el('div', { class: 'kartu-kosong' }, 'Belum ada murid atau kelompok di kelas ini.')
          : null,
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--abu-teks);' }, [
          keterangan('sel-belum', 'Belum disentuh'),
          keterangan('sel-jalan', 'Sedang dikerjakan'),
          keterangan('sel-review', 'Menunggu dinilai'),
          keterangan('sel-selesai', 'Sudah dinilai')
        ])
      ]
    }));
  }

  function keterangan(kelas, teks) {
    return el('span', { style: 'display:inline-flex;align-items:center;gap:5px;' }, [
      el('span', { class: `sel-pantau ${kelas}`, style: 'min-width:0;padding:2px 8px;' }, ' '),
      el('span', {}, teks)
    ]);
  }

  render();
  await muat();
}
