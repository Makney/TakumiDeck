import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite-Config für den Renderer-Prozess (React-App).
// Wir verlegen `root` auf src/renderer, damit Vite die index.html dort findet —
// Forge-Plugin-Default ist projectDir, was nur funktioniert, wenn index.html
// im Project-Root liegt. Architektur 6.0 platziert sie aber unter src/renderer/.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
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
