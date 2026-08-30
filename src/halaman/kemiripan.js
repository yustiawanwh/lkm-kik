// src/halaman/kemiripan.js — Penanda kemiripan (anti-contek) untuk guru.
// Membandingkan sidik gambar (aHash) antar bukti karya pada tugas yang sama.
// Alat bantu — TIDAK memengaruhi nilai secara otomatis.
import { el, isi } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilPenugasan, ambilStrukturProgram, ambilSemuaProgresPenugasan } from '../lib/data-papan.js';
import { jarakHamming, AMBANG_MIRIP } from '../lib/sidik-gambar.js';
import { supabase } from '../lib/supabase.js';
import { urlBukti } from '../lib/bukti.js';

export async function renderKemiripan(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let penugasan = null, sprints = [], pasanganMirip = [];

  async function muat() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      sprints = await ambilStrukturProgram(penugasan.tujuan_pembelajaran_id);
      const progresList = await ambilSemuaProgresPenugasan(penugasanId);

      const { data: lampiranList, error } = await supabase
        .from('lampiran').select('*, profil:murid_id(nama)')
        .in('progres_tugas_id', progresList.map(p => p.id).length ? progresList.map(p => p.id) : ['00000000-0000-0000-0000-000000000000'])
        .not('sidik', 'is', null);
      if (error) throw error;

      const progresById = new Map(progresList.map(p => [p.id, p]));
      const tugasNama = new Map(sprints.flatMap(s => s.tugas.map(t => [t.id, t.judul])));

      // Kelompokkan lampiran per tugas (hanya masuk akal membandingkan
      // gambar dari tugas yang sama).
      const perTugas = new Map();
      for (const la of lampiranList) {
        const progres = progresById.get(la.progres_tugas_id);
        if (!progres) continue;
        const daftar = perTugas.get(progres.tugas_id) || [];
        daftar.push({ ...la, progres });
        perTugas.set(progres.tugas_id, daftar);
      }

      pasanganMirip = [];
      for (const [tugasId, daftar] of perTugas) {
        for (let i = 0; i < daftar.length; i++) {
          for (let j = i + 1; j < daftar.length; j++) {
            if (daftar[i].progres.murid_id === daftar[j].progres.murid_id) continue; // punya sendiri, wajar sama
            const jarak = jarakHamming(daftar[i].sidik, daftar[j].sidik);
            if (jarak <= AMBANG_MIRIP) {
              pasanganMirip.push({
                tugas: tugasNama.get(tugasId) || '(tugas)',
                a: daftar[i], b: daftar[j], jarak
              });
            }
          }
        }
      }
      pasanganMirip.sort((x, y) => x.jarak - y.jarak);
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  /** Kotak pratinjau gambar bukti — dimuat async lewat signed URL. */
  function pratinjau(lampiran) {
    const kotak = el('div', {
      style: 'width:120px;height:120px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--garis);background:var(--netral);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--abu-teks);',
      title: lampiran.nama_asli
    }, 'Memuat…');
    urlBukti(lampiran.path)
      .then(url => isi(kotak, [el('img', { src: url, style: 'width:100%;height:100%;object-fit:cover;' })]))
      .catch(() => isi(kotak, ['Gagal memuat']));
    return el('div', {}, [
      kotak,
      el('div', { style: 'font-size:11px;color:var(--abu-teks-halus);max-width:120px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' },
        lampiran.profil?.nama || '')
    ]);
  }

  function render() {
    let konten;
    if (memuat) {
      konten = el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Membandingkan bukti karya…');
    } else if (galat) {
      konten = el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat);
    } else if (pasanganMirip.length === 0) {
      konten = el('div', { class: 'kartu-kosong' }, 'Tidak ditemukan bukti karya yang mirip pada penugasan ini.');
    } else {
      konten = el('div', { class: 'daftar-baris' }, pasanganMirip.map(p => el('div', { class: 'kartu', style: 'border-left:4px solid var(--merah);' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;' }, [
          el('span', { style: 'font-weight:700;' }, `${p.tugas}`),
          el('span', { class: 'lencana', style: 'background:var(--merah-lembut);color:var(--merah);' }, `Jarak: ${p.jarak}/256 bit`)
        ]),
        el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:10px;' },
          `${p.a.profil?.nama || 'Murid A'} mirip dengan ${p.b.profil?.nama || 'Murid B'}`),
        el('div', { style: 'display:flex;gap:12px;' }, [
          pratinjau(p.a), pratinjau(p.b)
        ])
      ])));
    }

    isi(root, renderShell({
      profil, judulHalaman: ikonTeks('cari', 'Kemiripan'), onKeluar,
      sub: penugasan?.tujuan_pembelajaran?.judul,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: `#/guru/kelas` }, '← Kelas') ]),
        el('div', { class: 'panel-info', style: 'margin-bottom:16px;' },
          'Alat bantu untuk guru — TIDAK memengaruhi nilai secara otomatis. Jarak Hamming ≤ 8 dari 256 bit dianggap mirip. Ini bukan bukti kecurangan mutlak; gunakan sebagai titik awal percakapan dengan murid.'),
        konten
      ]
    }));
  }

  render();
  await muat();
}
