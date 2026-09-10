// src/lib/lembar-widget.js — Perender lembar kerja yang ditempel di dalam
// dialog tiket misi.
//
// Sejak penyatuan jalur lembar: widget ini IKUT menyalakan kanal realtime
// bila diberi `profil`. Sebelumnya kolaborasi hanya hidup di halaman lembar
// tersendiri — padahal murid justru bekerja di sini (timer dan unggah bukti
// ada di dialog misi), sehingga fitur andalan aplikasi tidak aktif di jalur
// yang paling wajar dilalui.
import { el, isi } from './dom.js';
import { perbaruiSel, timpaData } from './data-lembar.js';
import { atributJalur, terapkanNilaiJauh } from './jalur-sel.js';
import { selTeks } from './sel-teks.js';
import { bergabungSaluranLembar } from './realtime-lembar.js';
import { pasangPenyiarFokus, bacaPemakaiSel, gambarJejakSel } from './jejak-sel.js';
import { gambarKanvas, gambarTahapan, gambarKalkulator, gambarInstrumen, gambarKesepakatan, gambarLikert, gambarMatriksTerhitung } from './lembar-tipe-khas.js';

const JEDA_KETIK_MS = 500;

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

  function ubahSel(path, nilai) {
    setNilaiPath(isian.data, path, nilai);
    saluran?.siarkanSel(path, nilai);
    const kunci = path.join('.');
    clearTimeout(waktuDebounce[kunci]);
    waktuDebounce[kunci] = setTimeout(async () => {
      try { await perbaruiSel(isian.id, path, nilai); }
      catch (err) { onSimpanGagal?.(err); }
    }, JEDA_KETIK_MS);
  }

  function ubahSelDanGambarUlang(path, nilai) {
    ubahSel(path, nilai);
    gambarUlang();
  }

  async function tambahBaris() {
    const baris = isian.data.baris || [];
    baris.push({});
    isian.data.baris = baris;
    try { await timpaData(isian.id, isian.data); gambarUlang(); } catch (err) { onSimpanGagal?.(err); }
  }

  async function hapusBaris(indeks) {
    const baris = isian.data.baris || [];
    baris.splice(indeks, 1);
    isian.data.baris = baris;
    try { await timpaData(isian.id, isian.data); gambarUlang(); } catch (err) { onSimpanGagal?.(err); }
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
    const medanList = lembar.struktur?.medan?.length ? lembar.struktur.medan : [{ key: 'catatan', label: 'Catatan', tipe: 'textarea' }];
    return el('div', {}, medanList.map(m => {
      const path = [m.key];
      const tag = m.tipe === 'textarea' ? 'textarea' : 'input';
      return el('div', { class: 'medan' }, [
        el('label', {}, m.label || m.key),
        el(tag, {
          ...atributJalur(path),
          value: tag === 'input' ? getNilaiPath(isian.data, path) : undefined,
          disabled: !bisaEdit,
          oninput: (e) => ubahSel(path, e.target.value)
        }, tag === 'textarea' ? getNilaiPath(isian.data, path) : undefined)
      ]);
    }));
  }

  function gambarSesuaiTipe() {
    const props = { struktur: lembar.struktur, data: isian.data, bisaEdit, onUbah: ubahSel, onTambahBaris: tambahBaris, onHapusBaris: hapusBaris };
    switch (lembar.tipe) {
      case 'kanvas': return gambarKanvas(props);
      case 'tahapan': return gambarTahapan(props);
      case 'kalkulator': return gambarKalkulator(props);
      case 'instrumen': return gambarInstrumen(props);
      case 'kesepakatan': return gambarKesepakatan({ ...props, onUbah: ubahSelDanGambarUlang, profil, anggotaKelompok });
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
