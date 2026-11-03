// src/halaman/kemiripan.js — Penanda kemiripan (anti-contek) untuk guru.
// Membandingkan sidik gambar (aHash) antar bukti karya pada tugas yang sama.
// Alat bantu — TIDAK memengaruhi nilai secara otomatis.
import { el, isi, dialog } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilPenugasan, ambilStrukturProgram, ambilSemuaProgresPenugasan } from '../lib/data-papan.js';
import { jarakHamming, AMBANG_MIRIP } from '../lib/sidik-gambar.js';
import { cariPasanganMirip, kumpulkanTeks, AMBANG_BAWAAN, MIN_KATA_BAWAAN } from '../lib/sidik-teks.js';
import { isianPeroranganPenugasan } from '../lib/data-nilai.js';
import { ambilSemuaPengaturan } from '../lib/data-pengaturan.js';
import { supabase } from '../lib/supabase.js';
import { urlBukti } from '../lib/bukti.js';

export async function renderKemiripan(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let tab = 'gambar';
  let aturanTeks = { aktif: false, ambang: AMBANG_BAWAAN, min_kata: MIN_KATA_BAWAAN };
  let hasilTeks = [], galatTeks = '';
  let penugasan = null, sprints = [], pasanganMirip = [];

  /** Bandingkan jawaban teks antar murid, per lembar perorangan. */
  async function bandingkanTeks() {
    hasilTeks = []; galatTeks = '';
    const { lembar, isian } = await isianPeroranganPenugasan(penugasanId, penugasan.tujuan_pembelajaran_id);
    for (const l of lembar) {
      const daftar = isian
        .filter(i => i.lembar_kerja_id === l.id)
        .map(i => ({
          id: i.id,
          nama: (i.profil?.no_absen ? `${i.profil.no_absen}. ` : '') + (i.profil?.nama || 'Murid'),
          teks: kumpulkanTeks(i.data)
        }));
      const pasangan = cariPasanganMirip(daftar, {
        ambang: Number(aturanTeks.ambang) || AMBANG_BAWAAN,
        minKata: Number(aturanTeks.min_kata) || MIN_KATA_BAWAAN
      });
      if (pasangan.length > 0) hasilTeks.push({ lembar: l, pasangan });
    }
  }

  async function muat() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      sprints = await ambilStrukturProgram(penugasan.tujuan_pembelajaran_id);

      try {
        const pengaturan = await ambilSemuaPengaturan();
        aturanTeks = { aktif: false, ambang: AMBANG_BAWAAN, min_kata: MIN_KATA_BAWAAN, ...(pengaturan.kemiripan_teks || {}) };
        if (aturanTeks.aktif) await bandingkanTeks();
      } catch (err) { galatTeks = pesanGalat(err); }
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
      el('div', { style: 'font-size:11px;color:var(--abu-teks-halus);max-width:120px;margin-top:4px;word-break:break-word;line-height:1.35;' },
        lampiran.profil?.nama || '')
    ]);
  }

  function gambarTabTeks() {
    if (!aturanTeks.aktif) {
      return el('div', { class: 'kartu-kosong' },
        'Deteksi kemiripan teks sedang dimatikan. Aktifkan di Pengaturan → Deteksi Kemiripan Jawaban Teks. ' +
        'Fitur ini cocok untuk tugas mandiri yang mensyaratkan jawaban ditulis dengan kalimat sendiri.');
    }
    if (galatTeks) {
      return el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;' },
        `Gagal membandingkan: ${galatTeks}`);
    }
    if (hasilTeks.length === 0) {
      return el('div', { class: 'kartu-kosong' },
        `Tidak ada pasangan jawaban yang kemiripannya mencapai ${aturanTeks.ambang}%. ` +
        'Hanya lembar perorangan yang dibandingkan — lembar kelompok memang dikerjakan bersama.');
    }
    return el('div', {}, [
      el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
        `Menampilkan pasangan dengan kemiripan minimal ${aturanTeks.ambang}%, mengabaikan jawaban di bawah ${aturanTeks.min_kata} kata. ` +
        'Ini alat bantu, bukan bukti. Baca sendiri jawabannya sebelum menyimpulkan — kemiripan bisa muncul karena murid membaca bacaan yang sama.'),
      ...hasilTeks.map(h => el('div', { style: 'margin-bottom:18px;' }, [
        el('div', { class: 'judul-grup' }, [
          el('span', {}, `${h.lembar.kode} — ${h.lembar.judul}`),
          el('span', { class: 'lencana' }, `${h.pasangan.length} pasangan`)
        ]),
        el('div', { class: 'daftar-baris' }, h.pasangan.map(p => el('div', { class: 'baris-item' }, [
          el('span', {
            class: 'lencana',
            style: p.samaPersis
              ? 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;'
              : 'background:var(--kuning-lembut);color:var(--kuning-teks);border-color:transparent;'
          }, p.samaPersis ? 'Sama persis' : `${p.skor}%`),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, `${p.a.nama}  ↔  ${p.b.nama}`),
            el('div', { class: 'meta-baris' },
              p.samaPersis ? 'Jawaban identik setelah huruf besar dan tanda baca disamakan' : 'Sebagian besar kalimatnya beririsan')
          ]),
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil',
            onclick: () => bukaBandingTeks(h.lembar, p)
          }, 'Bandingkan')
        ])))
      ]))
    ]);
  }

  function bukaBandingTeks(lembar, p) {
    dialog({
      judul: `${lembar.kode} — ${p.skor}% mirip`,
      isi: el('div', { class: 'banding-teks' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:650;font-size:13px;margin-bottom:6px;' }, p.a.nama),
          el('div', { class: 'kotak-teks-banding' }, p.a.teks)
        ]),
        el('div', {}, [
          el('div', { style: 'font-weight:650;font-size:13px;margin-bottom:6px;' }, p.b.nama),
          el('div', { class: 'kotak-teks-banding' }, p.b.teks)
        ])
      ])
    });
  }

  function gambarTabTombol(kunci, label) {
    return el('button', {
      class: 'tab' + (tab === kunci ? ' aktif' : ''),
      onclick: () => { tab = kunci; render(); }
    }, label);
  }

  function render() {
    let konten;
    if (memuat) {
      konten = el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Membandingkan…');
    } else if (galat) {
      konten = el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat);
    } else if (tab === 'teks') {
      konten = el('div', {}, [
        el('div', { class: 'deret-tab' }, [
          gambarTabTombol('gambar', 'Bukti Karya (Gambar)'),
          gambarTabTombol('teks', `Jawaban Teks${hasilTeks.length ? ` (${hasilTeks.reduce((t, h) => t + h.pasangan.length, 0)})` : ''}`)
        ]),
        gambarTabTeks()
      ]);
    } else if (pasanganMirip.length === 0) {
      konten = el('div', {}, [
        el('div', { class: 'deret-tab' }, [
          gambarTabTombol('gambar', 'Bukti Karya (Gambar)'),
          gambarTabTombol('teks', `Jawaban Teks${hasilTeks.length ? ` (${hasilTeks.reduce((t, h) => t + h.pasangan.length, 0)})` : ''}`)
        ]),
        el('div', { class: 'kartu-kosong' }, 'Tidak ditemukan bukti karya yang mirip pada penugasan ini.')
      ]);
    } else {
      konten = el('div', {}, [
        el('div', { class: 'deret-tab' }, [
          gambarTabTombol('gambar', 'Bukti Karya (Gambar)'),
          gambarTabTombol('teks', `Jawaban Teks${hasilTeks.length ? ` (${hasilTeks.reduce((t, h) => t + h.pasangan.length, 0)})` : ''}`)
        ]),
        el('div', { class: 'daftar-baris' }, pasanganMirip.map(p => el('div', { class: 'kartu', style: 'border-left:4px solid var(--merah);' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;' }, [
          el('span', { style: 'font-weight:700;' }, `${p.tugas}`),
          el('span', { class: 'lencana', style: 'background:var(--merah-lembut);color:var(--merah);' }, `Jarak: ${p.jarak}/256 bit`)
        ]),
        el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:10px;' },
          `${p.a.profil?.nama || 'Murid A'} mirip dengan ${p.b.profil?.nama || 'Murid B'}`),
        el('div', { style: 'display:flex;gap:12px;' }, [
          pratinjau(p.a), pratinjau(p.b)
        ])
      ])))
      ]);
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
