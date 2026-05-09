import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite-Config für den Main-Prozess. Native Module (better-sqlite3, electron-log)
// werden als external markiert, damit sie zur Laufzeit aus node_modules geladen werden.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'electron', 'electron-log', 'electron-squirrel-startup'],
    },
  },
});
