import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Vitest läuft in Node-Umgebung (Main-Prozess-Tests). Renderer-Tests bekommen
// in späteren Sprints einen eigenen jsdom-Workspace, falls UI-Tests nötig sind.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
});
