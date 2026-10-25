import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En développement, Vite relaie /api et /panel (y compris le flux SSE) vers le serveur du panel.
const target = process.env.PANEL_URL || 'http://127.0.0.1:8485';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { port: 5173, proxy: { '/api': { target, changeOrigin: false }, '/panel': { target, changeOrigin: false }, '/fonts/Bouygues': { target, changeOrigin: false } } },
  build: {
    outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900,
  },
});
