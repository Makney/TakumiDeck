import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite-Config für den Main-Prozess.
// Externals-Strategie: Nur Native-Module bleiben extern (laden ihre .node-Binaries
// dynamisch via require() — bundlen ist hier nicht möglich). Pure-JS-Pakete (electron-log,
// electron-squirrel-startup, chokidar, simple-git, gray-matter, js-yaml) werden ins Bundle
// gezogen, damit das Produktiv-Paket sie nicht aus node_modules laden muss.
// Hintergrund: @electron-forge/plugin-vite ignoriert per Default node_modules komplett im
// gepackten ASAR (siehe VitePlugin.js Zeile 124-131) — daher pure-JS bundlen, native via
// custom ignore-Filter in forge.config.ts durchreichen.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'better-sqlite3',
        'electron',
        // @lydell/node-pty lädt seine Plattform-Binary dynamisch über require() —
        // Vite/Rollup würde das nicht auflösen. Daher als external markieren.
        '@lydell/node-pty',
        /^@lydell\/node-pty-/,
      ],
    },
  },
});
