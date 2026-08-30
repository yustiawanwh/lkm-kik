// src/halaman/asesmen-guru.js — Guru melihat hasil asesmen non-tes yang
// terkumpul: rangkuman penilaian sejawat, refleksi murid, dan riwayat
// observasi sikap. (Menutup celah: data ini sebelumnya terkumpul tapi tidak
// pernah bisa dibaca guru.)
import { el, isi, tanggalId } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilPenugasan } from '../lib/data-papan.js';
import { rangkumanSejawatGuru, daftarRefleksiPenugasan, daftarSikapKelas, promptRefleksiProgram, INDIKATOR_SIKAP } from '../lib/data-asesmen.js';

export async function renderAsesmenGuru(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '', tab = 'sejawat';
  let penugasan = null, sejawat = [], refleksi = [], sikap = [], promptRefleksi = [];

  async function muatSemua() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      sejawat = await rangkumanSejawatGuru(penugasanId);
      refleksi = await daftarRefleksiPenugasan(penugasanId);
      sikap = await daftarSikapKelas(penugasan.kelas_id);
      promptRefleksi = await promptRefleksiProgram(penugasan.tujuan_pembelajaran_id);
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
        el('span', { style: 'font-size:11px;color:var(--abu-teks-halus);' }, tanggalId(s.dibuat_pada, true))
      ]),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;' },
        INDIKATOR_SIKAP.map(ind => el('span', { class: 'lencana' }, `${ind.label}: ${s.skor?.[ind.key] ?? '—'}`))),
      s.catatan ? el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, s.catatan) : null
    ])));
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
              gambarTabTombol('sejawat', 'Nilai Sejawat'),
              gambarTabTombol('refleksi', `Refleksi (${refleksi.length})`),
              gambarTabTombol('sikap', `Observasi Sikap (${sikap.length})`)
            ]),
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
