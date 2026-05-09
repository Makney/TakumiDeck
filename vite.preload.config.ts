import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite-Config für das Preload-Skript. Wird als CommonJS gebaut, damit es im
// sandboxed Renderer geladen werden kann.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: ['electron'],
    },
  },
});
