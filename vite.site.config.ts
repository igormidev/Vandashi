import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('./landing', import.meta.url)),
  base: '/Vandashi/',
  appType: 'mpa',
  plugins: [react()],
  build: {
    outDir: '../dist/landing',
    emptyOutDir: true,
  },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
