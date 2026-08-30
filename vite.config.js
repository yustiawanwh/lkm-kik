import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// VITE_BASE dipakai untuk basis path GitHub Pages, mis. "/nama-repo/".
// Default "/" untuk pengembangan lokal.
//
// CATATAN PENTING: karena "root" diarahkan ke folder src/, Vite secara
// default JUGA mencari file .env di src/ (bukan di folder utama proyek).
// "envDir" di bawah ini memaksanya tetap membaca .env dari folder utama
// proyek (sejajar package.json), sesuai PANDUAN_SETUP_SUPABASE.md.
export default defineConfig(({ mode }) => ({
  root: 'src',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
}));
