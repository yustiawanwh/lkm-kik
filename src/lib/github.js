// src/lib/github.js — Membaca jejak kerja kelompok di GitHub.
//
// Dipanggil LANGSUNG dari peramban guru. GitHub REST API mengizinkannya:
// balasannya membawa Access-Control-Allow-Origin: *, jadi tidak perlu proxy
// dan tidak ada komponen server baru yang harus dirawat.
//
// BATAS LAJU menentukan seluruh rancangan di sini:
//   tanpa token : 60 permintaan per jam, DIHITUNG PER ALAMAT IP
//   dengan token: 5.000 permintaan per jam per token
// Satu lab sekolah berbagi satu IP publik, jadi angka 60 itu dibagi bersama
// seluruh komputer di sana. Karena itu:
//   - hanya peramban GURU yang memanggil GitHub, tidak pernah murid;
//   - hasilnya disimpan sebagai cuplikan di Supabase untuk dibaca ulang;
//   - tiap kelompok memakai tepat 5 panggilan, tidak lebih.
//
// TOKEN tidak pernah menyentuh Supabase dan tidak pernah ikut ter-deploy.
// Ia hanya ada di localStorage peramban guru dan hanya dikirim ke
// api.github.com. Kalau ikut disimpan di basis data, satu kebijakan RLS yang
// salah sudah cukup untuk membocorkan akses ke akun GitHub guru.

const PANGKAL = 'https://api.github.com';
const KUNCI_TOKEN = 'bvs.github-token';
const PER_HALAMAN = 100;

// ---------- Token (hanya di perangkat guru) ----------

export function ambilToken() {
  try { return localStorage.getItem(KUNCI_TOKEN) || ''; } catch { return ''; }
}

export function simpanToken(token) {
  try {
    const t = String(token || '').trim();
    if (t) localStorage.setItem(KUNCI_TOKEN, t);
    else localStorage.removeItem(KUNCI_TOKEN);
    return true;
  } catch { return false; }
}

export function adaToken() { return ambilToken() !== ''; }

// ---------- Penguraian alamat ----------

/**
 * Ambil pemilik dan nama repo dari berbagai bentuk tulisan murid.
 *
 * Murid menulis alamatnya dengan bebas di lembar Identitas: ada yang
 * menempel URL lengkap, ada yang menyalin dari bilah alamat beserta
 * /tree/main, ada yang hanya menulis "k2/booking-lab". Semua bentuk itu
 * harus terbaca, kalau tidak gurulah yang harus merapikan 7 alamat manual.
 */
export function uraikanRepo(teks) {
  const s = String(teks || '').trim();
  if (!s) return null;

  // Bentuk URL (https, http, atau tanpa skema), termasuk ekor /tree/main.
  const m = s.match(/(?:github\.com[/:])([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/i);
  if (m) return { pemilik: m[1], nama: m[2].replace(/\.git$/i, '') };

  // Bentuk ringkas "pemilik/nama".
  const r = s.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (r) return { pemilik: r[1], nama: r[2].replace(/\.git$/i, '') };

  return null;
}

/** Alamat GitHub Pages yang tersusun dari nama repo. Repo bernama
 *  "<pemilik>.github.io" terbit di akar domain, bukan di subfolder. */
export function alamatPages(pemilik, nama) {
  const akar = `https://${String(pemilik).toLowerCase()}.github.io`;
  return String(nama).toLowerCase() === `${String(pemilik).toLowerCase()}.github.io`
    ? `${akar}/`
    : `${akar}/${nama}/`;
}

// ---------- Panggilan API ----------

export class GalatGitHub extends Error {
  constructor(pesan, { jenis, sisaKuota, kuotaPulih } = {}) {
    super(pesan);
    this.jenis = jenis;           // 'kuota' | 'tidak_ada' | 'jaringan' | 'lain'
    this.sisaKuota = sisaKuota;
    this.kuotaPulih = kuotaPulih; // Date
  }
}

/** Keadaan kuota terakhir yang terbaca, untuk ditampilkan ke guru. */
export const kuota = { sisa: null, batas: null, pulih: null };

function bacaKuota(res) {
  // Header kuota hanya terbaca kalau GitHub mengekspornya lewat CORS.
  // Kalau tidak terbaca, nilainya tetap null dan tampilan menyesuaikan —
  // bukan alasan untuk menggagalkan pemeriksaan.
  const sisa = res.headers.get('x-ratelimit-remaining');
  const batas = res.headers.get('x-ratelimit-limit');
  const reset = res.headers.get('x-ratelimit-reset');
  if (sisa !== null) kuota.sisa = Number(sisa);
  if (batas !== null) kuota.batas = Number(batas);
  if (reset !== null) kuota.pulih = new Date(Number(reset) * 1000);
}

async function panggil(jalur) {
  const token = ambilToken();
  const kepala = { Accept: 'application/vnd.github+json' };
  if (token) kepala.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(PANGKAL + jalur, { headers: kepala });
  } catch (err) {
    throw new GalatGitHub(
      'Tidak bisa menghubungi GitHub. Periksa sambungan internet.',
      { jenis: 'jaringan' });
  }

  bacaKuota(res);

  if (res.status === 404) {
    throw new GalatGitHub(
      'Repositori tidak ditemukan. Pastikan alamatnya benar dan repositorinya Publik — ' +
      'repositori privat tidak bisa dibaca tanpa token yang punya akses ke sana.',
      { jenis: 'tidak_ada' });
  }

  // 403 dan 429 sama-sama dipakai GitHub untuk kuota habis. Yang membedakan
  // kuota dari penolakan biasa adalah sisa kuota yang sudah nol.
  if ((res.status === 403 || res.status === 429) && kuota.sisa === 0) {
    const jam = kuota.pulih
      ? kuota.pulih.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : 'sekitar satu jam lagi';
    throw new GalatGitHub(
      adaToken()
        ? `Kuota token GitHub habis. Bisa dicoba lagi pukul ${jam}.`
        : `Kuota GitHub habis (tanpa token hanya 60 permintaan per jam, dan angka itu ` +
          `dibagi bersama semua komputer di jaringan ini). Bisa dicoba lagi pukul ${jam}, ` +
          `atau tempelkan token di bagian atas halaman ini untuk menaikkannya jadi 5.000 per jam.`,
      { jenis: 'kuota', sisaKuota: 0, kuotaPulih: kuota.pulih });
  }

  if (res.status === 401) {
    throw new GalatGitHub(
      'Token GitHub ditolak. Token mungkin salah ketik atau sudah kedaluwarsa. ' +
      'Hapus tokennya untuk kembali memakai mode tanpa token.',
      { jenis: 'lain' });
  }

  if (!res.ok) {
    let pesan = `GitHub menolak permintaan (${res.status}).`;
    try { const j = await res.json(); if (j?.message) pesan += ` ${j.message}`; } catch { /* abaikan */ }
    throw new GalatGitHub(pesan, { jenis: 'lain' });
  }

  return res.json();
}

// ---------- Penilaian mutu pesan commit ----------

// Pesan bawaan penyunting web GitHub. Inilah yang muncul kalau murid tidak
// mengetik apa pun — dan LKM justru meminta pesan yang bermakna, misalnya
// "Wireframe form booking, closes #3". Mengenali pola ini yang membuat
// pemeriksaan ini berguna, bukan sekadar menghitung jumlah commit.
const POLA_BAWAAN = /^(create|update|delete|rename|add files via upload|initial commit|merge (pull request|branch))\b/i;

// Pesan yang ditulis sendiri tetapi tidak mengatakan apa-apa.
const KATA_KOSONG = new Set([
  'update', 'updates', 'fix', 'fixes', 'edit', 'revisi', 'perbaikan', 'perbaiki',
  'coba', 'test', 'testing', 'commit', 'asd', 'asdf', 'aa', 'oke', 'ok', 'selesai',
  'tugas', 'latihan', 'new file', 'file baru', '.', '-'
]);

// Grup penangkap sengaja dibuat non-penangkap, kecuali nomor Issue-nya.
// Dengan grup bersarang biasa, nomor urut grupnya bergeser dan nomor Issue
// terbaca NaN — commit yang benar justru tampak tidak menutup Issue apa pun.
const POLA_TUTUP_ISSUE = /\b(?:clos(?:e|es|ed)|fix(?:e[sd])?|resolv(?:e|es|ed))\s+#(\d+)/i;

/**
 * Nilai satu pesan commit.
 * @returns {{bermakna:boolean, sebab:string, issueDitutup:number|null}}
 */
export function nilaiPesanCommit(pesan) {
  const baris1 = String(pesan || '').split('\n')[0].trim();
  const tutup = baris1.match(POLA_TUTUP_ISSUE);
  const issueDitutup = tutup ? Number(tutup[1]) : null;

  // Menyebut penutupan Issue sudah cukup membuktikan commit itu disengaja,
  // walaupun kalimatnya pendek.
  if (issueDitutup !== null) return { bermakna: true, sebab: 'menutup Issue', issueDitutup };

  const rendah = baris1.toLowerCase().replace(/[.!]+$/, '');
  if (rendah === '') return { bermakna: false, sebab: 'pesan kosong', issueDitutup };
  if (KATA_KOSONG.has(rendah)) return { bermakna: false, sebab: 'pesan tidak menjelaskan apa pun', issueDitutup };
  if (POLA_BAWAAN.test(baris1)) return { bermakna: false, sebab: 'pesan bawaan GitHub, bukan ditulis sendiri', issueDitutup };
  if (baris1.length < 12) return { bermakna: false, sebab: 'pesan terlalu pendek', issueDitutup };

  return { bermakna: true, sebab: '', issueDitutup };
}

// ---------- Pemeriksaan satu repositori ----------

/**
 * Baca jejak kerja satu repositori. TEPAT LIMA panggilan API, supaya
 * kuota bisa dihitung guru: 7 kelompok = 35 panggilan sekali periksa.
 */
export async function periksaRepo({ pemilik, nama }) {
  const repo = await panggil(`/repos/${pemilik}/${nama}`);

  const [commitMentah, issueMentah, komentarMentah, isiAkar] = await Promise.all([
    panggil(`/repos/${pemilik}/${nama}/commits?per_page=${PER_HALAMAN}`),
    panggil(`/repos/${pemilik}/${nama}/issues?state=all&per_page=${PER_HALAMAN}`),
    panggil(`/repos/${pemilik}/${nama}/comments?per_page=${PER_HALAMAN}`),
    panggil(`/repos/${pemilik}/${nama}/contents/`)
  ]);

  const commit = (commitMentah || []).map(c => {
    const nilai = nilaiPesanCommit(c.commit?.message);
    return {
      sha: String(c.sha || '').slice(0, 7),
      pesan: String(c.commit?.message || '').split('\n')[0].trim(),
      // author bisa null kalau alamat surel pada commit tidak tertaut ke akun
      // GitHub mana pun — sering terjadi kalau murid mengubah surelnya.
      // Nama dari commit dipakai sebagai cadangan agar commitnya tidak
      // lenyap dari hitungan.
      login: c.author?.login || null,
      namaPenulis: c.commit?.author?.name || null,
      waktu: c.commit?.author?.date || null,
      bermakna: nilai.bermakna,
      sebab: nilai.sebab,
      issueDitutup: nilai.issueDitutup
    };
  });

  // Daftar issues GitHub JUGA memuat pull request. Tanpa penyaringan ini,
  // jumlah Issue kelompok bisa tampak lebih banyak dari yang sebenarnya.
  const issue = (issueMentah || [])
    .filter(i => !i.pull_request)
    .map(i => ({
      nomor: i.number,
      judul: i.title,
      status: i.state,
      pembuat: i.user?.login || null,
      ditugaskan: (i.assignees || []).map(a => a.login)
    }));

  const komentarCommit = (komentarMentah || []).map(k => ({
    sha: String(k.commit_id || '').slice(0, 7),
    login: k.user?.login || null,
    isi: String(k.body || '').split('\n')[0].trim().slice(0, 160),
    waktu: k.created_at || null
  }));

  const berkasHtml = (Array.isArray(isiAkar) ? isiAkar : [])
    .filter(f => f.type === 'file' && /\.html?$/i.test(f.name))
    .map(f => f.name);

  const adaReadme = (Array.isArray(isiAkar) ? isiAkar : [])
    .some(f => f.type === 'file' && /^readme\.md$/i.test(f.name));

  return {
    repo: {
      pemilik, nama,
      publik: repo.private === false,
      cabang: repo.default_branch || 'main',
      // has_pages ada di objek repositori publik, jadi status Pages terbaca
      // tanpa memanggil Pages API — yang menuntut hak admin dan akan gagal
      // untuk repositori milik murid.
      pagesAktif: !!repo.has_pages,
      alamatPages: repo.has_pages ? alamatPages(pemilik, nama) : null,
      didorongTerakhir: repo.pushed_at || null
    },
    commit, issue, komentarCommit, berkasHtml, adaReadme,
    diambilPada: new Date().toISOString()
  };
}

// ---------- Pencocokan ke murid ----------

/**
 * Rangkum kontribusi per murid.
 *
 * @param cuplikan hasil periksaRepo
 * @param anggota  [{ murid_id, nama, username }] — username dari kolom
 *                 catatan pada fitur Peran
 */
export function ringkasKontribusi(cuplikan, anggota) {
  // Username kosong TIDAK boleh masuk peta. Kalau masuk, murid yang belum
  // mengisi username-nya akan menampung SELURUH commit yang akunnya tidak
  // tertaut — ia tampak paling rajin justru karena belum mengisi apa pun,
  // dan murid yang benar-benar bekerja hilang dari hitungan.
  const peta = new Map();
  for (const a of anggota) {
    const u = String(a.username || '').trim().toLowerCase();
    if (u) peta.set(u, a);
  }

  const dasar = () => ({ commit: 0, bermakna: 0, issueDitugaskan: 0, issueDitutup: 0, komentar: 0 });
  const hasil = new Map(anggota.map(a => [a.murid_id, { ...a, ...dasar() }]));
  const takDikenal = new Map();   // login GitHub yang tidak cocok ke murid mana pun

  function untuk(login, namaCadangan) {
    const kunci = String(login || '').trim().toLowerCase();
    const murid = kunci ? peta.get(kunci) : null;
    if (murid) return hasil.get(murid.murid_id);
    const label = login || namaCadangan || '(tanpa nama)';
    if (!takDikenal.has(label)) takDikenal.set(label, { label, ...dasar() });
    return takDikenal.get(label);
  }

  for (const c of cuplikan.commit || []) {
    const t = untuk(c.login, c.namaPenulis);
    t.commit++;
    if (c.bermakna) t.bermakna++;
  }
  for (const i of cuplikan.issue || []) {
    for (const login of i.ditugaskan) {
      const t = untuk(login, null);
      t.issueDitugaskan++;
      if (i.status === 'closed') t.issueDitutup++;
    }
  }
  for (const k of cuplikan.komentarCommit || []) {
    untuk(k.login, null).komentar++;
  }

  return { perMurid: [...hasil.values()], takDikenal: [...takDikenal.values()] };
}

/**
 * Adu berkas .html yang benar-benar ada di repositori dengan nama berkas
 * yang dijanjikan murid di lembar Pembagian Halaman.
 */
export function bandingkanBerkas(berkasAda, berkasDijanjikan) {
  const ada = new Set(berkasAda.map(x => x.toLowerCase()));
  const janji = new Set(berkasDijanjikan.map(x => x.toLowerCase()));
  return {
    sudahDibuat: [...janji].filter(x => ada.has(x)),
    belumDibuat: [...janji].filter(x => !ada.has(x)),
    takDijanjikan: [...ada].filter(x => !janji.has(x))
  };
}

/** Kumpulkan nama berkas .html yang disebut murid di lembar mana pun. */
export function berkasDariIsian(daftarData) {
  const ketemu = new Set();
  const telusuri = (nilai) => {
    if (typeof nilai === 'string') {
      for (const m of nilai.matchAll(/[A-Za-z0-9._-]+\.html?\b/g)) ketemu.add(m[0].toLowerCase());
      return;
    }
    if (nilai && typeof nilai === 'object') Object.values(nilai).forEach(telusuri);
  };
  daftarData.forEach(telusuri);
  return [...ketemu];
}
