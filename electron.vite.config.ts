import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { cp } from 'node:fs/promises';

export default defineConfig({
  main: {
    plugins: [
      {
        name: 'transcription-resources',
        async closeBundle() {
          await cp('src/infrastructure/transcription/resources', 'out/main/transcription-resources', {
            recursive: true,
          });
        },
      },
    ],
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: 'src/desktop/main.ts',
          'speech-worker': 'src/infrastructure/media/speech-worker.ts',
          transcribe: 'src/infrastructure/transcription-cli.ts',
        },
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
