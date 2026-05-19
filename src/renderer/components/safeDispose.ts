// Defensive Dispose-Helper fuer xterm-Terminals und ihre Addons.
//
// Hintergrund (Bugfix 2026-05-19): @xterm/addon-webgl@0.19.0 wirft in seinem
// dispose-Pfad eine `TypeError: Cannot read properties of undefined (reading
// '_isDisposed')`, wenn ein Terminal-Tab geschlossen wird bevor der WebGL-
// Renderer voll initialisiert ist (Shader-Compile + GL-Resources sind async).
// Die Exception bubblet aus dem React-Effect-Cleanup, ohne ErrorBoundary reisst
// es den gesamten Render-Tree mit.
//
// Helper sind absichtlich tolerant: ein gescheiterter Dispose ist hinnehmbar,
// weil das Terminal sowieso aus dem DOM verschwindet. Wir loggen den Fehler
// mit Label, damit DevTools-Diagnose im Daily-Use moeglich bleibt.

export interface DisposableLike {
  dispose: () => void;
}

// Disposed einen Addon (oder beliebiges Disposable) mit try/catch. Identitaets-
// stabile No-op bei `null` — bequem fuer Refs, die optional gesetzt sind.
export function safeDisposeAddon(
  addon: DisposableLike | null,
  label: string,
): void {
  if (addon === null) return;
  try {
    addon.dispose();
  } catch (err) {
    // Bewusst console.warn — der Renderer-Prozess soll weiterlaufen.
    console.warn(`[safeDispose] ${label} dispose warf:`, err);
  }
}

// Disposed das Terminal selbst. Separater Helper, damit Tests die zwei Pfade
// (Addon vs. Terminal) getrennt verifizieren koennen und der Aufruf-Site-Code
// in TerminalTab.tsx unverstecktes Intent zeigt.
export function safeDisposeTerminal(
  terminal: DisposableLike,
  label: string,
): void {
  try {
    terminal.dispose();
  } catch (err) {
    console.warn(`[safeDispose] ${label} terminal.dispose warf:`, err);
  }
}
