import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: { index: 'src/desktop/main.ts', 'speech-worker': 'src/infrastructure/media/speech-worker.ts' },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: { input: 'src/desktop/preload.ts', output: { format: 'cjs' } },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: { rollupOptions: { input: 'src/renderer/index.html' } },
  },
});
