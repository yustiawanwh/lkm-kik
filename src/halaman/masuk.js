// src/halaman/masuk.js — Halaman login/daftar.
import { supabase } from '../lib/supabase.js';
import { el, isi, $ } from '../lib/dom.js';
import { pesanGalat } from '../lib/kesalahan.js';

export function renderMasuk(root) {
  let mode = 'masuk'; // 'masuk' | 'daftar'
  let memuat = false;
  let galat = '';

  function gambar() {
    const kotak = el('div', { class: 'masuk-kotak kartu' }, [
      el('div', { class: 'masuk-judul' }, 'Brantas Venture Studio'),
      el('div', { class: 'masuk-sub' }, 'LKPD Interaktif — Kreativitas, Inovasi & Kewirausahaan'),
      galat ? el('div', { class: 'masuk-galat' }, galat) : null,

      mode === 'daftar' ? el('div', { class: 'medan' }, [
        el('label', {}, 'Nama Lengkap'),
        el('input', { type: 'text', id: 'f-nama', placeholder: 'Nama Anda' })
      ]) : null,

      el('div', { class: 'medan' }, [
        el('label', {}, 'Email'),
        el('input', { type: 'email', id: 'f-email', placeholder: 'nama@sekolah.sch.id' })
      ]),
      el('div', { class: 'medan' }, [
        el('label', {}, 'Kata Sandi'),
        el('input', { type: 'password', id: 'f-sandi', placeholder: '••••••••' })
      ]),

      el('button', {
        class: 'tombol tombol-primer',
        style: 'width:100%;justify-content:center;margin-top:4px;',
        disabled: memuat,
        onclick: submit
      }, memuat ? 'Memproses…' : (mode === 'masuk' ? 'Masuk' : 'Daftar')),

      el('div', { style: 'text-align:center;margin-top:14px;font-size:13px;color:var(--abu-teks);' }, [
        mode === 'masuk' ? 'Belum punya akun? ' : 'Sudah punya akun? ',
        el('a', {
          href: '#', onclick: (e) => {
            e.preventDefault();
            mode = mode === 'masuk' ? 'daftar' : 'masuk';
            galat = '';
            render();
          }
        }, mode === 'masuk' ? 'Daftar di sini' : 'Masuk di sini')
      ])
    ]);
    return el('div', { class: 'halaman-masuk' }, kotak);
  }

  function render() {
    isi(root, gambar());
  }

  async function submit() {
    const email = $('#f-email', root)?.value?.trim();
    const sandi = $('#f-sandi', root)?.value;
    if (!email || !sandi) {
      galat = 'Email dan kata sandi wajib diisi.';
      render();
      return;
    }
    memuat = true; galat = ''; render();
    try {
      if (mode === 'masuk') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: sandi });
        if (error) throw error;
      } else {
        const nama = $('#f-nama', root)?.value?.trim() || email.split('@')[0];
        // Peran TIDAK pernah diambil dari input pengguna — pendaftaran mandiri
        // selalu jadi 'murid'. Akun guru/admin hanya dibuat lewat promosi
        // manual oleh admin (lihat PANDUAN_SETUP_SUPABASE.md bagian 9).
        const { error } = await supabase.auth.signUp({
          email, password: sandi,
          options: { data: { nama } }
        });
        if (error) throw error;
      }
      // Navigasi ditangani oleh listener onAuthStateChange di main.js
    } catch (err) {
      galat = pesanGalat(err);
      memuat = false;
      render();
    }
  }

  render();
}
