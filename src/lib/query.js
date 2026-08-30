// src/lib/query.js — Helper paginasi. Supabase (PostgREST) membatasi 1000
// baris per query — query yang berpotensi melebihi itu (rekap kelas besar,
// dsb.) WAJIB pakai ini, atau sebagian data akan terpotong diam-diam.
const UKURAN_HALAMAN = 1000;

/** Jalankan queryBuilder Supabase berulang dengan .range() sampai semua
 *  baris terambil. `buatQuery` menerima (from, to) dan harus mengembalikan
 *  query builder Supabase yang SUDAH dipasangi .range(from, to). */
export async function ambilSemua(buatQuery) {
  let dari = 0;
  let semua = [];
  while (true) {
    const { data, error } = await buatQuery(dari, dari + UKURAN_HALAMAN - 1);
    if (error) throw error;
    semua = semua.concat(data || []);
    if (!data || data.length < UKURAN_HALAMAN) break;
    dari += UKURAN_HALAMAN;
  }
  return semua;
}
