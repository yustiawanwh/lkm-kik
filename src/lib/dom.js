// src/lib/dom.js — Helper DOM ringan (tanpa framework).

/** Buat elemen. props boleh berisi "html" HANYA untuk konten yang sudah aman
 *  (hasil teksKeHtml, lihat src/lib/teks.js). Jangan pernah isi "html" dengan
 *  teks mentah dari pengguna. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (key === 'html') {
      node.innerHTML = val; // hanya untuk konten tepercaya
    } else if (key === 'class') {
      node.className = val;
    } else if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val !== undefined && val !== null && val !== false) {
      node.setAttribute(key, val === true ? '' : val);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Kosongkan node lalu isi dengan children baru. */
export function isi(node, children) {
  node.replaceChildren();
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Toast singkat. */
/** Pesan sekilas. Mengembalikan elemennya agar pemanggil bisa memperbarui
 *  teksnya (mis. penanda kemajuan) atau menutupnya lebih awal.
 *  durasi 0 = menetap sampai ditutup pemanggil. */
export function roti(pesan, jenis = 'info', durasi = 3200) {
  let wadah = $('.roti-wadah');
  if (!wadah) {
    wadah = el('div', { class: 'roti-wadah' });
    document.body.appendChild(wadah);
  }
  const node = el('div', { class: `roti roti-${jenis}` }, pesan);
  wadah.appendChild(node);
  if (durasi > 0) setTimeout(() => node.remove(), durasi);
  return node;
}

/** Dialog modal generik. Mengembalikan { tutup }. */
export function dialog({ judul, isi: kontenIsi, bisaTutup = true } = {}) {
  const latar = el('div', { class: 'dialog-latar' });

  function tutup() {
    document.removeEventListener('keydown', tanganiEsc, true);
    latar.remove();
  }

  const tombolTutup = bisaTutup
    ? el('button', {
        class: 'tombol-tutup-dialog', 'aria-label': 'Tutup', type: 'button', onclick: tutup
      }, '\u2715')
    : null;

  const kotak = el('div', { class: 'dialog-kotak' }, [
    (judul || tombolTutup)
      ? el('div', { class: 'kepala-dialog' }, [
          judul ? el('h3', {}, judul) : el('span', {}),
          tombolTutup
        ])
      : null,
    kontenIsi || null
  ]);

  /** Dialog berisi isian dianggap "sedang dikerjakan": jangan tutup hanya
   *  karena latar terklik atau Esc ditekan — pekerjaan bisa hilang gara-gara
   *  salah klik sedikit. Dialog tanpa isian (sekadar pemberitahuan) tetap
   *  bisa ditutup dengan cara itu. */
  function adaIsian() {
    return !!kotak.querySelector('input, textarea, select');
  }

  function tanganiEsc(e) {
    if (e.key !== 'Escape') return;
    if (!bisaTutup || adaIsian()) return;
    e.stopPropagation();
    tutup();
  }

  if (bisaTutup) {
    latar.addEventListener('click', (e) => {
      if (e.target !== latar) return;
      if (adaIsian()) return; // tutup lewat tombol Batal / silang saja
      tutup();
    });
    document.addEventListener('keydown', tanganiEsc, true);
  }

  latar.appendChild(kotak);
  document.body.appendChild(latar);
  return { tutup, kotak };
}

/** Dialog konfirmasi berbasis Promise<boolean>. */
export function konfirmasi(pesan, { labelYa = 'Ya', labelTidak = 'Batal' } = {}) {
  return new Promise((resolve) => {
    const { tutup } = dialog({
      judul: 'Konfirmasi',
      bisaTutup: false,
      isi: el('div', {}, [
        el('p', {}, pesan),
        el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;' }, [
          el('button', { class: 'tombol tombol-sekunder', onclick: () => { tutup(); resolve(false); } }, labelTidak),
          el('button', { class: 'tombol tombol-primer', onclick: () => { tutup(); resolve(true); } }, labelYa)
        ])
      ])
    });
  });
}

/** Format tanggal ISO ke format Indonesia, zona WIB. denganJam=true menambah jam. */
export function tanggalId(iso, denganJam = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const opsi = {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Jakarta'
  };
  if (denganJam) {
    opsi.hour = '2-digit';
    opsi.minute = '2-digit';
  }
  let teks = d.toLocaleString('id-ID', opsi);
  if (denganJam) teks += ' WIB';
  return teks;
}
