// src/lib/lembar-widget.js — Perender lembar kerja yang ditempel di dalam
// dialog tiket misi.
//
// Sejak penyatuan jalur lembar: widget ini IKUT menyalakan kanal realtime
// bila diberi `profil`. Sebelumnya kolaborasi hanya hidup di halaman lembar
// tersendiri — padahal murid justru bekerja di sini (timer dan unggah bukti
// ada di dialog misi), sehingga fitur andalan aplikasi tidak aktif di jalur
// yang paling wajar dilalui.
import { el, isi } from './dom.js';
import { simpanSel, simpanTimpa, terapkanTertunda } from './simpan-luring.js';
import { atributJalur, terapkanNilaiJauh } from './jalur-sel.js';
import { selTeks } from './sel-teks.js';
import { bergabungSaluranLembar } from './realtime-lembar.js';
import { pasangPenyiarFokus, bacaPemakaiSel, gambarJejakSel } from './jejak-sel.js';
import { gambarKanvas, gambarTahapan, gambarKalkulator, gambarInstrumen, gambarKesepakatan, gambarLikert, gambarMatriksTerhitung, gambarPeriksa, gambarFormulirUmum } from './lembar-tipe-khas.js';

const JEDA_KETIK_MS = 500;

/** Apakah isian sudah punya isi (berarti induk-induknya sudah ada di server)? */
function sudahAdaIsi(data) {
  return !!data && typeof data === 'object' && Object.keys(data).length > 0;
}

/** Bangun elemen DOM untuk mengisi satu lembar kerja.
 *  { lembar, isian, bisaEdit, onSimpanGagal, profil, anggotaKelompok } → HTMLElement */
export function buatWidgetLembar({ lembar, isian, bisaEdit, onSimpanGagal, profil, anggotaKelompok, realtime = false, tampilanGuru = false }) {
  const waktuDebounce = {};
  let saluran = null;
  let pemakaiSel = [];   // anggota lain yang sedang memegang sel

  function getNilaiPath(obj, path) {
    let cursor = obj;
    for (const seg of path) { cursor = cursor?.[seg]; if (cursor === undefined) return ''; }
    return cursor ?? '';
  }
  function setNilaiPath(obj, path, nilai) {
    let cursor = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (cursor[path[i]] === undefined) cursor[path[i]] = {};
      cursor = cursor[path[i]];
    }
    cursor[path[path.length - 1]] = nilai;
  }

  // Jalur bertingkat tidak bisa disimpan lewat perbaruiSel bila induknya
  // belum ada di server: jsonb_set hanya membuat kunci TERAKHIR, bukan
  // induknya. Untuk data yang masih kosong, jalur seperti ["butir","1"]
  // (Likert) atau ["baris","0","k0"] (Matriks) dikembalikan tanpa perubahan
  // — dan RPC-nya tetap melaporkan sukses, sehingga kegagalannya senyap.
  //
  // Karena itu tulisan PERTAMA pada sebuah isian dikirim utuh lewat
  // timpaData, yang membentuk seluruh induknya sekaligus. Tulisan
  // berikutnya kembali memakai pembaruan per sel yang jauh lebih hemat.
  // BAYANGAN ISI SERVER — diambil SEBELUM pekerjaan tertunda ditempelkan,
  // jadi isinya benar-benar yang sudah ada di sana. Dipakai untuk memutuskan
  // satu tulisan cukup dikirim per sel atau harus utuh.
  //
  // Memutuskannya per ISIAN (dulu: "apakah datanya masih kosong?") tidak
  // cukup. RPC perbarui_sel_lembar MENOLAK jalur yang induknya belum ada,
  // karena jsonb_set hanya membuat kunci terakhir. Jadi lembar yang sudah
  // berisi jawaban teks tetap menolak centang pertama pada cabang `pilihan`,
  // `periksa`, `baris`, atau `butir` — jawabannya tertulis di layar, tetapi
  // tidak pernah sampai ke server. Keputusannya harus per JALUR.
  let bayanganServer = JSON.parse(JSON.stringify(isian.data || {}));

  // Pekerjaan yang belum terkirim karena jaringan mati ditempelkan kembali
  // ke data yang baru dimuat. Tanpa ini murid melihat lembarnya KEMBALI
  // KOSONG — pekerjaannya aman di antrean, tapi tidak terlihat, dan ia akan
  // mengetiknya ulang.
  if (isian?.id) isian.data = terapkanTertunda(isian.id, isian.data || {});

  /** Apakah induk jalur ini sudah ada di server? Jalur satu tingkat selalu
   *  boleh, karena jsonb_set bisa membuat kunci terakhir. */
  function indukAdaDiServer(path) {
    if (path.length < 2) return true;
    let kursor = bayanganServer;
    for (let i = 0; i < path.length - 1; i++) {
      if (kursor === null || typeof kursor !== 'object' || !(path[i] in kursor)) return false;
      kursor = kursor[path[i]];
    }
    return kursor !== null && typeof kursor === 'object';
  }

  // Menempel sampai pengiriman utuh benar-benar berhasil. Tanpa penanda ini,
  // dua sel yang diisi berdekatan pada cabang yang sama bisa sama-sama
  // memutuskan "induk belum ada", lalu yang satu terkirim sebagai sel dan
  // ditolak karena pengiriman utuhnya belum selesai.
  let perluUtuh = !sudahAdaIsi(bayanganServer);

  function ubahSel(path, nilai) {
    if (!indukAdaDiServer(path)) perluUtuh = true;
    setNilaiPath(isian.data, path, nilai);
    saluran?.siarkanSel(path, nilai);
    const kunci = path.join('.');
    clearTimeout(waktuDebounce[kunci]);
    waktuDebounce[kunci] = setTimeout(async () => {
      try {
        // Penyimpanan lewat simpan-luring: kalau jaringan mati, pekerjaan
        // masuk antrean dan dikirim sendiri saat tersambung lagi. Galat
        // BUKAN jaringan (mis. lembar terkunci) tetap dilempar ke atas
        // supaya murid diberi tahu.
        if (perluUtuh) {
          await simpanTimpa(isian.id, isian.data);
          perluUtuh = false;
          bayanganServer = JSON.parse(JSON.stringify(isian.data));
        } else {
          await simpanSel(isian.id, path, nilai);
          setNilaiPath(bayanganServer, path, nilai);
        }
      } catch (err) { onSimpanGagal?.(err); }
    }, JEDA_KETIK_MS);
  }


  function ubahSelDanGambarUlang(path, nilai) {
    ubahSel(path, nilai);
    gambarUlang();
  }

  /** Perubahan STRUKTUR dikirim tanpa penggabungan: menghapus baris memang
   *  berarti menggantikan isinya, dan penggabungan akan memunculkannya lagi. */
  async function simpanStruktur() {
    await simpanTimpa(isian.id, isian.data, { gabung: false });
    bayanganServer = JSON.parse(JSON.stringify(isian.data));
    perluUtuh = false;
  }

  async function tambahBaris() {
    const baris = isian.data.baris || [];
    baris.push({});
    isian.data.baris = baris;
    try { await simpanStruktur(); gambarUlang(); } catch (err) { onSimpanGagal?.(err); }
  }

  async function hapusBaris(indeks) {
    const baris = isian.data.baris || [];
    baris.splice(indeks, 1);
    isian.data.baris = baris;
    try { await simpanStruktur(); gambarUlang(); } catch (err) { onSimpanGagal?.(err); }
  }

  function gambarMatriks() {
    const kolom = lembar.struktur?.kolom || ['Kolom 1'];
    const baris = isian.data.baris?.length ? isian.data.baris : (isian.data.baris = [{}]);
    const tabel = el('table', { style: 'width:100%;border-collapse:collapse;' }, [
      el('thead', {}, el('tr', {}, kolom.map(k =>
        el('th', { style: 'text-align:left;padding:6px;border-bottom:2px solid var(--garis);font-size:12px;color:var(--abu-teks);' }, k)))),
      el('tbody', {}, baris.map((row, i) => el('tr', {}, kolom.map((k, ki) => {
        const path = ['baris', String(i), `k${ki}`];
        return el('td', { class: 'sel-tabel' }, [
          selTeks({ path, nilai: getNilaiPath(isian.data, path), bisaEdit, onUbah: ubahSel })
        ]);
      }))))
    ]);
    return el('div', {}, [
      tabel,
      lembar.baris_dinamis && bisaEdit
        ? el('button', { class: 'tombol tombol-sekunder tombol-kecil', style: 'margin-top:8px;', onclick: tambahBaris }, '+ Tambah Baris')
        : null
    ]);
  }

  function gambarFormulir() {
    return gambarFormulirUmum({
      struktur: lembar.struktur, data: isian.data, bisaEdit, onUbah: ubahSel,
      sidik: isian.id || 'baru'
    });
  }

  function gambarSesuaiTipe() {
    const props = { struktur: lembar.struktur, data: isian.data, bisaEdit, onUbah: ubahSel, onTambahBaris: tambahBaris, onHapusBaris: hapusBaris };
    switch (lembar.tipe) {
      case 'kanvas': return gambarKanvas(props);
      case 'tahapan': return gambarTahapan(props);
      case 'kalkulator': return gambarKalkulator(props);
      case 'instrumen': return gambarInstrumen(props);
      case 'kesepakatan': return gambarKesepakatan({ ...props, onUbah: ubahSelDanGambarUlang, profil, anggotaKelompok });
      // Daftar Periksa memperbarui ringkasannya sendiri, jadi TIDAK digambar
      // ulang — menggambar ulang akan mencabut fokus dari kotak centang yang
      // baru ditekan.
      case 'periksa': return gambarPeriksa({ ...props, profil, anggotaKelompok });
      case 'likert': return gambarLikert({ ...props, onUbah: ubahSelDanGambarUlang });
      case 'matriks': case 'daftar':
        // Kalau guru mendefinisikan kolom_terhitung, pakai perender yang
        // menjumlah otomatis (mis. Matriks Penyaringan Gagasan).
        return lembar.struktur?.kolom_terhitung?.length
          ? gambarMatriksTerhitung({ ...props, onUbah: ubahSel, barisDinamis: lembar.baris_dinamis })
          : gambarMatriks();
      default: return gambarFormulir();
    }
  }

  const wadah = el('div', {});
  const areaKehadiran = el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;' });

  function gambarUlang() {
    isi(wadah, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;' }, [
        el('span', { style: 'font-weight:600;font-size:13px;' }, `${lembar.judul}`),
        // Lencana ini petunjuk untuk MURID. Di tampilan guru (dialog
        // penilaian) tidak relevan — guru memang hanya membaca.
        (!bisaEdit && !tampilanGuru)
          ? el('span', { class: 'lencana', style: 'background:var(--kuning-lembut);color:var(--kuning-teks);' }, 'Jalankan timer untuk mengisi')
          : null
      ]),
      areaKehadiran,
      gambarSesuaiTipe()
    ]);
    // Elemen baru setelah digambar ulang, jadi penandanya dipasang lagi.
    gambarJejakSel(wadah, pemakaiSel);
  }
  gambarUlang();

  // ---- Kolaborasi realtime (hanya untuk lembar kelompok yang bisa diedit) ----
  if (realtime && profil && isian?.id && lembar.milik_kelompok) {
    saluran = bergabungSaluranLembar(isian.id, {
      profil,
      onSelDiubah: ({ path, nilai }) => {
        setNilaiPath(isian.data, path, nilai);
        // Anggota lain berhasil menulis jalur ini, berarti induknya kini ADA
        // di server. Mencatatnya di bayangan mencegah kita mengirim seluruh
        // objek data tanpa perlu.
        setNilaiPath(bayanganServer, path, nilai);
        // Daftar Periksa menghitung ringkasan "Budi: 4/6" saat digambar, jadi
        // mencentang satu kotak dari jauh harus menggambar ulang — kalau
        // tidak, kotaknya berubah tetapi angkanya tertinggal. Aman dilakukan
        // karena tipe ini tidak punya isian teks yang bisa kehilangan fokus.
        if (lembar.tipe === 'periksa') { gambarUlang(); return; }
        // Terapkan tepat ke selnya; kalau selnya tidak ada di layar (mis.
        // baris baru dari anggota lain), gambar ulang seluruh lembar.
        if (!terapkanNilaiJauh(wadah, path, nilai)) gambarUlang();
      },
      onPresenceBerubah: (keadaan) => {
        pemakaiSel = bacaPemakaiSel(keadaan, profil.id);
        gambarJejakSel(wadah, pemakaiSel);

        const lain = [];
        for (const kunci of Object.keys(keadaan)) {
          const entri = keadaan[kunci][0];
          if (entri && entri.id !== profil.id) lain.push(entri.nama);
        }
        isi(areaKehadiran, lain.length === 0
          ? []
          : [
              el('span', { style: 'font-size:12px;color:var(--abu-teks);' }, 'Sedang bersama Anda:'),
              ...lain.map(n => el('span', { class: 'lencana lencana-tim' }, n))
            ]);
      }
    });
    pasangPenyiarFokus(wadah, () => saluran);
  }

  return {
    elemen: wadah,
    /** Wajib dipanggil saat dialog ditutup agar kanal tidak menumpuk. */
    lepas() { saluran?.tinggalkan(); saluran = null; }
  };
}
