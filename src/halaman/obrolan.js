// src/halaman/obrolan.js — Ruang obrolan: kanal kelas, kelompok, dan
// percakapan privat guru–murid.
//
// Catatan penting: isi pesan SELALU dilewatkan teksKeHtml() sebelum
// ditampilkan. Pesan adalah masukan bebas dari pengguna, jadi ini permukaan
// XSS paling rawan di aplikasi — tidak boleh pernah masuk innerHTML mentah.
import { el, isi, roti, dialog, konfirmasi, tanggalId } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { teksKeHtml } from '../lib/teks.js';
import { navigasi } from '../lib/rute.js';
import { state } from '../main.js';
import {
  daftarKanal, ambilKanal, daftarPesan, kirimPesan, ubahSembunyiPesan,
  ubahTutupKanal, daftarBisu, bisukan, cabutBisu, tandaiDibaca,
  hitungBelumTerbaca, pantauPesan, ambilJamLayanan, sedangJamLayanan,
  LABEL_JENIS, NAMA_HARI
} from '../lib/data-obrolan.js';

export async function renderObrolan(root, { profil, onKeluar, kanalId }) {
  const guru = profil.peran === 'guru' || profil.peran === 'admin';
  let memuat = true, galat = '';
  let kanalList = [], belumTerbaca = new Map(), jamLayanan = null;
  let kanalAktif = null, pesanList = [], daftarBisuKanal = [];
  let lepasKanal = null;
  let mengirim = false;

  async function muat() {
    memuat = true; render();
    try {
      [kanalList, belumTerbaca, jamLayanan] = await Promise.all([
        daftarKanal(), hitungBelumTerbaca(profil.id), ambilJamLayanan()
      ]);
      if (kanalId) await bukaKanal(kanalId);
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  async function bukaKanal(id) {
    try {
      kanalAktif = await ambilKanal(id);
      pesanList = await daftarPesan(id);
      daftarBisuKanal = guru ? await daftarBisu(id) : [];
      await tandaiDibaca(id, profil.id);
      belumTerbaca.delete(id);

      lepasKanal?.();
      lepasKanal = pantauPesan(id,
        async (baru) => {
          // Muat ulang satu pesan agar data pengirimnya ikut terbawa.
          pesanList = await daftarPesan(id);
          await tandaiDibaca(id, profil.id);
          render(); gulirKeBawah();
        },
        async () => { pesanList = await daftarPesan(id); render(); }
      );
      state.pembersihHalaman = () => { lepasKanal?.(); lepasKanal = null; };
    } catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  function gulirKeBawah() {
    const area = document.getElementById('area-pesan');
    if (area) area.scrollTop = area.scrollHeight;
  }

  function namaKanal(k) {
    if (k.jenis === 'kelas') return `Kelas ${k.kelas?.nama || ''}`.trim();
    if (k.jenis === 'kelompok') return k.kelompok?.nama || 'Kelompok';
    return guru ? (k.murid?.nama || 'Murid') : 'Guru';
  }

  // ---------- Daftar kanal ----------
  function gambarDaftarKanal() {
    if (kanalList.length === 0) {
      return el('div', { class: 'kartu-kosong' },
        guru ? 'Belum ada kanal. Kanal kelas dan kelompok dibuat otomatis saat Anda membuat kelas atau kelompok.'
             : 'Belum ada ruang obrolan untuk Anda.');
    }
    const urut = { kelas: 0, kelompok: 1, privat: 2 };
    return el('div', { class: 'daftar-baris' },
      [...kanalList].sort((a, b) => (urut[a.jenis] - urut[b.jenis]) || namaKanal(a).localeCompare(namaKanal(b)))
        .map(k => {
          const jumlah = belumTerbaca.get(k.id) || 0;
          const aktif = kanalAktif?.id === k.id;
          return el('div', {
            class: 'baris-item' + (aktif ? ' baris-terpilih' : ''),
            style: 'cursor:pointer;',
            onclick: () => navigasi(`#/obrolan/${k.id}`)
          }, [
            el('span', { class: k.jenis === 'privat' ? 'lencana' : 'lencana lencana-tim' }, LABEL_JENIS[k.jenis]),
            el('div', { class: 'isi-utama' }, [
              el('div', { class: 'judul-baris' }, namaKanal(k)),
              k.ditutup ? el('div', { class: 'meta-baris' }, 'Ditutup') : null
            ]),
            jumlah > 0 ? el('span', { class: 'jumlah-belum' }, String(jumlah)) : null
          ]);
        }));
  }

  // ---------- Gelembung pesan ----------
  function gambarPesan(p) {
    const sendiri = p.pengirim_id === profil.id;
    const dariGuru = p.pengirim?.peran === 'guru' || p.pengirim?.peran === 'admin';

    // Pesan tersembunyi: murid hanya melihat penandanya, guru tetap bisa
    // membaca isinya agar riwayat moderasi tetap dapat ditinjau.
    if (p.disembunyikan && !guru) {
      return el('div', { class: 'pesan pesan-disembunyikan' },
        'Pesan ini disembunyikan oleh guru.');
    }

    return el('div', { class: `pesan ${sendiri ? 'pesan-sendiri' : ''}${p.disembunyikan ? ' pesan-redup' : ''}` }, [
      el('div', { class: 'pesan-kepala' }, [
        el('span', { style: 'font-weight:600;' }, sendiri ? 'Anda' : (p.pengirim?.nama || 'Pengguna')),
        dariGuru && !sendiri ? el('span', { class: 'lencana', style: 'padding:0 6px;' }, 'Guru') : null,
        el('span', { style: 'color:var(--abu-teks-halus);font-size:11px;' }, tanggalId(p.dibuat_pada, true))
      ]),
      el('div', { class: 'pesan-isi', html: teksKeHtml(p.isi) }),
      p.disembunyikan && guru
        ? el('div', { style: 'font-size:11px;color:var(--merah);margin-top:4px;' },
            `Disembunyikan${p.alasan_sembunyi ? ` — ${p.alasan_sembunyi}` : ''}`)
        : null,
      guru ? el('div', { class: 'pesan-aksi' }, [
        el('button', {
          class: 'tombol tombol-hantu tombol-kecil',
          onclick: () => moderasiPesan(p)
        }, p.disembunyikan ? 'Tampilkan' : 'Sembunyikan')
      ]) : null
    ]);
  }

  async function moderasiPesan(p) {
    if (p.disembunyikan) {
      try {
        await ubahSembunyiPesan(p.id, false, profil.id, null);
        pesanList = await daftarPesan(kanalAktif.id); render();
        roti('Pesan ditampilkan kembali.', 'sukses');
      } catch (err) { roti(pesanGalat(err), 'galat'); }
      return;
    }
    const { tutup } = dialog({
      judul: 'Sembunyikan Pesan',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Pesan tidak pernah dihapus — hanya disembunyikan dari murid. Isinya tetap dapat Anda baca sebagai catatan.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Alasan (terlihat oleh guru saja)'),
          el('input', { id: 'md-alasan', placeholder: 'mis. tidak sopan, di luar topik' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              try {
                await ubahSembunyiPesan(p.id, true, profil.id, document.getElementById('md-alasan').value.trim());
                tutup(); pesanList = await daftarPesan(kanalAktif.id); render();
                roti('Pesan disembunyikan.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Sembunyikan')
        ])
      ])
    });
  }

  // ---------- Moderasi kanal ----------
  function bukaDialogModerasi() {
    const { tutup } = dialog({
      judul: 'Moderasi Kanal',
      isi: el('div', {}, [
        el('div', { class: 'kartu', style: 'padding:12px;margin-bottom:10px;' }, [
          el('div', { style: 'font-weight:600;margin-bottom:6px;' },
            kanalAktif.ditutup ? 'Buka Kembali Kanal' : 'Tutup Kanal'),
          el('div', { style: 'font-size:13px;color:var(--abu-teks);margin-bottom:10px;' },
            kanalAktif.ditutup
              ? 'Anggota dapat mengirim pesan lagi.'
              : 'Tidak ada yang bisa mengirim pesan baru, termasuk Anda. Pesan lama tetap terbaca.'),
          el('button', {
            class: 'tombol tombol-sekunder',
            onclick: async () => {
              try {
                await ubahTutupKanal(kanalAktif.id, !kanalAktif.ditutup);
                tutup(); await bukaKanal(kanalAktif.id); kanalList = await daftarKanal(); render();
                roti('Status kanal diperbarui.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, kanalAktif.ditutup ? 'Buka Kembali' : 'Tutup Kanal')
        ]),
        el('div', { class: 'kartu', style: 'padding:12px;' }, [
          el('div', { style: 'font-weight:600;margin-bottom:6px;' }, 'Murid Dibisukan'),
          daftarBisuKanal.length === 0
            ? el('div', { style: 'font-size:13px;color:var(--abu-teks);' }, 'Tidak ada.')
            : el('div', { class: 'daftar-baris' }, daftarBisuKanal.map(b => el('div', { class: 'baris-item', style: 'padding:8px 10px;' }, [
                el('div', { class: 'isi-utama' }, [
                  el('div', { style: 'font-size:13px;font-weight:550;' }, b.murid?.nama || b.murid_id),
                  el('div', { class: 'meta-baris' },
                    b.sampai ? `Sampai ${tanggalId(b.sampai, true)}` : 'Sampai dicabut')
                ]),
                el('button', {
                  class: 'tombol tombol-hantu tombol-kecil',
                  onclick: async () => {
                    try {
                      await cabutBisu(b.id); daftarBisuKanal = await daftarBisu(kanalAktif.id);
                      tutup(); render(); roti('Pembisuan dicabut.', 'sukses');
                    } catch (err) { roti(pesanGalat(err), 'galat'); }
                  }
                }, 'Cabut')
              ])))
        ])
      ])
    });
  }

  function bukaDialogBisu(muridId, namaMurid) {
    const { tutup } = dialog({
      judul: `Bisukan ${namaMurid}`,
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          'Murid tetap bisa membaca kanal ini, tetapi tidak bisa mengirim pesan sampai waktunya habis atau Anda mencabutnya.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Lama'),
          el('select', { id: 'bs-lama' }, [
            el('option', { value: '15' }, '15 menit'),
            el('option', { value: '60', selected: true }, '1 jam'),
            el('option', { value: '1440' }, '1 hari'),
            el('option', { value: '' }, 'Sampai dicabut')
          ])
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Alasan (opsional)'),
          el('input', { id: 'bs-alasan' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              const lama = document.getElementById('bs-lama').value;
              try {
                await bisukan(kanalAktif.id, muridId, profil.id, lama ? Number(lama) : null,
                  document.getElementById('bs-alasan').value.trim());
                tutup(); daftarBisuKanal = await daftarBisu(kanalAktif.id); render();
                roti('Murid dibisukan di kanal ini.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Bisukan')
        ])
      ])
    });
  }

  // ---------- Kotak kirim ----------
  async function kirim() {
    const kotak = document.getElementById('kotak-pesan');
    const teks = kotak?.value?.trim();
    if (!teks || mengirim) return;
    mengirim = true;
    try {
      await kirimPesan(kanalAktif.id, profil.id, teks);
      kotak.value = '';
      pesanList = await daftarPesan(kanalAktif.id);
      render(); gulirKeBawah();
    } catch (err) {
      roti(pesanGalat(err), 'galat');
    } finally { mengirim = false; }
  }

  function gambarRuang() {
    if (!kanalAktif) {
      return el('div', { class: 'kartu-kosong' }, 'Pilih ruang obrolan di sebelah kiri.');
    }
    const diLuarJam = !sedangJamLayanan(jamLayanan);
    const sayaDibisukan = !guru && daftarBisuKanal.some(b => b.murid_id === profil.id);

    return el('div', { class: 'ruang-obrolan' }, [
      el('div', { class: 'kepala-obrolan' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:650;' }, namaKanal(kanalAktif)),
          el('div', { style: 'font-size:12px;color:var(--abu-teks);' },
            LABEL_JENIS[kanalAktif.jenis] + (kanalAktif.ditutup ? ' · Ditutup' : ''))
        ]),
        guru ? el('button', {
          class: 'tombol tombol-sekunder tombol-kecil', onclick: bukaDialogModerasi
        }, ikonTeks('pengaturan', 'Moderasi')) : null
      ]),

      kanalAktif.jenis === 'privat'
        ? el('div', { class: 'panel-info', style: 'border-radius:0;border-left:none;border-right:none;' },
            'Percakapan ini tercatat permanen dan dapat dibaca admin sekolah. Pesan tidak dapat dihapus oleh siapa pun.')
        : el('div', { class: 'panel-info', style: 'border-radius:0;border-left:none;border-right:none;' },
            'Semua pesan di ruang ini terbaca oleh guru dan seluruh anggota. Tidak ada pesan pribadi antar murid.'),

      el('div', { class: 'area-pesan', id: 'area-pesan' },
        pesanList.length === 0
          ? [el('div', { style: 'text-align:center;color:var(--abu-teks-halus);padding:30px;font-size:13px;' }, 'Belum ada pesan.')]
          : pesanList.map(gambarPesan)),

      diLuarJam && jamLayanan?.aktif
        ? el('div', { class: 'catatan-jam' }, [
            ikon('jam', 14),
            el('span', {}, `Di luar jam layanan (${jamLayanan.mulai}–${jamLayanan.selesai} WIB, ` +
              `${(jamLayanan.hari || []).map(h => NAMA_HARI[h].slice(0, 3)).join('/')}). ` +
              (jamLayanan.catatan || ''))
          ])
        : null,

      kanalAktif.ditutup
        ? el('div', { class: 'kotak-kirim', style: 'color:var(--abu-teks);font-size:13px;' }, 'Kanal ini ditutup guru.')
        : sayaDibisukan
          ? el('div', { class: 'kotak-kirim', style: 'color:var(--merah);font-size:13px;' }, 'Anda sedang dibisukan di kanal ini.')
          : el('div', { class: 'kotak-kirim' }, [
              el('textarea', {
                id: 'kotak-pesan', placeholder: 'Tulis pesan… (Enter mengirim, Shift+Enter baris baru)',
                style: 'min-height:44px;max-height:120px;',
                onkeydown: (e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(); }
                }
              }),
              el('button', { class: 'tombol tombol-primer', onclick: kirim }, 'Kirim')
            ])
    ]);
  }

  function render() {
    const konten = memuat
      ? el('div', { class: 'kartu', style: 'padding:40px;text-align:center;color:var(--abu-teks);' }, 'Memuat…')
      : galat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat)
        : el('div', { class: 'tata-obrolan' }, [
            el('div', {}, [
              el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:8px;color:var(--abu-teks);' }, 'Ruang Obrolan'),
              gambarDaftarKanal()
            ]),
            gambarRuang()
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Obrolan',
      sub: guru ? 'Kelas, kelompok, dan percakapan privat dengan murid.' : 'Bertanya ke guru dan berdiskusi dengan kelompok.',
      onKeluar, konten
    }));
    if (kanalAktif) gulirKeBawah();
  }

  render();
  await muat();
}
