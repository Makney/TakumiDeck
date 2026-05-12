import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Production-Meta-CSP: gleiche Werte wie der HTTP-Header in src/main/main.ts.
// Bei Änderung beide Stellen anpassen. Im Production-Build greift in Electron nur
// das Meta-Tag, weil der Renderer dort via file:// geladen wird (keine HTTP-Header).
const PRODUCTION_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self' data:;";

// Hängt den Production-CSP-Meta-Tag nur beim `vite build` in die index.html ein.
// Im Dev-Modus (`vite dev`) bleibt der Tag draußen, damit @vitejs/plugin-react
// sein inline Fast-Refresh-Preamble-Script ausführen kann.
function productionCspMetaPlugin(): Plugin {
  return {
    name: 'takumideck:production-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const metaTag = `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`;
        return html.replace('<title>', `${metaTag}\n    <title>`);
      },
    },
  };
}

// Vite-Config für den Renderer-Prozess (React-App).
// Wir verlegen `root` auf src/renderer, damit Vite die index.html dort findet —
// Forge-Plugin-Default ist projectDir, was nur funktioniert, wenn index.html
// im Project-Root liegt. Architektur 6.0 platziert sie aber unter src/renderer/.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  // Relative Asset-Pfade — Electron lädt im Production-Build via file://.
  base: './',
  plugins: [react(), productionCspMetaPlugin()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    // Absoluter Pfad, weil `outDir` standardmäßig relativ zu root aufgelöst würde
    // — relative zu src/renderer wäre der Build sonst an der falschen Stelle.
    outDir: resolve(__dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
