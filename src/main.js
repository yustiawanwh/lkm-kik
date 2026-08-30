// src/main.js — Titik masuk aplikasi.
// Routing berbasis hash, keadaan global {profil, penugasan, kelompok}, alur autentikasi.
//
// BAHAYA DEADLOCK AUTH (PRD bagian 5): JANGAN memanggil getUser()/getSession()
// DI DALAM callback onAuthStateChange. Gunakan sesi yang sudah tersedia di
// callback (sesi.user), dan jalankan pemuatan profil DI LUAR callback lewat
// setTimeout(0). Startup diberi batas waktu agar aplikasi tidak macet bila
// sesi bermasalah.

import { supabase } from './lib/supabase.js';
import { siapkanTema } from './lib/tema.js';
import { el, isi, roti } from './lib/dom.js';
import { renderMasuk } from './halaman/masuk.js';
import { renderShell } from './lib/shell.js';
import { cocokkanRute } from './lib/rute.js';
import { renderGuru } from './halaman/guru.js';
import { renderProgramEditor } from './halaman/program-editor.js';
import { renderGuruKelasList, renderGuruKelasDetail } from './halaman/guru-kelas.js';
import { renderMurid } from './halaman/murid.js';
import { renderPapanMisi } from './halaman/papan-misi.js';
import { renderLembarKerja } from './halaman/lembar-kerja.js';
import { ambilPengaturan } from './lib/data-pengaturan.js';
import { pasangAntiSalin, lepasAntiSalin } from './lib/anti-salin.js';
import { renderKelola } from './halaman/kelola.js';
import { renderKemiripan } from './halaman/kemiripan.js';
import { renderPenilaian } from './halaman/penilaian.js';
import { renderBadgeMurid } from './halaman/badge-murid.js';
import { renderRekap } from './halaman/rekap.js';
import { renderProfil } from './halaman/profil.js';
import { renderAsesmenGuru } from './halaman/asesmen-guru.js';
import { renderPantau } from './halaman/pantau.js';

const app = document.getElementById('app');

/** Keadaan global aplikasi. */
export const state = {
  sesi: null,
  profil: null,
  penugasan: null, // konteks penugasan aktif saat membuka tiket/lembar
  kelompok: null,  // keanggotaan kelompok murid pada kelas aktif
  kanalRealtime: [], // daftar channel Supabase yang perlu di-unsubscribe saat logout
  pembersihHalaman: null // fungsi cleanup dari halaman aktif (kanal realtime, dsb), dipanggil sebelum berpindah rute
};

function bersihkanKanalRealtime() {
  for (const kanal of state.kanalRealtime) {
    try { supabase.removeChannel(kanal); } catch { /* abaikan */ }
  }
  state.kanalRealtime = [];
}

async function muatProfil(userId) {
  const { data, error } = await supabase
    .from('profil')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Pola rute yang tersedia, dicek berurutan (yang lebih spesifik duluan). */
const POLA_RUTE = [
  '#/guru/program/:id',
  '#/guru/kelas/:id',
  '#/guru/kelas',
  '#/guru/kemiripan/:penugasanId',
  '#/guru/asesmen/:penugasanId',
  '#/guru/nilai/:penugasanId',
  '#/guru/pantau/:penugasanId',
  '#/guru/rekap',
  '#/guru',
  '#/murid/lembar/:penugasanId/:lembarId',
  '#/murid/papan/:id',
  '#/murid/badge',
  '#/murid',
  '#/kelola/mapel',
  '#/kelola',
  '#/profil'
];

function haltePlaceholder(nama) {
  return () => el('div', { style: 'padding:24px;max-width:900px;margin:0 auto;' }, [
    el('div', { class: 'kartu' }, [
      el('h2', {}, `Halaman "${nama}" — segera hadir`),
      el('p', { style: 'color:var(--abu-teks)' },
        'Fase pembangunan berikutnya akan mengisi halaman ini sesuai PRD ' +
        '(kelas, papan misi murid, lembar kolaboratif, rekap nilai, dsb).')
    ])
  ]);
}

function rutePerPeran() {
  const peran = state.profil?.peran;
  if (peran === 'guru' || peran === 'admin') return '#/guru';
  return '#/murid';
}

async function route() {
  // Bersihkan halaman sebelumnya (mis. lepas kanal realtime) sebelum pindah rute.
  if (state.pembersihHalaman) {
    try { state.pembersihHalaman(); } catch { /* abaikan */ }
    state.pembersihHalaman = null;
  }
  // Dialog dipasang di document.body (bukan di #app), jadi tidak otomatis
  // hilang saat #app diganti isinya — paksa tutup dialog yang mungkin masih
  // menempel dari halaman sebelumnya (mis. dialog tiket dengan timer aktif).
  document.querySelectorAll('.dialog-latar').forEach(el => el.remove());

  if (!state.profil) {
    lepasAntiSalin();
    renderMasuk(app);
    return;
  }

  await terapkanAntiSalin();

  const hash = window.location.hash || rutePerPeran();
  const cocok = cocokkanRute(hash, POLA_RUTE) || cocokkanRute(rutePerPeran(), POLA_RUTE);
  const pola = cocok?.pola;
  const params = cocok?.params || {};
  const konteks = { profil: state.profil, onKeluar: keluar };

  if (pola === '#/guru') {
    await renderGuru(app, konteks);
  } else if (pola === '#/guru/program/:id') {
    await renderProgramEditor(app, { ...konteks, programId: params.id });
  } else if (pola === '#/guru/kelas') {
    await renderGuruKelasList(app, konteks);
  } else if (pola === '#/guru/kelas/:id') {
    await renderGuruKelasDetail(app, { ...konteks, kelasId: params.id });
  } else if (pola === '#/guru/kemiripan/:penugasanId') {
    await renderKemiripan(app, { ...konteks, penugasanId: params.penugasanId });
  } else if (pola === '#/guru/nilai/:penugasanId') {
    await renderPenilaian(app, { ...konteks, penugasanId: params.penugasanId });
  } else if (pola === '#/guru/pantau/:penugasanId') {
    await renderPantau(app, { ...konteks, penugasanId: params.penugasanId });
  } else if (pola === '#/guru/asesmen/:penugasanId') {
    await renderAsesmenGuru(app, { ...konteks, penugasanId: params.penugasanId });
  } else if (pola === '#/guru/rekap') {
    await renderRekap(app, konteks);
  } else if (pola === '#/murid') {
    await renderMurid(app, konteks);
  } else if (pola === '#/murid/papan/:id') {
    await renderPapanMisi(app, { ...konteks, penugasanId: params.id });
  } else if (pola === '#/murid/lembar/:penugasanId/:lembarId') {
    await renderLembarKerja(app, { ...konteks, penugasanId: params.penugasanId, lembarId: params.lembarId });
  } else if (pola === '#/murid/badge') {
    await renderBadgeMurid(app, konteks);
  } else if (pola === '#/profil') {
    await renderProfil(app, {
      ...konteks,
      // Perbarui nama di sidebar tanpa perlu muat ulang halaman.
      onProfilBerubah: (baru) => { state.profil = { ...state.profil, ...baru }; }
    });
  } else if (pola === '#/kelola' || pola === '#/kelola/mapel') {
    await renderKelola(app, { ...konteks, tab: pola === '#/kelola/mapel' ? 'mapel' : 'pengaturan' });
  } else {
    isi(app, renderShell({ ...konteks, judulHalaman: 'Halaman tidak ditemukan', konten: haltePlaceholder('404')() }));
  }
}

/** Pasang/lepas anti salin-tempel untuk murid berdasarkan sakelar admin
 *  (pengaturan.anti_salin). Guru & admin tidak pernah terpengaruh. */
async function terapkanAntiSalin() {
  if (state.profil?.peran !== 'murid') { lepasAntiSalin(); return; }
  try {
    const nilai = await ambilPengaturan('anti_salin');
    if (nilai?.aktif) pasangAntiSalin(); else lepasAntiSalin();
  } catch {
    lepasAntiSalin(); // gagal ambil pengaturan → jangan sampai memblokir murid tanpa sebab jelas
  }
}

async function keluar() {
  if (state.pembersihHalaman) { try { state.pembersihHalaman(); } catch { /* abaikan */ } state.pembersihHalaman = null; }
  bersihkanKanalRealtime();
  await supabase.auth.signOut();
  state.profil = null;
  state.kelompok = null;
  window.location.hash = '';
  route();
}

window.addEventListener('hashchange', route);

// ============ Alur startup dengan batas waktu ============
async function mulai() {
  let selesai = false;
  const batasWaktu = setTimeout(() => {
    if (!selesai) {
      // Sesi bermasalah / lambat — jangan biarkan aplikasi macet.
      supabase.auth.signOut().finally(() => {
        state.profil = null;
        route();
      });
    }
  }, 8000);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      state.sesi = session;
      state.profil = await muatProfil(session.user.id);
    }
  } catch (err) {
    console.error('Gagal memuat sesi awal:', err);
  } finally {
    selesai = true;
    clearTimeout(batasWaktu);
    route();
  }

  // Dengarkan perubahan status auth. TIDAK memanggil getUser()/getSession()
  // di dalam callback ini — memakai objek sesi yang sudah tersedia.
  supabase.auth.onAuthStateChange((event, sesiBaru) => {
    state.sesi = sesiBaru;
    if (event === 'SIGNED_OUT') {
      bersihkanKanalRealtime();
      state.profil = null;
      state.kelompok = null;
      window.location.hash = '';
      route();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (!sesiBaru?.user) return;

      // PENTING: peristiwa ini TIDAK selalu berarti pengguna baru saja masuk.
      // Supabase juga memancarkannya saat token disegarkan otomatis dan saat
      // tab kembali terlihat setelah pengguna berpindah ke aplikasi lain.
      // Dulu semuanya diperlakukan sebagai login baru, sehingga hash direset
      // ke dasbor dan route() menutup paksa dialog — akibatnya modal tertutup
      // sendiri dan pekerjaan yang belum disimpan hilang hanya karena
      // pengguna sempat pindah jendela.
      //
      // Jadi: pindah halaman HANYA bila ini benar-benar pergantian pengguna
      // (sebelumnya belum ada profil, atau penggunanya berbeda).
      const penggunaSama = state.profil?.id === sesiBaru.user.id;
      if (penggunaSama) return; // sudah masuk sebagai orang yang sama — jangan ganggu layar

      setTimeout(async () => {
        try {
          state.profil = await muatProfil(sesiBaru.user.id);
          window.location.hash = rutePerPeran();
          route();
        } catch (err) {
          console.error('Gagal memuat profil:', err);
          roti('Gagal memuat profil pengguna.', 'galat');
        }
      }, 0);
    }
  });
}

siapkanTema();
mulai();
