// src/halaman/lembar-kerja.js — Halaman isi Lembar Kerja murid, kolaboratif
// realtime untuk lembar milik kelompok (Fase 4).
import { el, isi, roti } from '../lib/dom.js';
import { ikon, ikonTeks } from '../lib/ikon.js';
import { pesanGalat } from '../lib/kesalahan.js';
import { renderShell } from '../lib/shell.js';
import { ambilPenugasan, ambilKelompokSaya } from '../lib/data-papan.js';
import { ambilLembar, ambilAtauBuatIsian, perbaruiSel, timpaData, anggotaKelompokLembar, misiPenaut } from '../lib/data-lembar.js';
import { bergabungSaluranLembar } from '../lib/realtime-lembar.js';
import { pasangPenyiarFokus, bacaPemakaiSel, gambarJejakSel } from '../lib/jejak-sel.js';
import { terapkanNilaiJauh, atributJalur } from '../lib/jalur-sel.js';
import { gambarKanvas, gambarTahapan, gambarKalkulator, gambarInstrumen, gambarKesepakatan, gambarLikert, gambarMatriksTerhitung } from '../lib/lembar-tipe-khas.js';
import { state } from '../main.js';

const JEDA_KETIK_MS = 500; // debounce sebelum menyimpan ke database

export async function renderLembarKerja(root, { profil, onKeluar, penugasanId, lembarId }) {
  let memuat = true, galat = '';
  let penugasan = null, lembar = null, kelompokSaya = null, isian = null;
  let anggotaKelompok = [];
  let misiTertaut = null;   // bila terisi, lembar ini milik sebuah misi
  let saluran = null;
  let anggotaOnline = new Map(); // id -> { nama, selAktif }
  let pemakaiSel = [];
  let waktuDebounce = {}; // path(string) -> timeoutId

  async function muatSemua() {
    memuat = true; render();
    try {
      penugasan = await ambilPenugasan(penugasanId);
      lembar = await ambilLembar(lembarId);
      kelompokSaya = lembar.milik_kelompok ? await ambilKelompokSaya(penugasan.kelas_id, profil.id) : null;
      anggotaKelompok = kelompokSaya ? await anggotaKelompokLembar(kelompokSaya.id) : [];
      misiTertaut = await misiPenaut(lembar, penugasan.tujuan_pembelajaran_id);
      isian = await ambilAtauBuatIsian({
        lembarKerjaId: lembarId, penugasanId,
        milikKelompok: lembar.milik_kelompok, muridId: profil.id, kelompokId: kelompokSaya?.id
      });
      bukaSaluranRealtime();
    } catch (err) {
      galat = pesanGalat(err);
    } finally {
      memuat = false; render();
    }
  }

  function bukaSaluranRealtime() {
    if (!isian) return;
    saluran = bergabungSaluranLembar(isian.id, {
      profil,
      onSelDiubah: ({ path, nilai }) => {
        // Terapkan perubahan dari anggota lain langsung ke tampilan, tanpa
        // menunggu refresh — path berupa array segmen mis. ["baris","2","k1"].
        setNilaiPath(isian.data, path, nilai);
        // terapkanNilaiJauh mencakup SEMUA tipe lembar lewat penanda
        // data-jalur; perbaruiInputDiDom lama hanya mengenali matriks &
        // formulir bawaan, jadi tipe khas (BMC, kalkulator, dsb) terlewat.
        if (!terapkanNilaiJauh(root, path, nilai)) perbaruiInputDiDom(path, nilai);
      },
      onPresenceBerubah: (s) => {
        anggotaOnline = new Map();
        for (const key of Object.keys(s)) {
          const entri = s[key][0];
          if (entri && entri.id !== profil.id) anggotaOnline.set(entri.id, entri);
        }
        pemakaiSel = bacaPemakaiSel(s, profil.id);
        gambarJejakSel(root, pemakaiSel);
        gambarUlangKehadiran();
      }
    });
    pasangPenyiarFokus(root, () => saluran);
    state.pembersihHalaman = () => { saluran?.tinggalkan(); saluran = null; };
  }

  function setNilaiPath(obj, path, nilai) {
    let cursor = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (cursor[path[i]] === undefined) cursor[path[i]] = {};
      cursor = cursor[path[i]];
    }
    cursor[path[path.length - 1]] = nilai;
  }

  function getNilaiPath(obj, path) {
    let cursor = obj;
    for (const seg of path) { cursor = cursor?.[seg]; if (cursor === undefined) return ''; }
    return cursor ?? '';
  }

  function idInput(path) { return 'sel-' + path.join('__'); }

  function perbaruiInputDiDom(path, nilai) {
    const elInput = document.getElementById(idInput(path));
    if (elInput && document.activeElement !== elInput) elInput.value = nilai;
    if (elInput) kedipSel(elInput);
  }

  function kedipSel(elInput) {
    elInput.style.transition = 'none';
    elInput.style.background = 'var(--kuning-lembut)';
    requestAnimationFrame(() => {
      elInput.style.transition = 'background 600ms ease';
      elInput.style.background = '';
    });
  }

  // ============ Simpan andal: debounce per-sel, siar langsung ============
  function ubahSel(path, nilai) {
    setNilaiPath(isian.data, path, nilai);
    saluran?.siarkanSel(path, nilai);
    const kunci = path.join('.');
    clearTimeout(waktuDebounce[kunci]);
    waktuDebounce[kunci] = setTimeout(async () => {
      try { await perbaruiSel(isian.id, path, nilai); }
      catch (err) { roti(pesanGalat(err), 'galat'); }
    }, JEDA_KETIK_MS);
  }

  function fokusSel(path) {
    saluran?.siarkanFokus(path);
  }

  // ============ Baris dinamis (Matriks/Daftar) ============
  async function tambahBaris() {
    const baris = isian.data.baris || [];
    baris.push({});
    isian.data.baris = baris;
    try { isian = await timpaData(isian.id, isian.data); render(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  async function hapusBaris(indeks) {
    const baris = isian.data.baris || [];
    baris.splice(indeks, 1);
    isian.data.baris = baris;
    try { isian = await timpaData(isian.id, isian.data); render(); }
    catch (err) { roti(pesanGalat(err), 'galat'); }
  }

  // ============ Render ============
  function gambarMatriks() {
    const kolom = lembar.struktur?.kolom || ['Kolom 1'];
    const baris = isian.data.baris || (isian.data.baris = []);
    if (baris.length === 0) baris.push({});

    const tabel = el('table', { style: 'width:100%;border-collapse:collapse;' }, [
      el('thead', {}, el('tr', {}, kolom.map(k => el('th', { style: 'text-align:left;padding:8px;border-bottom:2px solid var(--garis);font-size:13px;color:var(--abu-teks);' }, k)).concat(
        lembar.baris_dinamis ? [el('th', { style: 'width:40px;' }, '')] : []
      ))),
      el('tbody', {}, baris.map((row, i) => el('tr', {}, kolom.map((k, ki) => {
        const path = ['baris', String(i), `k${ki}`];
        return el('td', { style: 'padding:4px;border-bottom:1px solid var(--garis-halus);' }, [
          el('input', {
            id: idInput(path), ...atributJalur(path),
            value: getNilaiPath(isian.data, path),
            style: 'border:1px solid transparent;background:transparent;width:100%;',
            oninput: (e) => ubahSel(path, e.target.value),
            onfocus: () => fokusSel(path)
          })
        ]);
      }).concat(
        lembar.baris_dinamis ? [el('td', {}, el('button', { class: 'tombol tombol-hantu tombol-kecil', onclick: () => hapusBaris(i) }, ikon('tutup', 14)))] : []
      ))))
    ]);
    return el('div', {}, [
      tabel,
      lembar.baris_dinamis ? el('button', { class: 'tombol tombol-sekunder tombol-kecil', style: 'margin-top:10px;', onclick: tambahBaris }, '+ Tambah Baris') : null
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
          id: idInput(path), ...atributJalur(path),
          value: tag === 'input' ? getNilaiPath(isian.data, path) : undefined,
          oninput: (e) => ubahSel(path, e.target.value),
          onfocus: () => fokusSel(path)
        }, tag === 'textarea' ? getNilaiPath(isian.data, path) : undefined)
      ]);
    }));
  }

  function ubahSelDanRender(path, nilai) {
    ubahSel(path, nilai);
    render();
  }

  function gambarSesuaiTipe() {
    const props = {
      // Lembar yang tertaut misi TIDAK bisa diisi dari sini — hanya dari
      // dalam misi, selagi timernya berjalan. Tanpa ini, kunci timer bisa
      // ditembus cukup dengan membuka lembar lewat jalur ini.
      struktur: lembar.struktur, data: isian.data, bisaEdit: !misiTertaut, onUbah: ubahSel,
      onTambahBaris: tambahBaris, onHapusBaris: hapusBaris
    };
    switch (lembar.tipe) {
      case 'kanvas': return gambarKanvas(props);
      case 'tahapan': return gambarTahapan(props);
      case 'kalkulator': return gambarKalkulator(props);
      case 'instrumen': return gambarInstrumen(props);
      case 'kesepakatan': return gambarKesepakatan({ ...props, onUbah: ubahSelDanRender, profil, anggotaKelompok });
      case 'likert': return gambarLikert({ ...props, onUbah: ubahSelDanRender });
      case 'matriks': case 'daftar':
        return lembar.struktur?.kolom_terhitung?.length
          ? gambarMatriksTerhitung({ ...props, onUbah: ubahSelDanRender, barisDinamis: lembar.baris_dinamis })
          : gambarMatriks();
      default: return gambarFormulir();
    }
  }

  const areaKehadiran = el('div', { style: 'display:flex;gap:6px;align-items:center;' });
  function gambarUlangKehadiran() {
    isi(areaKehadiran, anggotaOnline.size === 0
      ? [el('span', { style: 'font-size:12px;color:var(--abu-teks-halus);' }, 'Hanya Anda di sini')]
      : [
          el('span', { style: 'font-size:12px;color:var(--abu-teks);' }, 'Sedang bergabung:'),
          ...[...anggotaOnline.values()].map(a => el('span', { class: 'lencana lencana-tim' }, a.nama))
        ]);
  }

  function render() {
    if (memuat) {
      isi(root, renderShell({ profil, judulHalaman: 'Memuat…', onKeluar, konten: el('div', { class: 'kartu', style: 'text-align:center;color:var(--abu-teks);padding:40px;' }, 'Memuat lembar kerja…') }));
      return;
    }
    if (galat || !lembar) {
      isi(root, renderShell({ profil, judulHalaman: 'Tidak ditemukan', onKeluar, konten: el('div', { class: 'panel-info', style: 'background:var(--merah-lembut);color:var(--merah);' }, galat || 'Lembar kerja tidak ditemukan.') }));
      return;
    }
    const isiUtama = gambarSesuaiTipe();
    isi(root, renderShell({
      profil, judulHalaman: lembar.judul, sub: penugasan?.tujuan_pembelajaran?.judul, onKeluar,
      konten: [
        el('div', { class: 'jejak-remah' }, [el('a', { href: `#/murid/papan/${penugasanId}` }, '← Kembali ke Papan Misi')]),
        lembar.keterangan ? el('p', { style: 'color:var(--abu-teks);max-width:640px;' }, lembar.keterangan) : null,
        misiTertaut ? el('div', {
          class: 'panel-info',
          style: 'margin-bottom:14px;background:var(--kuning-lembut);border-color:transparent;color:var(--kuning-teks);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;'
        }, [
          el('span', {}, `Lembar ini dikerjakan di dalam misi "${misiTertaut.kode} — ${misiTertaut.judul}". Di sini hanya bisa dibaca; buka misinya lalu tekan Mulai Mengerjakan untuk mengisi.`),
          el('a', { href: `#/murid/papan/${penugasanId}`, class: 'tombol tombol-primer tombol-kecil' }, 'Buka Papan Misi')
        ]) : null,
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;' }, [
          lembar.milik_kelompok ? el('span', { class: 'lencana lencana-tim' }, kelompokSaya ? `Kelompok: ${kelompokSaya.nama}` : 'Berkelompok') : el('span', { class: 'lencana lencana-mandiri' }, 'Individu'),
          areaKehadiran
        ]),
        el('div', { class: 'kartu' }, isiUtama)
      ]
    }));
    gambarUlangKehadiran();
    gambarJejakSel(root, pemakaiSel);
  }

  render();
  await muatSemua();
}
