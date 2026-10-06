// src/halaman/kartu-awal.js — Guru menyusun Kartu Awal tiap kelompok.
import { el, isi, roti, dialog, konfirmasi } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { ambilPenugasan } from '../lib/data-papan.js';
import { daftarKelompok } from '../lib/data-kelas.js';
import {
  daftarKartuAwal, simpanKartuAwal, hapusKartuAwal, penugasanSekelas,
  tarikBahanKartu, ringkasTanggapan, LABEL_BAWAAN
} from '../lib/data-kartu.js';

export async function renderKartuAwal(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galat = '';
  let penugasan = null, kelompokList = [], kartuList = [], sumberList = [];
  let sumberTerpilih = '';

  async function muat() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      [kelompokList, kartuList, sumberList] = await Promise.all([
        daftarKelompok(penugasan.kelas_id),
        daftarKartuAwal(penugasanId),
        penugasanSekelas(penugasan.kelas_id, penugasanId)
      ]);
      // Bila kartu sudah pernah dibuat, ikuti sumber yang dipakai sebelumnya.
      sumberTerpilih = kartuList.find(k => k.penugasan_sumber)?.penugasan_sumber || '';
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  function kartuUntuk(kelompokId) {
    return kartuList.find(k => k.kelompok_id === kelompokId) || null;
  }

  // ---------- Penyusun kartu ----------
  function bukaDialogKartu(kelompok) {
    const kartu = kartuUntuk(kelompok.id);
    const baris = kartu?.isi?.length
      ? kartu.isi.map(b => ({ ...b }))
      : LABEL_BAWAAN.map(label => ({ label, teks: '' }));

    const areaBaris = el('div', {});
    const areaBahan = el('div', {});

    function gambarBaris() {
      isi(areaBaris, baris.map((b, i) => el('div', { class: 'kartu', style: 'padding:10px 12px;margin-bottom:8px;background:var(--permukaan-2);' }, [
        el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [
          el('input', {
            value: b.label, placeholder: 'Nama baris',
            style: 'flex:1;font-weight:600;',
            oninput: (e) => { b.label = e.target.value; }
          }),
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil',
            onclick: () => { baris.splice(i, 1); gambarBaris(); }
          }, ikon('tutup', 14))
        ]),
        el('textarea', {
          style: 'min-height:70px;', value: b.teks,
          oninput: (e) => { b.teks = e.target.value; }
        }, b.teks)
      ])));
    }
    gambarBaris();

    /** Tarik bahan dari penugasan sumber. Tanggapan pameran langsung
     *  dimasukkan ke barisnya; jawaban lembar ditampilkan sebagai bahan
     *  mentah untuk disalin guru sendiri. */
    async function tarikBahan() {
      if (!sumberTerpilih) { roti('Pilih penugasan sumber lebih dulu.', 'galat'); return; }
      isi(areaBahan, [el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, 'Menarik bahan…')]);
      try {
        const bahan = await tarikBahanKartu(sumberTerpilih, kelompok.id);

        // Tanggapan terstruktur — aman dimasukkan otomatis.
        const ringkas = ringkasTanggapan(bahan.tanggapan);
        if (ringkas) {
          const barisTanggapan = baris.find(b => /tanggapan/i.test(b.label));
          if (barisTanggapan) barisTanggapan.teks = ringkas;
          else baris.push({ label: 'Tanggapan kelompok lain', teks: ringkas });
          gambarBaris();
        }

        isi(areaBahan, [
          el('div', { class: 'panel-info', style: 'margin-bottom:10px;' },
            ringkas
              ? `${bahan.tanggapan.length} tanggapan pameran dimasukkan otomatis ke barisnya. Jawaban lembar di bawah perlu Anda pilih sendiri.`
              : 'Tidak ada tanggapan pameran pada penugasan sumber. Jawaban lembar di bawah bisa Anda salin.'),
          ...(bahan.lembar.length === 0
            ? [el('div', { class: 'kartu-kosong' }, 'Kelompok ini tidak punya isian lembar pada penugasan sumber.')]
            : bahan.lembar.map(l => el('details', { class: 'rujukan-sejawat' }, [
                el('summary', {}, `${l.lembar?.kode || ''} — ${l.lembar?.judul || 'Lembar'}`),
                el('div', { class: 'kotak-teks-banding', style: 'margin-top:8px;' },
                  JSON.stringify(l.data, null, 2))
              ])))
        ]);
      } catch (err) {
        isi(areaBahan, [el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;' }, pesanGalat(err))]);
      }
    }

    const { tutup } = dialog({
      judul: `Kartu Awal — ${kelompok.nama}`,
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Judul Kartu'),
          el('input', { id: 'ka-judul', value: kartu?.judul || `${kelompok.nama}`, placeholder: 'mis. Kelompok 1 — Jadwal Lab' })
        ]),

        el('div', { style: 'display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;' }, [
          el('div', { class: 'medan', style: 'flex:1;min-width:220px;margin:0;' }, [
            el('label', {}, 'Tarik Bahan dari Penugasan'),
            el('select', {
              onchange: (e) => { sumberTerpilih = e.target.value; }
            }, [
              el('option', { value: '' }, '— pilih penugasan sumber —'),
              ...sumberList.map(p => el('option', {
                value: p.id, selected: p.id === sumberTerpilih
              }, `${p.tujuan_pembelajaran?.kode ? p.tujuan_pembelajaran.kode + ' — ' : ''}${p.tujuan_pembelajaran?.judul || 'Program'}`))
            ])
          ]),
          el('button', { class: 'tombol tombol-sekunder', onclick: tarikBahan }, 'Tarik Bahan')
        ]),

        areaBahan,

        el('div', { style: 'font-weight:650;font-size:13px;margin:14px 0 8px;' }, 'Isi Kartu'),
        areaBaris,
        el('button', {
          class: 'tombol tombol-hantu tombol-kecil',
          onclick: () => { baris.push({ label: '', teks: '' }); gambarBaris(); }
        }, '+ Tambah Baris'),

        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;' }, [
          kartu ? el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              const ok = await konfirmasi(`Hapus Kartu Awal ${kelompok.nama}?`, { labelYa: 'Hapus', labelTidak: 'Batal' });
              if (!ok) return;
              try { await hapusKartuAwal(kartu.id); tutup(); roti('Kartu dihapus.', 'sukses'); await muat(); }
              catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Hapus') : null,
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const terisi = baris.filter(b => (b.label || '').trim() || (b.teks || '').trim());
              if (terisi.length === 0) { roti('Kartu masih kosong.', 'galat'); return; }
              try {
                await simpanKartuAwal({
                  id: kartu?.id, penugasanId, kelompokId: kelompok.id,
                  judul: document.getElementById('ka-judul').value.trim(),
                  isi: terisi, penugasanSumber: sumberTerpilih || null
                });
                tutup(); roti('Kartu Awal disimpan.', 'sukses'); await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  function render() {
    const konten = memuat
      ? el('div', { class: 'kartu', style: 'padding:40px;text-align:center;color:var(--abu-teks);' }, 'Memuat…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : el('div', {}, [
            el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
              'Tiap kelompok hanya melihat kartunya sendiri di Papan Misi. ' +
              'Tanggapan pameran dari penugasan sumber dapat ditarik otomatis; ' +
              'jawaban lembar kerja ditampilkan sebagai bahan untuk Anda ringkas sendiri.'),
            kelompokList.length === 0
              ? el('div', { class: 'kartu-kosong' }, 'Belum ada kelompok di kelas ini.')
              : el('div', { class: 'daftar-baris' }, kelompokList.map(k => {
                  const kartu = kartuUntuk(k.id);
                  return el('div', { class: 'baris-item' }, [
                    el('span', {
                      class: 'lencana',
                      style: kartu ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : ''
                    }, kartu ? 'Ada' : 'Belum'),
                    el('div', { class: 'isi-utama' }, [
                      el('div', { class: 'judul-baris' }, k.nama),
                      el('div', { class: 'meta-baris' },
                        kartu ? `${kartu.isi?.length || 0} baris isi` : 'Kartu belum dibuat')
                    ]),
                    el('button', {
                      class: kartu ? 'tombol tombol-hantu tombol-kecil' : 'tombol tombol-primer tombol-kecil',
                      onclick: () => bukaDialogKartu(k)
                    }, kartu ? ikonTeks('ubah', 'Sunting') : 'Buat Kartu')
                  ]);
                }))
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Kartu Awal Kelompok',
      sub: penugasan?.tujuan_pembelajaran?.judul || '',
      onKeluar, konten
    }));
  }

  render();
  await muat();
}
