// src/lib/data-rekap.js — Rekap nilai per kelas, termasuk nilai tiga ranah
// (kognitif, psikomotor, afektif).
//
// Bahannya sudah tersimpan sejak Fase 5–6:
//  - progres_tugas.nilai_rubrik  → skor tiap kriteria saat guru menilai
//  - tujuan_pembelajaran.rubrik  → definisi kriteria beserta ranahnya
//  - observasi_sikap             → catatan sikap oleh guru
// Modul ini yang menyatukannya menjadi angka per ranah.
import { supabase } from './supabase.js';
import { ambilSemua } from './query.js';

export const RANAH = ['kognitif', 'psikomotor', 'afektif'];
export const LABEL_RANAH = { kognitif: 'Kognitif', psikomotor: 'Psikomotor', afektif: 'Afektif' };

const PENGATURAN_BAWAAN = {
  tampilkan: true,
  sumber_afektif: 'gabungan',
  pakai_bobot: false,
  bobot: { kognitif: 50, psikomotor: 25, afektif: 25 }
};

export async function ambilPengaturanRanah() {
  const { data, error } = await supabase
    .from('pengaturan').select('nilai').eq('kunci', 'ranah').maybeSingle();
  if (error) throw error;
  return { ...PENGATURAN_BAWAAN, ...(data?.nilai || {}) };
}

/** Rata-rata sederhana, mengabaikan nilai kosong. null bila tidak ada isi. */
function rata(daftar) {
  const angka = daftar.filter(n => typeof n === 'number' && !isNaN(n));
  return angka.length ? angka.reduce((a, b) => a + b, 0) / angka.length : null;
}

/**
 * Rekap satu kelas: rata-rata nilai, nilai per ranah, misi selesai, XP, badge.
 */
export async function rekapKelas(kelasId) {
  const aturan = await ambilPengaturanRanah();

  const { data: pendaftaran, error: e1 } = await supabase
    .from('pendaftaran').select('murid_id, profil:murid_id(nama, email, no_absen)').eq('kelas_id', kelasId);
  if (e1) throw e1;

  const { data: penugasanList, error: e2 } = await supabase
    .from('penugasan')
    .select('id, tujuan_pembelajaran:tujuan_pembelajaran_id(id, judul, rubrik)')
    .eq('kelas_id', kelasId);
  if (e2) throw e2;
  const penugasanIds = penugasanList.map(p => p.id);

  // Peta penugasan → rubrik programnya, untuk menerjemahkan nilai_rubrik.
  const rubrikPenugasan = new Map(
    penugasanList.map(p => [p.id, p.tujuan_pembelajaran?.rubrik || null])
  );

  let progresList = [];
  if (penugasanIds.length > 0) {
    progresList = await ambilSemua((dari, ke) =>
      supabase.from('progres_tugas')
        .select('penugasan_id, murid_id, kelompok_id, nilai_angka, nilai_rubrik, xp_diberikan, status')
        .in('penugasan_id', penugasanIds).eq('status', 'selesai').range(dari, ke)
    );
  }

  // Ratakan progres kelompok ke tiap anggotanya.
  const kelompokIds = [...new Set(progresList.filter(p => p.kelompok_id).map(p => p.kelompok_id))];
  const petaAnggota = new Map();
  if (kelompokIds.length > 0) {
    const { data: anggota, error: e3 } = await supabase
      .from('anggota_kelompok').select('kelompok_id, murid_id').in('kelompok_id', kelompokIds);
    if (e3) throw e3;
    for (const a of anggota) {
      const arr = petaAnggota.get(a.kelompok_id) || [];
      arr.push(a.murid_id);
      petaAnggota.set(a.kelompok_id, arr);
    }
  }

  const nilaiPerMurid = new Map();     // murid -> [nilai misi]
  const selesaiPerMurid = new Map();
  const skorRanah = new Map();         // murid -> { kognitif: [persen], ... }

  function siapkan(muridId) {
    if (!nilaiPerMurid.has(muridId)) {
      nilaiPerMurid.set(muridId, []);
      selesaiPerMurid.set(muridId, 0);
      skorRanah.set(muridId, { kognitif: [], psikomotor: [], afektif: [] });
    }
  }

  /** Ubah rincian rubrik satu misi menjadi persentase per ranah. */
  function persenRanahDariRubrik(nilaiRubrik, rubrik) {
    if (!nilaiRubrik || !rubrik?.kriteria?.length) return null;
    const maks = Number(rubrik.skor_maks) || 4;
    const kumpul = { kognitif: [], psikomotor: [], afektif: [] };

    rubrik.kriteria.forEach((k, i) => {
      const skor = Number(nilaiRubrik[k.nama ?? i]);
      if (isNaN(skor)) return;
      // Kriteria tanpa penanda ranah dianggap kognitif — pilihan yang
      // paling tidak mengejutkan untuk rubrik lama yang belum ditandai.
      const ranah = RANAH.includes(k.ranah) ? k.ranah : 'kognitif';
      kumpul[ranah].push((skor / maks) * 100);
    });

    const hasil = {};
    for (const r of RANAH) hasil[r] = rata(kumpul[r]);
    return hasil;
  }

  function catat(muridId, baris) {
    siapkan(muridId);
    if (baris.nilai_angka !== null && baris.nilai_angka !== undefined) {
      nilaiPerMurid.get(muridId).push(Number(baris.nilai_angka));
    }
    selesaiPerMurid.set(muridId, selesaiPerMurid.get(muridId) + 1);

    const persen = persenRanahDariRubrik(baris.nilai_rubrik, rubrikPenugasan.get(baris.penugasan_id));
    if (persen) {
      for (const r of RANAH) {
        if (persen[r] !== null) skorRanah.get(muridId)[r].push(persen[r]);
      }
    }
  }

  for (const p of progresList) {
    if (p.murid_id) catat(p.murid_id, p);
    else if (p.kelompok_id) {
      for (const muridId of (petaAnggota.get(p.kelompok_id) || [])) catat(muridId, p);
    }
  }

  // ---- Observasi sikap → persentase (skala 1–5) ----
  const { data: sikapList, error: e4 } = await supabase
    .from('observasi_sikap').select('murid_id, skor').eq('kelas_id', kelasId);
  if (e4) throw e4;

  const sikapPerMurid = new Map();
  for (const s of sikapList) {
    const nilai = Object.values(s.skor || {}).map(Number).filter(n => !isNaN(n));
    if (!nilai.length) continue;
    const arr = sikapPerMurid.get(s.murid_id) || [];
    arr.push((rata(nilai) / 5) * 100);
    sikapPerMurid.set(s.murid_id, arr);
  }

  // ---- Statistik XP & badge ----
  const { data: statistikList, error: e5 } = await supabase
    .from('statistik_murid').select('*').in('murid_id', pendaftaran.map(p => p.murid_id));
  if (e5) throw e5;
  const petaStatistik = new Map(statistikList.map(s => [s.murid_id, s]));

  // ---- Susun baris ----
  return {
    aturan,
    baris: pendaftaran.map(pd => {
      const id = pd.murid_id;
      const ranahMentah = skorRanah.get(id) || { kognitif: [], psikomotor: [], afektif: [] };

      const kognitif = rata(ranahMentah.kognitif);
      const psikomotor = rata(ranahMentah.psikomotor);
      const afektifRubrik = rata(ranahMentah.afektif);
      const afektifSikap = rata(sikapPerMurid.get(id) || []);

      // Aturan yang diminta: bila salah satu kosong pakai yang ada,
      // bila keduanya ada dirata-rata.
      let afektif = null;
      if (aturan.sumber_afektif === 'rubrik') afektif = afektifRubrik;
      else if (aturan.sumber_afektif === 'sikap') afektif = afektifSikap;
      else afektif = rata([afektifRubrik, afektifSikap]);

      const nilaiMisi = rata(nilaiPerMurid.get(id) || []);

      // Nilai akhir: berbobot ranah bila diaktifkan, selain itu rata-rata
      // nilai misi seperti sebelumnya. Ranah yang kosong tidak menyeret
      // nilai turun — bobotnya dinormalkan ulang.
      let nilaiAkhir = nilaiMisi;
      if (aturan.pakai_bobot) {
        const komponen = [
          { nilai: kognitif, bobot: Number(aturan.bobot?.kognitif) || 0 },
          { nilai: psikomotor, bobot: Number(aturan.bobot?.psikomotor) || 0 },
          { nilai: afektif, bobot: Number(aturan.bobot?.afektif) || 0 }
        ].filter(k => k.nilai !== null && k.bobot > 0);
        const totalBobot = komponen.reduce((t, k) => t + k.bobot, 0);
        nilaiAkhir = totalBobot > 0
          ? komponen.reduce((t, k) => t + k.nilai * k.bobot, 0) / totalBobot
          : null;
      }

      const stat = petaStatistik.get(id);
      return {
        muridId: id,
        nama: pd.profil?.nama || id,
        email: pd.profil?.email || '',
        noAbsen: pd.profil?.no_absen || '',
        kognitif, psikomotor, afektif,
        afektifRubrik, afektifSikap,
        nilaiMisi,
        rataRata: nilaiAkhir,
        misiSelesai: selesaiPerMurid.get(id) || 0,
        totalXp: stat?.total_xp ?? 0,
        jumlahBadge: stat?.jumlah_badge ?? 0
      };
    }).sort((a, b) => (a.noAbsen || 999) - (b.noAbsen || 999) || a.nama.localeCompare(b.nama))
  };
}

/** Ubah rekap jadi teks CSV siap unduh. */
export function rekapKeCSV(baris, aturan) {
  const header = ['No Absen', 'Nama', 'Email'];
  if (aturan?.tampilkan) header.push('Kognitif', 'Psikomotor', 'Afektif');
  header.push('Nilai Akhir', 'Misi Selesai', 'Total XP', 'Jumlah Badge');

  const lines = [header.join(',')];
  const angka = (n) => (n === null || n === undefined) ? '' : n.toFixed(1);

  for (const b of baris) {
    const kolom = [b.noAbsen, csvAman(b.nama), csvAman(b.email)];
    if (aturan?.tampilkan) kolom.push(angka(b.kognitif), angka(b.psikomotor), angka(b.afektif));
    kolom.push(angka(b.rataRata), b.misiSelesai, b.totalXp, b.jumlahBadge);
    lines.push(kolom.join(','));
  }
  return lines.join('\n');
}

function csvAman(teks) {
  const t = String(teks ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
