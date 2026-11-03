// src/lib/data-obrolan.js — Obrolan kelas, kelompok, dan privat guru–murid.
import { supabase } from './supabase.js';
import { ambilSemua } from './query.js';
import { unggahBukti, urlBukti, hapusBuktiDariStorage } from './bukti.js';

export const LABEL_JENIS = { kelas: 'Kelas', kelompok: 'Kelompok', privat: 'Privat' };

/** Daftar kanal yang boleh dibaca pengguna ini. RLS yang menyaringnya —
 *  murid hanya melihat kanal kelasnya, kelompoknya, dan privatnya sendiri. */
export async function daftarKanal() {
  const { data, error } = await supabase
    .from('kanal')
    .select('*, kelas:kelas_id(id, nama), kelompok:kelompok_id(id, nama), murid:murid_id(id, nama)')
    .order('jenis');
  if (error) throw error;
  return data;
}

export async function ambilKanal(id) {
  const { data, error } = await supabase
    .from('kanal')
    .select('*, kelas:kelas_id(id, nama), kelompok:kelompok_id(id, nama), murid:murid_id(id, nama)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Buka (atau buat) kanal privat guru–murid. Hanya guru/admin yang boleh
 *  membuatnya; murid membalas di kanal yang sudah ada. */
export async function bukaKanalPrivat(kelasId, muridId) {
  const { data: ada, error: e1 } = await supabase
    .from('kanal').select('*')
    .eq('kelas_id', kelasId).eq('jenis', 'privat').eq('murid_id', muridId).maybeSingle();
  if (e1) throw e1;
  if (ada) return ada;

  const { data, error } = await supabase
    .from('kanal').insert({ kelas_id: kelasId, jenis: 'privat', murid_id: muridId })
    .select().single();
  if (error) throw error;
  return data;
}

export async function daftarPesan(kanalId) {
  return ambilSemua((dari, ke) =>
    supabase.from('pesan')
      .select('*, pengirim:pengirim_id(id, nama, peran)')
      .eq('kanal_id', kanalId)
      .order('dibuat_pada', { ascending: true })
      .range(dari, ke)
  );
}

export async function kirimPesan(kanalId, pengirimId, isi) {
  const teks = (isi || '').trim();
  if (!teks) throw new Error('Pesan tidak boleh kosong.');
  if (teks.length > 4000) throw new Error('Pesan terlalu panjang (maksimal 4000 karakter).');
  const { data, error } = await supabase
    .from('pesan').insert({ kanal_id: kanalId, pengirim_id: pengirimId, isi: teks })
    .select('*, pengirim:pengirim_id(id, nama, peran)').single();
  if (error) throw error;
  return data;
}

/** Moderasi: sembunyikan / tampilkan kembali. Pesan tidak pernah dihapus —
 *  RLS memang tidak punya kebijakan DELETE untuk tabel pesan. */
export async function ubahSembunyiPesan(pesanId, disembunyikan, olehId, alasan) {
  const { error } = await supabase.from('pesan').update({
    disembunyikan,
    disembunyikan_oleh: disembunyikan ? olehId : null,
    alasan_sembunyi: disembunyikan ? (alasan || null) : null
  }).eq('id', pesanId);
  if (error) throw error;
}

export async function ubahTutupKanal(kanalId, ditutup) {
  const { error } = await supabase.from('kanal').update({ ditutup }).eq('id', kanalId);
  if (error) throw error;
}

// ============ Pembisuan ============
export async function daftarBisu(kanalId) {
  const { data, error } = await supabase
    .from('bisu_kanal').select('*, murid:murid_id(id, nama)').eq('kanal_id', kanalId);
  if (error) throw error;
  return data;
}

export async function bisukan(kanalId, muridId, olehId, menit, alasan) {
  const sampai = menit ? new Date(Date.now() + menit * 60000).toISOString() : null;
  const { error } = await supabase.from('bisu_kanal').upsert({
    kanal_id: kanalId, murid_id: muridId, oleh: olehId, sampai, alasan: alasan || null
  }, { onConflict: 'kanal_id,murid_id' });
  if (error) throw error;
}

export async function cabutBisu(bisuId) {
  const { error } = await supabase.from('bisu_kanal').delete().eq('id', bisuId);
  if (error) throw error;
}

// ============ Tanda dibaca ============
export async function tandaiDibaca(kanalId, penggunaId) {
  const { error } = await supabase.from('baca_kanal').upsert({
    kanal_id: kanalId, pengguna_id: penggunaId, terakhir_baca: new Date().toISOString()
  }, { onConflict: 'kanal_id,pengguna_id' });
  if (error) throw error;
}

/** Jumlah pesan belum terbaca per kanal, untuk lencana di daftar kanal. */
export async function hitungBelumTerbaca(penggunaId) {
  const { data: kanalList, error: e1 } = await supabase.from('kanal').select('id');
  if (e1) throw e1;
  if (!kanalList.length) return new Map();

  const { data: bacaList, error: e2 } = await supabase
    .from('baca_kanal').select('kanal_id, terakhir_baca').eq('pengguna_id', penggunaId);
  if (e2) throw e2;
  const petaBaca = new Map(bacaList.map(b => [b.kanal_id, b.terakhir_baca]));

  const { data: pesanList, error: e3 } = await supabase
    .from('pesan').select('kanal_id, dibuat_pada, pengirim_id').eq('disembunyikan', false);
  if (e3) throw e3;

  const hasil = new Map();
  for (const p of pesanList) {
    if (p.pengirim_id === penggunaId) continue;      // pesan sendiri tak dihitung
    const batas = petaBaca.get(p.kanal_id);
    if (!batas || new Date(p.dibuat_pada) > new Date(batas)) {
      hasil.set(p.kanal_id, (hasil.get(p.kanal_id) || 0) + 1);
    }
  }
  return hasil;
}

// ============ Lampiran gambar ============
const LAMPIRAN_BAWAAN = { aktif: true, maks_mb: 5, wajib_ditinjau: true };

export async function ambilPengaturanLampiran() {
  const { data, error } = await supabase
    .from('pengaturan').select('nilai').eq('kunci', 'lampiran_obrolan').maybeSingle();
  if (error) throw error;
  return { ...LAMPIRAN_BAWAAN, ...(data?.nilai || {}) };
}

/** Lampirkan gambar pada sebuah pesan. Statusnya dipaksa 'menunggu' oleh
 *  trigger database — murid tidak bisa meloloskan gambarnya sendiri. */
export async function lampirkanGambar(pesanId, pengirimId, file, maksMb = 5) {
  if (!file.type.startsWith('image/')) throw new Error('Hanya berkas gambar yang bisa dilampirkan.');
  if (file.size > maksMb * 1024 * 1024) throw new Error(`Ukuran gambar melebihi ${maksMb} MB.`);
  const { path, sidik } = await unggahBukti(file);
  const { data, error } = await supabase.from('lampiran_pesan').insert({
    pesan_id: pesanId, pengirim_id: pengirimId, path,
    nama_asli: file.name, mime: file.type, ukuran: file.size, sidik
  }).select().single();
  if (error) throw error;
  return data;
}

/** Ambil lampiran untuk sekumpulan pesan. RLS yang menyaring: murid lain
 *  hanya menerima baris yang sudah disetujui. */
export async function lampiranUntukPesan(pesanIds) {
  if (!pesanIds.length) return new Map();
  const { data, error } = await supabase
    .from('lampiran_pesan').select('*').in('pesan_id', pesanIds);
  if (error) throw error;
  const peta = new Map();
  for (const l of data) {
    const arr = peta.get(l.pesan_id) || [];
    arr.push(l); peta.set(l.pesan_id, arr);
  }
  return peta;
}

export async function tinjauLampiran(lampiranId, status, peninjauId, alasan) {
  const { error } = await supabase.from('lampiran_pesan').update({
    status, ditinjau_oleh: peninjauId, alasan_tolak: status === 'ditolak' ? (alasan || null) : null
  }).eq('id', lampiranId);
  if (error) throw error;
}

/** Hapus berkasnya dari storage. Baris lampirannya sengaja DIPERTAHANKAN
 *  sebagai jejak: siapa mengirim apa, kapan, dan siapa yang menghapusnya. */
export async function hapusBerkasLampiran(lampiran, peninjauId) {
  if (lampiran.path) {
    try { await hapusBuktiDariStorage(lampiran.path); } catch { /* berkas mungkin sudah hilang */ }
  }
  const { error } = await supabase.from('lampiran_pesan').update({
    status: 'ditolak', path: null, dihapus_pada: new Date().toISOString(), ditinjau_oleh: peninjauId
  }).eq('id', lampiran.id);
  if (error) throw error;
}

export async function urlLampiran(path) {
  return urlBukti(path);
}

// ============ Realtime ============
export function pantauPesan(kanalId, onPesanBaru, onPesanDiubah) {
  const kanal = supabase
    .channel(`obrolan:${kanalId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'pesan', filter: `kanal_id=eq.${kanalId}`
    }, (p) => onPesanBaru?.(p.new))
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'pesan', filter: `kanal_id=eq.${kanalId}`
    }, (p) => onPesanDiubah?.(p.new))
    .subscribe();
  return () => { supabase.removeChannel(kanal); };
}

// ============ Jam layanan ============
const JAM_BAWAAN = {
  aktif: true, mulai: '07:00', selesai: '15:00', hari: [1, 2, 3, 4, 5],
  catatan: 'Pesan di luar jam ini tetap terkirim, tetapi balasan guru biasanya menunggu hari sekolah berikutnya.'
};

export async function ambilJamLayanan() {
  const { data, error } = await supabase
    .from('pengaturan').select('nilai').eq('kunci', 'jam_layanan').maybeSingle();
  if (error) throw error;
  return { ...JAM_BAWAAN, ...(data?.nilai || {}) };
}

/** Apakah SEKARANG berada di dalam jam layanan? Memakai waktu WIB agar
 *  seragam untuk semua pengguna, bukan zona waktu perangkat masing-masing. */
export function sedangJamLayanan(jam) {
  if (!jam?.aktif) return true;
  const kini = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hari = kini.getDay(); // 0 Minggu … 6 Sabtu
  if (!(jam.hari || []).includes(hari)) return false;

  const [jm, mm] = String(jam.mulai || '07:00').split(':').map(Number);
  const [js, ms] = String(jam.selesai || '15:00').split(':').map(Number);
  const menitKini = kini.getHours() * 60 + kini.getMinutes();
  return menitKini >= (jm * 60 + mm) && menitKini < (js * 60 + ms);
}

export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
