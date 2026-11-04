// src/halaman/github-kelompok.js — Guru memeriksa jejak kerja kelompok di GitHub.
//
// Halaman ini HANYA untuk guru dan admin (lihat RLS di migrasi 003900).
// Hasilnya alat koreksi, bukan papan peringkat yang dilihat murid.
import { el, isi, roti, dialog, konfirmasi, tanggalId } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { ambilPenugasan } from '../lib/data-papan.js';
import { daftarKelompok } from '../lib/data-kelas.js';
import {
  daftarRepo, simpanRepo, simpanCuplikan, isianKelompok, usernameKelompok
} from '../lib/data-github.js';
import {
  ambilToken, simpanToken, adaToken, kuota,
  uraikanRepo, periksaRepo, ringkasKontribusi, bandingkanBerkas, berkasDariIsian
} from '../lib/github.js';

export async function renderGithubKelompok(root, { profil, onKeluar, penugasanId }) {
  let memuat = true, galatMuat = '';
  let penugasan = null, kelompokList = [], repoList = [];
  let sedangPeriksa = null;          // kelompok_id yang sedang diperiksa
  const terbuka = new Set();         // kelompok yang panel rinciannya dibuka

  async function muat() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      [kelompokList, repoList] = await Promise.all([
        daftarKelompok(penugasan.kelas_id),
        daftarRepo(penugasanId)
      ]);
    } catch (err) { galatMuat = pesanGalat(err); }
    finally { memuat = false; render(); }
  }

  const repoUntuk = (kid) => repoList.find(r => r.kelompok_id === kid) || null;

  // ---------- Token ----------
  function bukaDialogToken() {
    const kotak = el('input', {
      type: 'password', id: 'gh-token', value: ambilToken(),
      placeholder: 'github_pat_… atau ghp_…'
    });
    const { tutup } = dialog({
      judul: 'Token GitHub (opsional)',
      isi: el('div', {}, [
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;' }, [
          el('div', { style: 'font-weight:650;margin-bottom:4px;' }, 'Tanpa token pun halaman ini tetap bekerja'),
          el('div', { style: 'font-size:13px;' },
            'Tanpa token, GitHub membatasi 60 permintaan per jam — dan angka itu dihitung per alamat IP, ' +
            'jadi dibagi bersama semua komputer di jaringan sekolah. Satu kali Periksa Semua untuk 7 kelompok ' +
            'memakai 35 permintaan. Dengan token, batasnya menjadi 5.000 per jam.')
        ]),
        el('div', { class: 'panel-info', style: 'margin-bottom:12px;background:var(--kuning-lembut);color:var(--kuning-teks);border-color:transparent;' }, [
          el('div', { style: 'font-weight:650;margin-bottom:4px;' }, 'Di mana token ini disimpan'),
          el('div', { style: 'font-size:13px;' },
            'Hanya di peramban ini (localStorage). Token TIDAK dikirim ke Supabase, tidak ikut ter-deploy ke GitHub Pages, ' +
            'dan tidak bisa dilihat murid. Konsekuensinya, token perlu ditempel lagi di perangkat lain yang Anda pakai. ' +
            'Jangan memakai komputer bersama yang dipakai murid.')
        ]),
        el('div', { class: 'medan' }, [
          el('label', {}, 'Token'),
          kotak,
          el('div', { class: 'keterangan', style: 'margin:6px 0 0;' },
            'Buat di GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. ' +
            'Cukup beri akses baca (Public repositories, read-only). JANGAN beri hak tulis — halaman ini hanya membaca.')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          adaToken() ? el('button', {
            class: 'tombol tombol-bahaya',
            onclick: () => { simpanToken(''); tutup(); roti('Token dihapus dari peramban ini.', 'sukses'); render(); }
          }, 'Hapus Token') : null,
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: () => {
              const ok = simpanToken(document.getElementById('gh-token').value);
              if (!ok) { roti('Peramban ini menolak menyimpan token (mode privat?).', 'galat'); return; }
              tutup(); roti('Token disimpan di peramban ini.', 'sukses'); render();
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  // ---------- Alamat repositori ----------
  function bukaDialogAlamat(kelompok) {
    const r = repoUntuk(kelompok.id);
    const kotak = el('input', {
      id: 'gh-alamat',
      value: r?.pemilik && r?.nama ? `${r.pemilik}/${r.nama}` : '',
      placeholder: 'https://github.com/pemilik/nama-repo'
    });
    const penanda = el('div', { class: 'keterangan', style: 'margin:6px 0 0;' });

    const { tutup } = dialog({
      judul: `Alamat Repositori — ${kelompok.nama}`,
      isi: el('div', {}, [
        el('div', { class: 'medan' }, [
          el('label', {}, 'Alamat GitHub'),
          kotak, penanda,
          el('button', {
            class: 'tombol tombol-sekunder tombol-kecil', style: 'margin-top:8px;',
            onclick: async (e) => {
              // Alamatnya sudah ditulis murid di lembar Identitas. Membacanya
              // dari sana jauh lebih cepat daripada guru menyalin 7 alamat.
              e.currentTarget.disabled = true;
              penanda.textContent = 'Mencari di lembar kerja kelompok…';
              try {
                const semua = await isianKelompok(penugasanId, kelompok.id);
                const teks = JSON.stringify(semua);
                const ketemu = uraikanRepo(teks.match(/github\.com[/:][A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/)?.[0] || '');
                if (ketemu) {
                  kotak.value = `${ketemu.pemilik}/${ketemu.nama}`;
                  penanda.textContent = 'Ditemukan di lembar kerja kelompok ini.';
                } else {
                  penanda.textContent = 'Tidak ada alamat GitHub di lembar kerja kelompok ini. Ketik manual.';
                }
              } catch (err) { penanda.textContent = pesanGalat(err); }
              finally { e.currentTarget.disabled = false; }
            }
          }, 'Ambil dari Lembar Kerja')
        ]),
        el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => tutup() }, 'Batal'),
          el('button', {
            class: 'tombol tombol-primer',
            onclick: async () => {
              const teks = document.getElementById('gh-alamat').value.trim();
              const u = teks ? uraikanRepo(teks) : null;
              if (teks && !u) {
                roti('Alamat itu tidak terbaca. Contoh yang benar: https://github.com/pemilik/nama-repo', 'galat');
                return;
              }
              try {
                await simpanRepo({
                  penugasanId, kelompokId: kelompok.id,
                  pemilik: u?.pemilik, nama: u?.nama
                });
                tutup(); roti('Alamat disimpan.', 'sukses'); await muat();
              } catch (err) { roti(pesanGalat(err), 'galat'); }
            }
          }, 'Simpan')
        ])
      ])
    });
  }

  // ---------- Pemeriksaan ----------
  async function periksaSatu(kelompok, { diam = false } = {}) {
    const r = repoUntuk(kelompok.id);
    if (!r?.pemilik || !r?.nama) {
      if (!diam) roti(`${kelompok.nama} belum punya alamat repositori.`, 'galat');
      return false;
    }
    sedangPeriksa = kelompok.id; render();
    try {
      const cuplikan = await periksaRepo({ pemilik: r.pemilik, nama: r.nama });
      await simpanCuplikan({ penugasanId, kelompokId: kelompok.id, cuplikan });
      terbuka.add(kelompok.id);
      return true;
    } catch (err) {
      await simpanCuplikan({ penugasanId, kelompokId: kelompok.id, galat: err.message })
        .catch(() => { /* kegagalan mencatat galat tidak perlu menutupi galat aslinya */ });
      if (!diam) roti(err.message, 'galat');
      // Kuota habis: tidak ada gunanya meneruskan ke kelompok berikutnya.
      if (err.jenis === 'kuota') throw err;
      return false;
    } finally {
      sedangPeriksa = null;
    }
  }

  async function periksaSemua() {
    const punyaAlamat = kelompokList.filter(k => {
      const r = repoUntuk(k.id);
      return r?.pemilik && r?.nama;
    });
    if (punyaAlamat.length === 0) {
      roti('Belum ada kelompok yang alamat repositorinya diisi.', 'galat');
      return;
    }

    const perlu = punyaAlamat.length * 5;
    const sisa = kuota.sisa;
    const peringatan = (sisa !== null && sisa < perlu)
      ? `\n\nPeringatan: sisa kuota GitHub tinggal ${sisa} permintaan, sedangkan ini memerlukan ${perlu}. Sebagian kelompok akan gagal diperiksa.`
      : '';
    const ok = await konfirmasi(
      `Periksa ${punyaAlamat.length} kelompok? Ini memakai ${perlu} permintaan dari kuota GitHub.` + peringatan,
      { labelYa: 'Periksa', labelTidak: 'Batal' });
    if (!ok) return;

    let berhasil = 0, gagal = 0;
    try {
      for (const k of punyaAlamat) {
        const hasil = await periksaSatu(k, { diam: true });
        hasil ? berhasil++ : gagal++;
      }
    } catch (err) {
      roti(err.message, 'galat');
    }
    await muat();
    roti(`${berhasil} kelompok diperiksa` + (gagal ? `, ${gagal} gagal` : '') + '.', gagal ? 'info' : 'sukses');
  }

  // ---------- Tampilan rincian ----------
  async function gambarRincian(kelompok, wadah) {
    const r = repoUntuk(kelompok.id);
    const c = r?.cuplikan;
    if (!c || !c.repo) {
      isi(wadah, [el('div', { class: 'keterangan', style: 'margin:0;' }, 'Belum pernah diperiksa.')]);
      return;
    }

    isi(wadah, [el('div', { class: 'keterangan', style: 'margin:0;' }, 'Memuat nama anggota…')]);

    let anggota = [], berkasJanji = [];
    try {
      const [u, semuaIsian] = await Promise.all([
        usernameKelompok(penugasanId, kelompok.id),
        isianKelompok(penugasanId, kelompok.id)
      ]);
      anggota = u;
      berkasJanji = berkasDariIsian(semuaIsian);
    } catch { /* tetap tampilkan cuplikannya walau nama tidak terbaca */ }

    const rk = ringkasKontribusi(c, anggota);
    const bandingan = bandingkanBerkas(c.berkasHtml || [], berkasJanji);
    const takBermakna = (c.commit || []).filter(x => !x.bermakna);

    function kotakAngka(label, nilai, nada) {
      return el('div', { class: 'kotak-angka' + (nada ? ` nada-${nada}` : '') }, [
        el('div', { class: 'angka' }, String(nilai)),
        el('div', { class: 'label-angka' }, label)
      ]);
    }

    isi(wadah, [
      // --- Ringkasan angka ---
      el('div', { class: 'deret-angka' }, [
        kotakAngka('Commit', (c.commit || []).length),
        kotakAngka('Bermakna', (c.commit || []).filter(x => x.bermakna).length,
          takBermakna.length > 0 ? 'ingat' : 'baik'),
        kotakAngka('Issue', (c.issue || []).length),
        kotakAngka('Issue tertutup', (c.issue || []).filter(i => i.status === 'closed').length),
        kotakAngka('Komentar commit', (c.komentarCommit || []).length,
          (c.komentarCommit || []).length === 0 ? 'ingat' : 'baik'),
        kotakAngka('Berkas .html', (c.berkasHtml || []).length)
      ]),

      // --- Pages & README ---
      el('div', { class: 'daftar-baris', style: 'margin-bottom:14px;' }, [
        el('div', { class: 'baris-item' }, [
          el('span', {
            class: 'lencana',
            style: c.repo.pagesAktif ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : ''
          }, c.repo.pagesAktif ? '✓' : '—'),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, 'GitHub Pages'),
            el('div', { class: 'meta-baris' }, c.repo.pagesAktif ? c.repo.alamatPages : 'Belum dinyalakan')
          ]),
          c.repo.pagesAktif
            ? el('a', {
                class: 'tombol tombol-sekunder tombol-kecil',
                href: c.repo.alamatPages, target: '_blank', rel: 'noopener noreferrer'
              }, 'Buka')
            : null
        ]),
        el('div', { class: 'baris-item' }, [
          el('span', {
            class: 'lencana',
            style: c.adaReadme ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : ''
          }, c.adaReadme ? '✓' : '—'),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, 'README.md'),
            el('div', { class: 'meta-baris' }, c.adaReadme ? 'Ada — periksa isinya memuat Kanvas Konsep' : 'Belum ada')
          ])
        ])
      ]),

      // --- Kontribusi per murid ---
      el('div', { class: 'judul-grup' }, [el('span', {}, 'Kontribusi Tiap Anggota')]),
      anggota.length === 0
        ? el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
            'Username GitHub anggota belum terkumpul. Isi lewat menu Peran pada penugasan ini — ' +
            'tiap peran punya kolom "Username GitHub" yang diisi pemegangnya. Tanpa itu, commit tidak bisa dicocokkan ke nama murid.')
        : el('div', { style: 'overflow-x:auto;margin-bottom:14px;' }, [
            el('table', { class: 'tabel-periksa' }, [
              el('thead', {}, el('tr', {}, [
                el('th', { style: 'text-align:left;' }, 'Anggota'),
                el('th', { class: 'kolom-centang' }, 'Commit'),
                el('th', { class: 'kolom-centang' }, 'Bermakna'),
                el('th', { class: 'kolom-centang' }, 'Issue'),
                el('th', { class: 'kolom-centang' }, 'Ditutup'),
                el('th', { class: 'kolom-centang' }, 'Komentar')
              ])),
              el('tbody', {}, rk.perMurid.map(m => el('tr', {}, [
                el('td', {}, [
                  el('div', {}, (m.no_absen ? `${m.no_absen}. ` : '') + m.nama),
                  el('div', { style: 'font-size:11.5px;color:var(--abu-teks);' },
                    m.username ? `@${m.username}` : 'username GitHub belum diisi')
                ]),
                el('td', { class: 'kolom-centang', style: m.commit === 0 ? 'color:var(--merah);font-weight:700;' : '' }, String(m.commit)),
                el('td', { class: 'kolom-centang' }, String(m.bermakna)),
                el('td', { class: 'kolom-centang' }, String(m.issueDitugaskan)),
                el('td', { class: 'kolom-centang' }, String(m.issueDitutup)),
                el('td', { class: 'kolom-centang' }, String(m.komentar))
              ])))
            ])
          ]),

      // Commit dari akun yang tidak cocok ke murid mana pun. Ini penting
      // ditampilkan: kalau disembunyikan, guru mengira anggota itu tidak
      // bekerja padahal hanya username-nya yang belum terdaftar.
      rk.takDikenal.length > 0
        ? el('div', { class: 'panel-info', style: 'margin-bottom:14px;' }, [
            el('div', { style: 'font-weight:650;margin-bottom:4px;' }, 'Ada kontribusi dari akun yang belum dikenali'),
            el('div', { style: 'font-size:13px;' },
              rk.takDikenal.map(x => `${x.label} (${x.commit} commit, ${x.komentar} komentar)`).join(' · ') +
              ' — kemungkinan username GitHub-nya belum diisi di menu Peran, atau surel pada commit tidak tertaut ke akun GitHub-nya.')
          ])
        : null,

      // --- Pesan commit yang perlu diperbaiki ---
      takBermakna.length > 0
        ? el('details', { style: 'margin-bottom:14px;' }, [
            el('summary', { style: 'cursor:pointer;font-weight:650;font-size:13px;' },
              `${takBermakna.length} pesan commit belum bermakna`),
            el('div', { class: 'daftar-baris', style: 'margin-top:8px;' }, takBermakna.slice(0, 20).map(x =>
              el('div', { class: 'baris-item' }, [
                el('code', { style: 'font-size:11px;color:var(--abu-teks);flex-shrink:0;' }, x.sha),
                el('div', { class: 'isi-utama' }, [
                  el('div', { class: 'judul-baris' }, x.pesan || '(kosong)'),
                  el('div', { class: 'meta-baris' }, `${x.sebab} · ${x.login ? '@' + x.login : x.namaPenulis || 'tanpa nama'}`)
                ])
              ])))
          ])
        : null,

      // --- Issue ---
      (c.issue || []).length > 0
        ? el('details', { style: 'margin-bottom:14px;' }, [
            el('summary', { style: 'cursor:pointer;font-weight:650;font-size:13px;' },
              `Daftar Issue (${c.issue.length})`),
            el('div', { class: 'daftar-baris', style: 'margin-top:8px;' }, c.issue.map(i =>
              el('div', { class: 'baris-item' }, [
                el('span', {
                  class: 'lencana',
                  style: i.status === 'closed' ? 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' : ''
                }, `#${i.nomor}`),
                el('div', { class: 'isi-utama' }, [
                  el('div', { class: 'judul-baris' }, i.judul),
                  el('div', { class: 'meta-baris' },
                    (i.ditugaskan.length ? 'ditugaskan ke ' + i.ditugaskan.map(x => '@' + x).join(', ') : 'belum ditugaskan ke siapa pun') +
                    ` · ${i.status === 'closed' ? 'tertutup' : 'masih terbuka'}`)
                ])
              ])))
          ])
        : el('div', { class: 'panel-info', style: 'margin-bottom:14px;' },
            'Kelompok ini belum membuat Issue satu pun. Pada LKM, Issue dibuat Penjaga Waktu — satu Issue per halaman.'),

      // --- Berkas dijanjikan vs nyata ---
      el('div', { class: 'judul-grup' }, [el('span', {}, 'Berkas Halaman')]),
      el('div', { class: 'daftar-baris' }, [
        ...bandingan.sudahDibuat.map(f => el('div', { class: 'baris-item' }, [
          el('span', { class: 'lencana', style: 'background:var(--hijau-lembut);color:var(--hijau-teks);border-color:transparent;' }, '✓'),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, f),
            el('div', { class: 'meta-baris' }, 'dijanjikan di lembar kerja, dan sudah ada di repositori')
          ])
        ])),
        ...bandingan.belumDibuat.map(f => el('div', { class: 'baris-item' }, [
          el('span', { class: 'lencana', style: 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;' }, '!'),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, f),
            el('div', { class: 'meta-baris' }, 'dijanjikan di lembar kerja, tetapi BELUM ada di repositori')
          ])
        ])),
        ...bandingan.takDijanjikan.map(f => el('div', { class: 'baris-item' }, [
          el('span', { class: 'lencana' }, '+'),
          el('div', { class: 'isi-utama' }, [
            el('div', { class: 'judul-baris' }, f),
            el('div', { class: 'meta-baris' }, 'ada di repositori, tidak disebut di lembar kerja')
          ])
        ])),
        (bandingan.sudahDibuat.length + bandingan.belumDibuat.length + bandingan.takDijanjikan.length) === 0
          ? el('div', { class: 'baris-item' }, el('div', { class: 'isi-utama' },
              el('div', { class: 'meta-baris' }, 'Belum ada berkas .html, dan belum ada nama berkas yang disebut di lembar kerja.')))
          : null
      ])
    ]);
  }

  // ---------- Kerangka halaman ----------
  function gambarBarisKelompok(k) {
    const r = repoUntuk(k.id);
    const adaAlamat = !!(r?.pemilik && r?.nama);
    const adaCuplikan = !!r?.cuplikan?.repo;
    const wadahRincian = el('div', { style: 'margin-top:12px;' });

    const kartu = el('div', { class: 'kartu', style: 'padding:12px;margin-bottom:10px;' }, [
      el('div', { style: 'display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;' }, [
        el('div', { class: 'isi-utama', style: 'min-width:200px;' }, [
          el('div', { style: 'font-weight:650;' }, k.nama),
          el('div', { class: 'meta-baris' }, adaAlamat
            ? `${r.pemilik}/${r.nama}`
            : 'Alamat repositori belum diisi'),
          r?.galat
            ? el('div', { style: 'font-size:12.5px;color:var(--merah);margin-top:4px;' }, r.galat)
            : (adaCuplikan
                ? el('div', { style: 'font-size:12px;color:var(--abu-teks);margin-top:4px;' },
                    `Diperiksa ${tanggalId(r.diambil_pada, true)}`)
                : null)
        ]),
        el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;' }, [
          adaAlamat ? el('a', {
            class: 'tombol tombol-hantu tombol-kecil',
            href: `https://github.com/${r.pemilik}/${r.nama}`,
            target: '_blank', rel: 'noopener noreferrer'
          }, 'Buka Repo') : null,
          el('button', {
            class: 'tombol tombol-hantu tombol-kecil',
            onclick: () => bukaDialogAlamat(k)
          }, ikonTeks('ubah', adaAlamat ? 'Alamat' : 'Isi Alamat')),
          el('button', {
            class: 'tombol tombol-sekunder tombol-kecil',
            disabled: !adaAlamat || sedangPeriksa === k.id,
            onclick: async () => {
              const ok = await periksaSatu(k).catch(() => false);
              await muat();
              if (ok) roti(`${k.nama} diperiksa.`, 'sukses');
            }
          }, sedangPeriksa === k.id ? 'Memeriksa…' : 'Periksa'),
          adaCuplikan ? el('button', {
            class: 'tombol tombol-primer tombol-kecil',
            onclick: (e) => {
              if (terbuka.has(k.id)) { terbuka.delete(k.id); isi(wadahRincian, []); e.currentTarget.textContent = 'Lihat Hasil'; }
              else { terbuka.add(k.id); gambarRincian(k, wadahRincian); e.currentTarget.textContent = 'Tutup'; }
            }
          }, terbuka.has(k.id) ? 'Tutup' : 'Lihat Hasil') : null
        ])
      ]),
      wadahRincian
    ]);

    if (terbuka.has(k.id) && adaCuplikan) gambarRincian(k, wadahRincian);
    return kartu;
  }

  function render() {
    const sisaTeks = kuota.sisa === null
      ? 'Sisa kuota belum diketahui — akan tampil setelah pemeriksaan pertama.'
      : `Sisa kuota GitHub: ${kuota.sisa}${kuota.batas ? ' dari ' + kuota.batas : ''} permintaan` +
        (kuota.pulih ? `, pulih pukul ${kuota.pulih.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : '');

    const konten = memuat
      ? el('div', { class: 'kartu', style: 'padding:40px;text-align:center;color:var(--abu-teks);' }, 'Memuat…')
      : galatMuat
        ? el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah-teks);border-color:transparent;' }, galatMuat)
        : el('div', {}, [
            el('div', { class: 'panel-info', style: 'margin-bottom:14px;' }, [
              el('div', { style: 'font-weight:650;margin-bottom:4px;' },
                adaToken() ? 'Memakai token — batas 5.000 permintaan per jam' : 'Tanpa token — batas 60 permintaan per jam'),
              el('div', { style: 'font-size:13px;' },
                sisaTeks + '. Tiap kelompok memakai 5 permintaan sekali periksa. ' +
                'Hasilnya tersimpan, jadi membuka halaman ini lagi tidak memakai kuota.')
            ]),
            el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px;flex-wrap:wrap;' }, [
              el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: bukaDialogToken },
                ikonTeks('gembok', adaToken() ? 'Ubah Token' : 'Pasang Token')),
              el('button', { class: 'tombol tombol-primer tombol-kecil', onclick: periksaSemua },
                ikonTeks('mulai', 'Periksa Semua'))
            ]),
            kelompokList.length === 0
              ? el('div', { class: 'kartu-kosong' }, 'Belum ada kelompok di kelas ini.')
              : el('div', {}, kelompokList.map(gambarBarisKelompok))
          ]);

    isi(root, renderShell({
      profil, judulHalaman: 'Periksa GitHub',
      sub: penugasan?.tujuan_pembelajaran?.judul || '',
      onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [
          el('a', { href: penugasan?.kelas_id ? `#/guru/kelas/${penugasan.kelas_id}` : '#/guru/kelas' }, '← Kelas')
        ]),
        konten
      ]
    }));
  }

  render();
  await muat();
}
