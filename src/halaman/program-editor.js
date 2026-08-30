// src/halaman/program-editor.js — Editor Program Inkubasi: metadata, tahap,
// misi, dan lembar kerja.
import { el, isi, roti, dialog, konfirmasi } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { navigasi } from '../lib/rute.js';
import {
  ambilProgram, updateProgram,
  daftarSprint, buatSprint, updateSprint, hapusSprint,
  daftarTugas, buatTugas, updateTugas, hapusTugas,
  daftarLembar, buatLembar, updateLembar, hapusLembar,
  TIPE_LEMBAR, LABEL_TIPE_LEMBAR
} from '../lib/data-kurikulum.js';
import { daftarBadgeProgram, buatBadge, updateBadge, hapusBadge } from '../lib/data-asesmen.js';
import { buatPembangunLembar } from '../lib/pembangun-lembar.js';

export async function renderProgramEditor(root, { profil, onKeluar, programId }) {
  let memuat = true;
  let galat = '';
  let program = null;
  let sprints = [];       // [{ ...sprint, tugas: [...] }]
  let lembarList = [];
  let badgeList = [];
  let tab = 'tahap'; // 'tahap' | 'lembar' | 'lencana'
  let sprintTerbuka = new Set();

  async function muatSemua() {
    memuat = true; galat = ''; render();
    try {
      program = await ambilProgram(programId);
      const daftarS = await daftarSprint(programId);
      sprints = await Promise.all(daftarS.map(async (s) => ({ ...s, tugas: await daftarTugas(s.id) })));
      lembarList = await daftarLembar(programId);
      badgeList = await daftarBadgeProgram(programId);
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  // ============ Metadata Program ============
  function bukaDialogEditProgram() {
    const { tutup } = dialog({
      judul: 'Edit Program Inkubasi',
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Judul Program'),
          el('input', { id: 'e-judul', value: program.judul })
        ]),
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Kode'),
            el('input', { id: 'e-kode', value: program.kode || '' })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Total JP'),
            el('input', { id: 'e-jp', type: 'number', min: '0', value: program.total_jp || '' })
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Deskripsi'),
          el('textarea', { id: 'e-deskripsi' }, program.deskripsi || '')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Petunjuk Umum untuk Murid'),
          el('textarea', { id: 'e-petunjuk' }, program.petunjuk_umum || ''),
          el('div', { class: 'keterangan' }, 'Tampil di Papan Misi murid, pada panel "Petunjuk & Materi Awal".')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Materi Awal / Bahan Rujukan'),
          el('textarea', { id: 'e-materi' }, program.materi_awal || ''),
          el('div', { class: 'keterangan' }, 'Cocok untuk daftar rujukan yang perlu dibaca murid, mis. daftar bidang masalah tiap kelompok. Mendukung **tebal**, *miring*, daftar berbutir (-), dan daftar bernomor (1.).')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              try {
                program = await updateProgram(program.id, {
                  judul: document.getElementById('e-judul').value.trim(),
                  kode: document.getElementById('e-kode').value.trim() || null,
                  total_jp: Number(document.getElementById('e-jp').value) || null,
                  deskripsi: document.getElementById('e-deskripsi').value.trim() || null,
                  petunjuk_umum: document.getElementById('e-petunjuk').value.trim() || null,
                  materi_awal: document.getElementById('e-materi').value.trim() || null
                });
                tutup(); roti('Program diperbarui.', 'sukses'); render();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function ubahTerbit() {
    try {
      program = await updateProgram(program.id, { terbit: !program.terbit });
      roti(program.terbit ? 'Program diterbitkan — terlihat oleh murid saat ditugaskan ke kelas.' : 'Program dikembalikan ke draf.', 'sukses');
      render();
    } catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  // ============ Sprint (Tahap Inkubasi) ============
  function bukaDialogSprint(sprintLama) {
    const { tutup } = dialog({
      judul: sprintLama ? 'Edit Tahap Inkubasi' : 'Tambah Tahap Inkubasi',
      isi: el('div', {}, [
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Nomor Tahap'),
            el('input', { id: 's-nomor', type: 'number', min: '1', value: sprintLama?.nomor ?? sprints.length + 1 })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'JP'),
            el('input', { id: 's-jp', type: 'number', min: '0', value: sprintLama?.jp || '' })
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Tahap'),
          el('input', { id: 's-nama', value: sprintLama?.nama || '', placeholder: 'mis. Riset & Ide Bisnis' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Tujuan Tahap Ini'),
          el('textarea', { id: 's-tujuan' }, sprintLama?.tujuan || '')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const nama = document.getElementById('s-nama').value.trim();
              if (!nama) { roti('Nama tahap wajib diisi.', 'galat'); return; }
              const payload = {
                nomor: Number(document.getElementById('s-nomor').value) || sprints.length + 1,
                jp: Number(document.getElementById('s-jp').value) || null,
                nama,
                tujuan: document.getElementById('s-tujuan').value.trim() || null
              };
              try {
                if (sprintLama) {
                  await updateSprint(sprintLama.id, payload);
                } else {
                  await buatSprint({ ...payload, tujuan_pembelajaran_id: program.id });
                }
                tutup(); roti('Tahap disimpan.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function hapusSprintDenganKonfirmasi(s) {
    const ok = await konfirmasi(`Hapus tahap "${s.nama}"? Seluruh misi di dalamnya ikut terhapus.`, { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusSprint(s.id); roti('Tahap dihapus.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  // ============ Tugas (Misi) ============
  function bukaDialogTugas(sprint, tugasLama) {
    const { tutup } = dialog({
      judul: tugasLama ? 'Edit Misi' : 'Tambah Misi',
      isi: el('div', {}, [
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Kode Misi'),
            el('input', { id: 't-kode', value: tugasLama?.kode || `M${sprint.tugas.length + 1}` })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'XP'),
            el('input', { id: 't-xp', type: 'number', min: '0', value: tugasLama?.xp ?? 10 })
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Judul Misi'),
          el('input', { id: 't-judul', value: tugasLama?.judul || '' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Deskripsi / Instruksi'),
          el('textarea', { id: 't-deskripsi' }, tugasLama?.deskripsi || '')
        ]),
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Jenis'),
            el('select', { id: 't-jenis' }, [
              el('option', { value: 'inti', selected: (tugasLama?.jenis ?? 'inti') === 'inti' }, 'Inti'),
              el('option', { value: 'tantangan', selected: tugasLama?.jenis === 'tantangan' }, 'Tantangan'),
              el('option', { value: 'tutor', selected: tugasLama?.jenis === 'tutor' }, 'Tutor Sebaya')
            ])
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Sifat Kerja'),
            el('select', { id: 't-sifat' }, [
              el('option', { value: 'mandiri', selected: (tugasLama?.sifat_kerja ?? 'mandiri') === 'mandiri' }, 'Mandiri'),
              el('option', { value: 'kelompok', selected: tugasLama?.sifat_kerja === 'kelompok' }, 'Kelompok')
            ])
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Lembar Kerja yang Dikerjakan di Misi Ini'),
          el('div', { class: 'keterangan', style: 'margin:0 0 8px;' },
            'Lembar yang dipilih akan tampil langsung di dalam misi, dan hanya bisa diisi murid selagi timer misi berjalan.'),
          lembarList.length === 0
            ? el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, 'Belum ada lembar kerja pada program ini. Tambahkan dulu di tab Lembar Kerja.')
            : el('div', { style: 'display:flex;flex-direction:column;gap:6px;' }, lembarList.map(l => {
                const terpilih = (tugasLama?.lembar_kode || '')
                  .split(',').map(k => k.trim().toLowerCase()).includes(l.kode.toLowerCase());
                return el('label', {
                  style: 'display:flex;align-items:center;gap:8px;font-weight:400;font-size:13.5px;cursor:pointer;padding:6px 8px;border:1px solid var(--garis);border-radius:var(--radius-sm);'
                }, [
                  el('input', { type: 'checkbox', class: 't-lembar-pilih', value: l.kode, checked: terpilih }),
                  el('span', {}, `${l.kode} — ${l.judul}`),
                  el('span', { class: 'lencana', style: 'margin-left:auto;' }, LABEL_TIPE_LEMBAR[l.tipe] || l.tipe)
                ]);
              }))
        ]),
        el('div', { class: 'medan', style: 'display:flex;align-items:center;gap:8px;' }, [
          el('input', { type: 'checkbox', id: 't-wajib-bukti', checked: tugasLama?.wajib_bukti || false }),
          el('label', { style: 'margin:0;' }, 'Wajib unggah bukti karya')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const judul = document.getElementById('t-judul').value.trim();
              const kode = document.getElementById('t-kode').value.trim();
              if (!judul || !kode) { roti('Kode dan judul misi wajib diisi.', 'galat'); return; }
              const payload = {
                kode, judul,
                deskripsi: document.getElementById('t-deskripsi').value.trim() || null,
                jenis: document.getElementById('t-jenis').value,
                sifat_kerja: document.getElementById('t-sifat').value,
                xp: Number(document.getElementById('t-xp').value) || 0,
                wajib_bukti: document.getElementById('t-wajib-bukti').checked,
                lembar_kode: Array.from(document.querySelectorAll('.t-lembar-pilih'))
                  .filter(c => c.checked).map(c => c.value).join(',') || null
              };
              try {
                if (tugasLama) {
                  await updateTugas(tugasLama.id, payload);
                } else {
                  await buatTugas({ ...payload, sprint_id: sprint.id, urutan: sprint.tugas.length });
                }
                tutup(); roti('Misi disimpan.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function hapusTugasDenganKonfirmasi(t) {
    const ok = await konfirmasi(`Hapus misi "${t.judul}"?`, { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusTugas(t.id); roti('Misi dihapus.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  // ============ Lembar Kerja ============
  function bukaDialogLembar(lembarLama) {
    const pembangun = buatPembangunLembar(lembarLama?.tipe ?? 'matriks', lembarLama?.struktur || {});
    const { tutup } = dialog({
      judul: lembarLama ? 'Edit Lembar Kerja' : 'Tambah Lembar Kerja',
      isi: el('div', {}, [
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Kode'),
            el('input', { id: 'l-kode', value: lembarLama?.kode || `LK${lembarList.length + 1}` })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Tipe'),
            el('select', {
              id: 'l-tipe',
              onchange: (e) => pembangun.setTipe(e.target.value)
            }, TIPE_LEMBAR.map(t =>
              el('option', { value: t, selected: (lembarLama?.tipe ?? 'matriks') === t }, LABEL_TIPE_LEMBAR[t])
            ))
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Judul Lembar'),
          el('input', { id: 'l-judul', value: lembarLama?.judul || '' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Keterangan untuk Murid'),
          el('textarea', { id: 'l-keterangan' }, lembarLama?.keterangan || '')
        ]),
        el('div', { class: 'medan', style: 'display:flex;align-items:center;gap:8px;' }, [
          el('input', { type: 'checkbox', id: 'l-kelompok', checked: lembarLama?.milik_kelompok || false }),
          el('label', { style: 'margin:0;' }, 'Dikerjakan bersama satu kelompok (bukan individu)')
        ]),
        el('div', { class: 'medan', style: 'display:flex;align-items:center;gap:8px;' }, [
          el('input', { type: 'checkbox', id: 'l-baris-dinamis', checked: lembarLama?.baris_dinamis || false }),
          el('label', { style: 'margin:0;' }, 'Murid boleh menambah baris sendiri (untuk tipe Matriks/Daftar/Kalkulator/Instrumen)')
        ]),
        el('div', { class: 'medan', style: 'display:flex;align-items:center;gap:8px;' }, [
          el('input', { type: 'checkbox', id: 'l-persetujuan', checked: lembarLama?.perlu_persetujuan || false }),
          el('label', { style: 'margin:0;' }, 'Perlu persetujuan tiap anggota (relevan untuk tipe Kesepakatan)')
        ]),
        el('div', { style: 'border-top:1px solid var(--garis);padding-top:14px;margin-top:4px;' }, [
          el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:10px;' }, 'Isi Lembar'),
          pembangun.elemen
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const judul = document.getElementById('l-judul').value.trim();
              const kode = document.getElementById('l-kode').value.trim();
              if (!judul || !kode) { roti('Kode dan judul lembar wajib diisi.', 'galat'); return; }
              let struktur = {};
              try {
                struktur = pembangun.ambilStruktur();
              } catch {
                roti('Struktur belum valid — periksa isian di bagian "Isi Lembar".', 'galat');
                return;
              }
              const payload = {
                kode, judul,
                keterangan: document.getElementById('l-keterangan').value.trim() || null,
                tipe: document.getElementById('l-tipe').value,
                milik_kelompok: document.getElementById('l-kelompok').checked,
                baris_dinamis: document.getElementById('l-baris-dinamis').checked,
                perlu_persetujuan: document.getElementById('l-persetujuan').checked,
                struktur
              };
              try {
                if (lembarLama) {
                  await updateLembar(lembarLama.id, payload);
                } else {
                  await buatLembar({ ...payload, tujuan_pembelajaran_id: program.id, urutan: lembarList.length });
                }
                tutup(); roti('Lembar kerja disimpan.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function hapusLembarDenganKonfirmasi(l) {
    const ok = await konfirmasi(`Hapus lembar kerja "${l.judul}"?`, { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusLembar(l.id); roti('Lembar kerja dihapus.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  // ============ Lencana (Badge) ============
  function bukaDialogBadge(badgeLama) {
    const syaratLama = badgeLama?.syarat || {};
    const { tutup } = dialog({
      judul: badgeLama ? 'Edit Lencana' : 'Tambah Lencana',
      isi: el('div', {}, [
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Emoji'),
            el('input', { id: 'b-emoji', value: badgeLama?.emoji || '', style: 'text-align:center;' })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Kode'),
            el('input', { id: 'b-kode', value: badgeLama?.kode || `B${badgeList.length + 1}` })
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'XP'),
            el('input', { id: 'b-xp', type: 'number', min: '0', value: badgeLama?.xp ?? 20 })
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Nama Lencana'),
          el('input', { id: 'b-nama', value: badgeLama?.nama || '', placeholder: 'mis. Perintis Sejati' })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Deskripsi'),
          el('textarea', { id: 'b-deskripsi' }, badgeLama?.deskripsi || '')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Lingkup'),
          el('select', { id: 'b-lingkup' }, [
            el('option', { value: 'individu', selected: (badgeLama?.lingkup ?? 'individu') === 'individu' }, 'Individu'),
            el('option', { value: 'kelompok', selected: badgeLama?.lingkup === 'kelompok' }, 'Kelompok (manual saja)')
          ])
        ]),
        el('div', { class: 'panel-info', style: 'margin-bottom:8px;' }, 'Syarat otomatis opsional. Kosongkan "Jenis" untuk lencana manual-only (diberikan guru sendiri lewat halaman Nilai).'),
        el('div', { class: 'baris-medan' }, [
          el('div', { class: 'medan' }, [
            el('label', {}, 'Jenis Syarat Otomatis'),
            el('select', { id: 'b-jenis' }, [
              el('option', { value: '', selected: !syaratLama.jenis }, '— Manual saja —'),
              el('option', { value: 'jumlah_misi_selesai', selected: syaratLama.jenis === 'jumlah_misi_selesai' }, 'Jumlah misi selesai ≥'),
              el('option', { value: 'nilai_rata_rata_min', selected: syaratLama.jenis === 'nilai_rata_rata_min' }, 'Rata-rata nilai ≥')
            ])
          ]),
          el('div', { class: 'medan' }, [
            el('label', {}, 'Ambang Nilai'),
            el('input', { id: 'b-ambang', type: 'number', min: '0', value: syaratLama.nilai ?? '' })
          ])
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const nama = document.getElementById('b-nama').value.trim();
              const kode = document.getElementById('b-kode').value.trim();
              if (!nama || !kode) { roti('Kode dan nama lencana wajib diisi.', 'galat'); return; }
              const jenis = document.getElementById('b-jenis').value;
              const ambang = document.getElementById('b-ambang').value;
              const payload = {
                kode, nama,
                emoji: document.getElementById('b-emoji').value.trim() || '',
                deskripsi: document.getElementById('b-deskripsi').value.trim() || null,
                lingkup: document.getElementById('b-lingkup').value,
                xp: Number(document.getElementById('b-xp').value) || 0,
                syarat: jenis && ambang !== '' ? { jenis, nilai: Number(ambang) } : {}
              };
              try {
                if (badgeLama) await updateBadge(badgeLama.id, payload);
                else await buatBadge({ ...payload, tujuan_pembelajaran_id: program.id });
                tutup(); roti('Lencana disimpan.', 'sukses'); await muatSemua();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  async function hapusBadgeDenganKonfirmasi(b) {
    const ok = await konfirmasi(`Hapus lencana "${b.nama}"?`, { labelYa: 'Hapus' });
    if (!ok) return;
    try { await hapusBadge(b.id); roti('Lencana dihapus.', 'sukses'); await muatSemua(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function gambarTabLencana() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:12px;' }, [
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => bukaDialogBadge(null) }, '+ Tambah Lencana')
      ]),
      badgeList.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada lencana untuk program ini.')
        : el('div', { class: 'grid-kartu' }, badgeList.map(b => el('div', { class: 'kartu' }, [
            el('div', { style: 'font-size:32px;text-align:center;margin-bottom:8px;' }, b.emoji),
            el('div', { style: 'font-weight:700;text-align:center;margin-bottom:4px;' }, b.nama),
            el('div', { style: 'font-size:12px;color:var(--abu-teks);text-align:center;margin-bottom:8px;' }, b.deskripsi || '—'),
            el('div', { style: 'display:flex;justify-content:center;gap:6px;margin-bottom:10px;' }, [
              el('span', { class: 'lencana' }, `${b.xp} XP`),
              el('span', { class: 'lencana' }, b.syarat?.jenis ? 'Otomatis' : 'Manual'),
              el('span', { class: b.lingkup === 'kelompok' ? 'lencana lencana-tim' : 'lencana lencana-mandiri' }, b.lingkup)
            ]),
            el('div', { style: 'display:flex;justify-content:center;gap:6px;' }, [
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogBadge(b) }, 'Edit'),
              el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: () => hapusBadgeDenganKonfirmasi(b) }, 'Hapus')
            ])
          ])))
    ]);
  }

  // ============ Rubrik Penilaian ============
  function bukaDialogRubrik() {
    const rubrikLama = program.rubrik || { skor_maks: 4, kriteria: [] };
    const areaRanah = el('div', {});
    // Ranah disimpan terpisah selagi dialog terbuka, lalu digabungkan ke
    // kriteria saat menyimpan — supaya guru tidak perlu mengetiknya di JSON.
    const petaRanah = new Map((rubrikLama.kriteria || []).map(k => [k.nama, k.ranah || 'kognitif']));

    function bacaKriteria() {
      try { return JSON.parse(document.getElementById('rb-kriteria')?.value || '[]'); }
      catch { return null; }
    }

    function gambarRanah() {
      const daftar = bacaKriteria();
      if (!Array.isArray(daftar)) {
        isi(areaRanah, [el('div', { style: 'font-size:12px;color:var(--merah);' }, 'JSON kriteria belum valid.')]);
        return;
      }
      if (daftar.length === 0) {
        isi(areaRanah, [el('div', { style: 'font-size:12px;color:var(--abu-teks);' }, 'Belum ada kriteria.')]);
        return;
      }
      isi(areaRanah, daftar.map(k => {
        const nama = k.nama || '(tanpa nama)';
        if (!petaRanah.has(nama)) petaRanah.set(nama, k.ranah || 'kognitif');
        return el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px;' }, [
          el('span', { style: 'flex:1;font-size:13px;' }, nama),
          el('select', {
            style: 'width:150px;flex-shrink:0;',
            onchange: (e) => petaRanah.set(nama, e.target.value)
          }, [
            el('option', { value: 'kognitif', selected: petaRanah.get(nama) === 'kognitif' }, 'Kognitif'),
            el('option', { value: 'psikomotor', selected: petaRanah.get(nama) === 'psikomotor' }, 'Psikomotor'),
            el('option', { value: 'afektif', selected: petaRanah.get(nama) === 'afektif' }, 'Afektif')
          ])
        ]);
      }));
    }
    const { tutup } = dialog({
      judul: 'Rubrik Penilaian Program',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Bila rubrik diisi, halaman Nilai akan menampilkan pilihan level per kriteria dan menghitung nilai akhir otomatis: (total skor ÷ (jumlah kriteria × skor maks)) × 100. Kosongkan untuk memakai input angka 0–100 biasa.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Skor Maksimal per Kriteria'),
          el('input', { id: 'rb-maks', type: 'number', min: '1', value: rubrikLama.skor_maks ?? 4 })
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Kriteria (JSON)'),
          el('textarea', {
            id: 'rb-kriteria', style: 'font-family:monospace;font-size:11px;min-height:180px;',
            oninput: () => gambarRanah()
          }, JSON.stringify(rubrikLama.kriteria || [], null, 2)),
          el('div', { class: 'keterangan' },
            'Contoh: [{"nama":"Jumlah dan ragam gagasan","bagian":"D","level":{"4":"Lebih dari 10 gagasan","3":"Minimal 10 gagasan","1":"Kurang dari 10"}}]')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Ranah Tiap Kriteria'),
          el('div', { class: 'keterangan', style: 'margin:0 0 8px;' },
            'Menentukan kriteria ini masuk nilai kognitif, psikomotor, atau afektif di Rekap Nilai. ' +
            'Kriteria yang tidak ditandai dihitung sebagai kognitif.'),
          areaRanah
        ]),
        el('div', { style: 'display:flex;justify-content:space-between;gap:8px;margin-top:8px;' }, [
          el('button', {
            class: 'tombol tombol-bahaya tombol-kecil',
            onclick: async () => {
              try { program = await updateProgram(program.id, { rubrik: null }); tutup(); roti('Rubrik dihapus.', 'sukses'); }
              catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Hapus Rubrik'),
          el('div', { style: 'display:flex;gap:8px;' }, [
            el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
            el('button', {
              class: 'tombol tombol-primer',
              onclick: async () => {
                let kriteria;
                try { kriteria = JSON.parse(document.getElementById('rb-kriteria').value || '[]'); }
                catch { roti('JSON kriteria tidak valid.', 'galat'); return; }
                if (!Array.isArray(kriteria) || kriteria.length === 0) { roti('Isi minimal satu kriteria.', 'galat'); return; }
                const skor_maks = Number(document.getElementById('rb-maks').value) || 4;
                const kriteriaBerRanah = kriteria.map(k => ({
                  ...k, ranah: petaRanah.get(k.nama) || k.ranah || 'kognitif'
                }));
                try {
                  program = await updateProgram(program.id, { rubrik: { skor_maks, kriteria: kriteriaBerRanah } });
                  tutup(); roti('Rubrik disimpan.', 'sukses');
                } catch (err) { roti(pesanGalat(err), 'galat'); }
              }
            }, 'Simpan')
          ])
        ])
      ])
    });
    gambarRanah();
  }

  // ============ Pertanyaan Refleksi Kustom ============
  function bukaDialogRefleksi() {
    const lama = program.prompt_refleksi || [];
    const { tutup } = dialog({
      judul: 'Pertanyaan Refleksi',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Pertanyaan ini muncul di tab Refleksi murid. Kosongkan untuk memakai 3 pertanyaan bawaan.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Kapan refleksi diisi'),
          el('select', { id: 'rf-mode' }, [
            el('option', { value: 'program', selected: !program.refleksi_per_tahap },
              'Sekali untuk seluruh program (disarankan)'),
            el('option', { value: 'tahap', selected: !!program.refleksi_per_tahap },
              'Terpisah di setiap tahap')
          ]),
          el('div', { class: 'keterangan' },
            'Pertanyaan refleksi biasanya menanyakan keseluruhan proses, sehingga cukup diisi sekali di akhir. ' +
            'Pilih "terpisah di setiap tahap" hanya bila tiap tahap program ini memang punya pelajaran yang berbeda.')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Daftar Pertanyaan (satu per baris)'),
          el('textarea', {
            id: 'rf-daftar', style: 'min-height:150px;',
            placeholder: 'Apa yang memudahkan munculnya gagasan dalam kelompok kami?\nApa yang menghambat munculnya gagasan?'
          }, lama.map(p => p.label).join('\n'))
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const baris = document.getElementById('rf-daftar').value
                .split('\n').map(t => t.trim()).filter(Boolean);
              const daftarBaru = baris.length === 0 ? null
                : baris.map((label, i) => ({ key: `q${i + 1}`, label }));
              const perTahap = document.getElementById('rf-mode').value === 'tahap';
              try {
                program = await updateProgram(program.id, {
                  prompt_refleksi: daftarBaru,
                  refleksi_per_tahap: perTahap
                });
                tutup(); roti('Pengaturan refleksi disimpan.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  // ============ Render ============
  function gambarTabTahap() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:12px;' }, [
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => bukaDialogSprint(null) }, '+ Tambah Tahap')
      ]),
      sprints.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada Tahap Inkubasi. Tambahkan tahap pertama untuk mulai menyusun misi.')
        : el('div', { class: 'daftar-baris' }, sprints.map(gambarSprint))
    ]);
  }

  function gambarSprint(s) {
    const terbuka = sprintTerbuka.has(s.id);
    return el('div', { class: 'kartu', style: 'padding:0;overflow:hidden;' }, [
      el('div', {
        class: 'baris-item', style: 'border:none;border-radius:0;cursor:pointer;',
        onclick: () => { terbuka ? sprintTerbuka.delete(s.id) : sprintTerbuka.add(s.id); render(); }
      }, [
        el('span', { class: 'pil-tahap' }, String(s.nomor)),
        el('div', { class: 'isi-utama' }, [
          el('div', { class: 'judul-baris' }, s.nama),
          el('div', { class: 'meta-baris' }, `${s.tugas.length} misi${s.jp ? ` · ${s.jp} JP` : ''}`)
        ]),
        el('div', { class: 'aksi-baris' }, [
          el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: (e) => { e.stopPropagation(); bukaDialogSprint(s); } }, 'Edit'),
          el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: (e) => { e.stopPropagation(); hapusSprintDenganKonfirmasi(s); } }, 'Hapus')
        ]),
        el('span', { style: 'color:var(--abu-teks-halus);' }, terbuka ? '▾' : '▸')
      ]),
      terbuka ? el('div', { style: 'padding:12px 16px 16px;border-top:1px solid var(--garis-halus);background:var(--netral);' }, [
        s.tugas.length === 0
          ? el('div', { style: 'color:var(--abu-teks);font-size:13px;margin-bottom:10px;' }, 'Belum ada misi di tahap ini.')
          : el('div', { class: 'daftar-baris', style: 'margin-bottom:10px;' }, s.tugas.map(t => gambarTugas(s, t))),
        el('button', { class: 'tombol tombol-sekunder tombol-kecil', onclick: () => bukaDialogTugas(s, null) }, '+ Tambah Misi')
      ]) : null
    ]);
  }

  function gambarTugas(sprint, t) {
    return el('div', { class: 'baris-item', style: 'background:#fff;' }, [
      el('span', { class: t.sifat_kerja === 'kelompok' ? 'lencana lencana-tim' : 'lencana lencana-mandiri' },
        t.sifat_kerja === 'kelompok' ? 'Kelompok' : 'Mandiri'),
      el('div', { class: 'isi-utama' }, [
        el('div', { class: 'judul-baris' }, `${t.kode} — ${t.judul}`),
        el('div', { class: 'meta-baris' }, `${t.xp} XP · ${t.jenis}${t.wajib_bukti ? ' · wajib bukti' : ''}`)
      ]),
      el('div', { class: 'aksi-baris' }, [
        el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogTugas(sprint, t) }, 'Edit'),
        el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: () => hapusTugasDenganKonfirmasi(t) }, 'Hapus')
      ])
    ]);
  }

  function gambarTabLembar() {
    return el('div', {}, [
      el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:12px;' }, [
        el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: () => bukaDialogLembar(null) }, '+ Tambah Lembar Kerja')
      ]),
      lembarList.length === 0
        ? el('div', { class: 'kartu-kosong' }, 'Belum ada lembar kerja. Lembar kerja adalah "worksheet" yang akan diisi murid — mis. kanvas BMC, matriks riset, formulir refleksi.')
        : el('div', { class: 'daftar-baris' }, lembarList.map(l => el('div', { class: 'baris-item' }, [
            el('span', { class: 'lencana' }, LABEL_TIPE_LEMBAR[l.tipe] || l.tipe),
            el('div', { class: 'isi-utama' }, [
              el('div', { class: 'judul-baris' }, `${l.kode} — ${l.judul}`),
              el('div', { class: 'meta-baris' }, l.milik_kelompok ? 'Dikerjakan berkelompok' : 'Dikerjakan individu')
            ]),
            el('div', { class: 'aksi-baris' }, [
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => bukaDialogLembar(l) }, 'Edit'),
              el('button', { class: 'tombol tombol-bahaya tombol-kecil', onclick: () => hapusLembarDenganKonfirmasi(l) }, 'Hapus')
            ])
          ])))
    ]);
  }

  function render() {
    if (memuat) {
      isi(root, renderShell({
        profil, judulHalaman: 'Memuat…', onKeluar,
        konten: el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat program…')
      }));
      return;
    }
    if (galat || !program) {
      isi(root, renderShell({
        profil, judulHalaman: 'Program tidak ditemukan', onKeluar,
        konten: el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);border-color:#ffbdad;color:var(--merah);' }, galat || 'Program tidak ditemukan.')
      }));
      return;
    }
    isi(root, renderShell({
      profil,
      judulHalaman: program.judul,
      sub: program.kode || '',
      onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [
          el('a', { href: '#/guru' }, '← Program Inkubasi')
        ]),
        el('div', { class: 'header-halaman' }, [
          el('div', {}, [
            program.deskripsi ? el('p', { style: 'color:var(--abu-teks);max-width:600px;' }, program.deskripsi) : null
          ]),
          el('div', { style: 'display:flex;gap:8px;flex-shrink:0;' }, [
            el('button', { class: 'tombol tombol-sekunder', onclick: bukaDialogEditProgram }, 'Edit Detail'),
            el('button', { class: 'tombol tombol-sekunder', onclick: bukaDialogRubrik }, ikonTeks('rubrik', 'Rubrik')),
            el('button', { class: 'tombol tombol-sekunder', onclick: bukaDialogRefleksi }, ikonTeks('refleksi', 'Refleksi')),
            el('button', {
              class: program.terbit ? 'tombol tombol-sekunder' : 'tombol tombol-primer',
              onclick: ubahTerbit
            }, program.terbit ? 'Jadikan Draf' : 'Terbitkan')
          ])
        ]),
        el('div', { class: 'deret-tab' }, [
          gambarTabTombol('tahap', 'Tahap & Misi'),
          gambarTabTombol('lembar', 'Lembar Kerja'),
          gambarTabTombol('lencana', `Lencana (${badgeList.length})`)
        ]),
        tab === 'tahap' ? gambarTabTahap() : tab === 'lembar' ? gambarTabLembar() : gambarTabLencana()
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
