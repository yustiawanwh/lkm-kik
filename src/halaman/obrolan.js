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
  ambilPengaturanLampiran, lampirkanGambar, lampiranUntukPesan,
  tinjauLampiran, hapusBerkasLampiran, urlLampiran,
  LABEL_JENIS, NAMA_HARI
} from '../lib/data-obrolan.js';

export async function renderObrolan(root, { profil, onKeluar, kanalId }) {
  const guru = profil.peran === 'guru' || profil.peran === 'admin';
  let memuat = true, galat = '';
  let kanalList = [], belumTerbaca = new Map(), jamLayanan = null;
  let kanalAktif = null, pesanList = [], daftarBisuKanal = [];
  let petaLampiran = new Map(), aturanLampiran = null, berkasTerpilih = null;
  let lepasKanal = null;
  let mengirim = false;

  async function muat() {
    memuat = true; render();
    try {
      [kanalList, belumTerbaca, jamLayanan, aturanLampiran] = await Promise.all([
        daftarKanal(), hitungBelumTerbaca(profil.id), ambilJamLayanan(), ambilPengaturanLampiran()
      ]);
      if (kanalId) await bukaKanal(kanalId);
    } catch (err) { galat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  async function bukaKanal(id) {
    try {
      kanalAktif = await ambilKanal(id);
      pesanList = await daftarPesan(id);
      petaLampiran = await lampiranUntukPesan(pesanList.map(p => p.id));
      daftarBisuKanal = guru ? await daftarBisu(id) : [];
      await tandaiDibaca(id, profil.id);
      belumTerbaca.delete(id);

      lepasKanal?.();
      lepasKanal = pantauPesan(id,
        async () => {
          pesanList = await daftarPesan(id);
          petaLampiran = await lampiranUntukPesan(pesanList.map(p => p.id));
          await tandaiDibaca(id, profil.id);
          render(); gulirKeBawah();
        },
        async () => {
          pesanList = await daftarPesan(id);
          petaLampiran = await lampiranUntukPesan(pesanList.map(p => p.id));
          render();
        }
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

  /** Baris kedua pada daftar kanal. Tanpa ini, guru yang mengampu beberapa
   *  kelas akan melihat "Kelompok 1" berkali-kali tanpa bisa membedakan
   *  milik kelas mana. */
  function ketKanal(k) {
    const bagian = [];
    if (k.jenis !== 'kelas' && k.kelas?.nama) bagian.push(k.kelas.nama);
    if (k.ditutup) bagian.push('Ditutup');
    return bagian.join(' · ');
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
              ketKanal(k) ? el('div', { class: 'meta-baris' }, ketKanal(k)) : null
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
      gambarLampiran(p),
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

  /** Lampiran pada satu pesan, beserta status moderasinya. */
  function gambarLampiran(p) {
    const daftar = petaLampiran.get(p.id) || [];
    if (daftar.length === 0) return null;

    return el('div', { class: 'lampiran-pesan' }, daftar.map(l => {
      // Berkas sudah dihapus guru — sisakan jejaknya saja.
      if (!l.path) {
        return el('div', { class: 'lampiran-kotak lampiran-dihapus' }, [
          ikon('peringatan', 15),
          el('span', {}, 'Gambar dihapus guru' + (l.alasan_tolak ? ` — ${l.alasan_tolak}` : ''))
        ]);
      }

      const milikSaya = l.pengirim_id === profil.id;
      const bisaLihat = l.status === 'disetujui' || milikSaya || guru;

      if (!bisaLihat) {
        return el('div', { class: 'lampiran-kotak lampiran-menunggu' }, [
          ikon('jam', 15), el('span', {}, 'Gambar menunggu persetujuan guru')
        ]);
      }

      const kotak = el('div', {
        class: 'lampiran-gambar' + (l.status !== 'disetujui' ? ' lampiran-redup' : ''),
        title: l.nama_asli || ''
      }, 'Memuat…');

      urlLampiran(l.path)
        .then(url => {
          isi(kotak, [el('img', { src: url, alt: l.nama_asli || 'lampiran' })]);
          kotak.onclick = () => dialog({
            judul: l.nama_asli || 'Gambar',
            isi: el('img', { src: url, style: 'max-width:70vw;max-height:70vh;border-radius:var(--radius-sm);' })
          });
        })
        .catch(() => isi(kotak, ['Gagal memuat']));

      return el('div', {}, [
        kotak,
        // Penanda status untuk pengirim dan guru.
        l.status === 'menunggu'
          ? el('div', { class: 'lampiran-status status-menunggu' },
              milikSaya && !guru ? 'Menunggu persetujuan guru' : 'Belum ditinjau')
          : l.status === 'ditolak'
            ? el('div', { class: 'lampiran-status status-ditolak' },
                'Ditolak' + (l.alasan_tolak ? ` — ${l.alasan_tolak}` : ''))
            : null,
        // Alat moderasi guru.
        guru ? el('div', { class: 'lampiran-aksi' }, [
          l.status !== 'disetujui' ? el('button', {
            class: 'tombol tombol-primer tombol-kecil',
            onclick: async () => {
              try {
                await tinjauLampiran(l.id, 'disetujui', profil.id, null);
                petaLampiran = await lampiranUntukPesan(pesanList.map(x => x.id));
                render(); roti('Gambar disetujui dan kini terlihat.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Setujui') : null,
          l.status !== 'ditolak' ? el('button', {
            class: 'tombol tombol-sekunder tombol-kecil',
            onclick: () => tolakLampiran(l, false)
          }, 'Tolak') : null,
          el('button', {
            class: 'tombol tombol-bahaya tombol-kecil',
            onclick: () => tolakLampiran(l, true)
          }, 'Hapus Berkas')
        ]) : null
      ]);
    }));
  }

  /** Tolak lampiran; bila hapusBerkas=true, berkasnya dihapus permanen dari
   *  penyimpanan. Baris jejaknya tetap ada supaya tetap dapat ditelusuri. */
  function tolakLampiran(l, hapusBerkas) {
    const { tutup } = dialog({
      judul: hapusBerkas ? 'Hapus Berkas Gambar' : 'Tolak Gambar',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' },
          hapusBerkas
            ? 'Berkas gambar dihapus permanen dari penyimpanan dan tidak bisa dikembalikan. Catatan siapa yang mengirim, kapan, dan siapa yang menghapus tetap tersimpan.'
            : 'Gambar disembunyikan dari murid lain, tetapi berkasnya masih tersimpan dan bisa Anda setujui lagi nanti.'),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Alasan'),
          el('input', { id: 'tl-alasan', placeholder: 'mis. salah kirim, tidak berkaitan pelajaran' })
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-bahaya',
            onclick: async () => {
              const alasan = document.getElementById('tl-alasan').value.trim();
              try {
                if (hapusBerkas) await hapusBerkasLampiran(l, profil.id);
                else await tinjauLampiran(l.id, 'ditolak', profil.id, alasan);
                tutup();
                petaLampiran = await lampiranUntukPesan(pesanList.map(x => x.id));
                render();
                roti(hapusBerkas ? 'Berkas dihapus.' : 'Gambar ditolak.', 'sukses');
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, hapusBerkas ? 'Hapus Permanen' : 'Tolak')
        ])
      ])
    });
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
    // Boleh mengirim gambar tanpa teks; isi pesannya diberi penanda.
    if ((!teks && !berkasTerpilih) || mengirim) return;
    mengirim = true; render();
    try {
      const pesanBaru = await kirimPesan(
        kanalAktif.id, profil.id, teks || '(melampirkan gambar)');
      if (berkasTerpilih) {
        await lampirkanGambar(pesanBaru.id, profil.id, berkasTerpilih, aturanLampiran?.maks_mb ?? 5);
        berkasTerpilih = null;
        roti('Gambar terkirim, menunggu persetujuan guru.', 'sukses');
      }
      pesanList = await daftarPesan(kanalAktif.id);
      petaLampiran = await lampiranUntukPesan(pesanList.map(p => p.id));
      render(); gulirKeBawah();
      const k = document.getElementById('kotak-pesan');
      if (k) { k.value = ''; k.focus(); }
    } catch (err) {
      roti(pesanGalat(err), 'galat');
    } finally { mengirim = false; render(); }
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
            [LABEL_JENIS[kanalAktif.jenis],
             kanalAktif.jenis !== 'kelas' ? kanalAktif.kelas?.nama : null,
             kanalAktif.ditutup ? 'Ditutup' : null].filter(Boolean).join(' · '))
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
          : el('div', {}, [
              berkasTerpilih ? el('div', { class: 'pratinjau-lampiran' }, [
                ikon('lampiran', 15),
                el('span', {
                  title: berkasTerpilih.name,
                  style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
                }, berkasTerpilih.name),
                el('span', { style: 'font-size:11px;color:var(--abu-teks);' },
                  `${(berkasTerpilih.size / 1024 / 1024).toFixed(1)} MB`),
                el('button', {
                  class: 'tombol tombol-hantu tombol-kecil',
                  onclick: () => { berkasTerpilih = null; render(); }
                }, ikon('tutup', 14))
              ]) : null,
              el('div', { class: 'kotak-kirim' }, [
                aturanLampiran?.aktif !== false ? el('label', {
                  class: 'tombol tombol-sekunder tombol-kecil', style: 'cursor:pointer;flex-shrink:0;',
                  title: 'Lampirkan gambar'
                }, [
                  ikon('lampiran', 16),
                  el('input', {
                    type: 'file', accept: 'image/*', style: 'display:none;',
                    onchange: (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const maks = aturanLampiran?.maks_mb ?? 5;
                      if (f.size > maks * 1024 * 1024) {
                        roti(`Ukuran gambar melebihi ${maks} MB.`, 'galat'); return;
                      }
                      berkasTerpilih = f; render();
                    }
                  })
                ]) : null,
                el('textarea', {
                  id: 'kotak-pesan', placeholder: 'Tulis pesan… (Enter mengirim, Shift+Enter baris baru)',
                  style: 'min-height:44px;max-height:120px;',
                  onkeydown: (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(); }
                  }
                }),
                el('button', {
                  class: 'tombol tombol-primer', disabled: mengirim, onclick: kirim
                }, mengirim ? 'Mengirim…' : 'Kirim')
              ]),
              berkasTerpilih ? el('div', { class: 'catatan-lampiran' },
                'Gambar akan ditinjau guru dulu sebelum terlihat oleh teman sekelas.') : null
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
