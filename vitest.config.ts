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
    // Mehrere src/main-Module ziehen transitiv `electron-log` herein, dessen
    // main/index.js beim Import `require('electron')` aufruft. Das echte
    // electron/index.js loest die Binary ueber node_modules/electron/path.txt
    // auf und wirft "Electron failed to install correctly", wenn die Binary auf
    // dem Runner nicht installiert wurde (CI-Regression beim Electron-41-
    // Postinstall auf windows-latest). Mit gesetztem ELECTRON_OVERRIDE_DIST_PATH
    // gibt electron/index.js stattdessen einen Pfad-String zurueck OHNE zu
    // werfen (siehe getElectronPath) — exakt das lokale Node-Kontext-Verhalten,
    // das electron-log ohnehin erwartet. Macht die Suite unabhaengig von der
    // Binary-Installation auf jedem Runner. Ein resolve.alias auf einen Stub
    // greift hier nicht zuverlaessig, weil Vitest node_modules (electron-log)
    // externalisiert und per nativem require laedt, an Vite-Aliassen vorbei.
    env: {
      ELECTRON_OVERRIDE_DIST_PATH: resolve(__dirname, 'node_modules/electron/dist'),
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
});
