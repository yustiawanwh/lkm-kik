// src/lib/teks.js — Pengubah teks berformat (Markdown aman) → HTML.
// Pola aman XSS (PRD 11.2):
// 1) Escape SELURUH HTML lebih dulu.
// 2) Hanya hasilkan tag aman: strong, em, u, ul, ol, li, p, br — tanpa atribut.
// 3) Tidak memakai pustaka Markdown besar; pengubah kecil ditulis sendiri.
//
// Dipakai di: pengantar LKM, deskripsi misi, tujuan tahap, catatan lembar,
// refleksi, DAN pesan diskusi kelompok (permukaan XSS baru pada KIK —
// wajib melewati jalur yang sama, tidak boleh innerHTML mentah).

function escapeHtml(teks) {
  return String(teks)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Ubah teks mentah (boleh berisi markup pengguna) menjadi HTML aman. */
export function teksKeHtml(teksMentah) {
  if (!teksMentah) return '';
  const aman = escapeHtml(teksMentah);
  const baris = aman.split(/\r?\n/);

  const blokHtml = [];
  let daftarAktif = null; // 'ul' | 'ol' | null
  let paragrafBuffer = [];

  const tutupParagraf = () => {
    if (paragrafBuffer.length) {
      blokHtml.push(`<p>${paragrafBuffer.join('<br>')}</p>`);
      paragrafBuffer = [];
    }
  };
  const tutupDaftar = () => {
    if (daftarAktif) {
      blokHtml.push(`</${daftarAktif}>`);
      daftarAktif = null;
    }
  };
  const terapkanInline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<u>$1</u>');

  for (const barisMentah of baris) {
    const b = barisMentah.trim();
    if (b === '') { tutupParagraf(); tutupDaftar(); continue; }

    const cocokButir = b.match(/^-\s+(.*)$/);
    const cocokNomor = b.match(/^\d+\.\s+(.*)$/);

    if (cocokButir) {
      tutupParagraf();
      if (daftarAktif !== 'ul') { tutupDaftar(); blokHtml.push('<ul>'); daftarAktif = 'ul'; }
      blokHtml.push(`<li>${terapkanInline(cocokButir[1])}</li>`);
    } else if (cocokNomor) {
      tutupParagraf();
      if (daftarAktif !== 'ol') { tutupDaftar(); blokHtml.push('<ol>'); daftarAktif = 'ol'; }
      blokHtml.push(`<li>${terapkanInline(cocokNomor[1])}</li>`);
    } else {
      tutupDaftar();
      paragrafBuffer.push(terapkanInline(b));
    }
  }
  tutupParagraf();
  tutupDaftar();
  return blokHtml.join('');
}

/** Helper editor: sisipkan penanda format di sekitar teks terpilih pada <textarea>. */
export function kotakFormat(textarea, tanda) {
  const awal = textarea.selectionStart;
  const akhir = textarea.selectionEnd;
  const nilai = textarea.value;
  const terpilih = nilai.slice(awal, akhir) || 'teks';
  const baru = nilai.slice(0, awal) + tanda + terpilih + tanda + nilai.slice(akhir);
  textarea.value = baru;
  textarea.focus();
  textarea.selectionStart = awal + tanda.length;
  textarea.selectionEnd = awal + tanda.length + terpilih.length;
}

/** Sisipkan butir/nomor di awal baris saat ini. */
export function sisipkanAwalBaris(textarea, prefiks) {
  const awal = textarea.selectionStart;
  const nilai = textarea.value;
  const mulaiBaris = nilai.lastIndexOf('\n', awal - 1) + 1;
  const baru = nilai.slice(0, mulaiBaris) + prefiks + nilai.slice(mulaiBaris);
  textarea.value = baru;
  textarea.focus();
}

/** Validasi skema URL untuk bukti tautan: hanya http/https diterima (PRD 11.2, 6.7). */
export function urlAman(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
