import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { safeDisposeAddon } from '../../components/safeDispose';
import { type ImagePasteSaver } from '../../components/clipboardKeyHandler';
import {
  bytesToBase64,
  classifyClipboardItems,
  isAllowedImageMime,
  type ScreenshotMime,
} from '../../components/terminalDropHandler';
import { quotePathIfNeeded } from '../../components/pathQuoting';

export function safeFit(fit: FitAddon | null): void {
  if (!fit) return;
  try {
    fit.fit();
  } catch {
    // ResizeObserver feuert manchmal mit 0×0 (Tab inaktiv, Animationen) — dann ignorieren.
  }
}

// Phase-2 Season-28: Renderer-Wahl WebGL primaer, Canvas als Fallback. Die
// Funktion sitzt aussen, damit sie nicht pro Tab-Mount neu allokiert wird.
// Zwei Fallback-Pfade:
//   1. WebglAddon-Konstruktor wirft (z.B. WebGL2 nicht verfuegbar) → catch
//      faellt auf CanvasAddon zurueck.
//   2. Laufzeit-Context-Loss (Treiber-Reset/GPU-Crash) → onContextLoss
//      disposed das Addon und laedt Canvas nach. xterm rendert dann bis
//      zur naechsten App-Session weiter ueber Canvas.
//
// Bugfix 2026-05-19: Rueckgabe ist der aktuell aktive Addon (WebGL oder
// Canvas-Fallback). Caller (TerminalTab) haelt ihn in einer Ref, um beim
// Cleanup vor `terminal.dispose()` separat zu disposen — der WebGL-Dispose-
// Pfad wirft sonst eine TypeError, wenn der GL-Renderer beim Schliessen
// noch nicht voll initialisiert war. Bei Context-Loss-Tausch meldet der
// Callback `onAddonReplaced` den neuen Addon nach, damit die Ref aktuell
// bleibt.
export function loadRendererAddonWithFallback(
  terminal: Terminal,
  onAddonReplaced: (next: WebglAddon | CanvasAddon | null) => void,
): WebglAddon | CanvasAddon | null {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      console.warn('[TerminalTab] WebGL Context-Loss, weiche auf CanvasAddon aus');
      safeDisposeAddon(webgl, 'webgl-context-loss');
      // Ref auf null setzen, bis der Canvas-Fallback erfolgreich geladen ist —
      // ansonsten zeigt sie auf den disposed Addon und Cleanup wuerde ihn
      // erneut disposen (Idempotenz erforderlich).
      onAddonReplaced(null);
      try {
        const canvas = new CanvasAddon();
        terminal.loadAddon(canvas);
        onAddonReplaced(canvas);
      } catch (canvasErr) {
        console.warn(
          '[TerminalTab] CanvasAddon-Fallback nach WebGL-Context-Loss fehlgeschlagen',
          canvasErr,
        );
      }
    });
    terminal.loadAddon(webgl);
    // Erfolg-Log: User kann in den DevTools schnell pruefen, welcher Renderer
    // aktiv ist. Bei mehreren parallelen Tabs einmal pro Tab.
    console.info('[TerminalTab] Renderer: WebGL');
    return webgl;
  } catch (err) {
    console.warn(
      '[TerminalTab] WebglAddon nicht ladbar, weiche auf CanvasAddon aus',
      err,
    );
    try {
      const canvas = new CanvasAddon();
      terminal.loadAddon(canvas);
      console.info('[TerminalTab] Renderer: Canvas (Fallback)');
      return canvas;
    } catch (canvasErr) {
      console.warn(
        '[TerminalTab] CanvasAddon-Initial-Fallback fehlgeschlagen',
        canvasErr,
      );
      return null;
    }
  }
}

export function showError(el: HTMLDivElement | null, msg: string): void {
  if (!el) return;
  el.textContent = `Fehler: ${msg}`;
  el.hidden = false;
}

// Phase-2 Season-2: Beim Drag enthält das DataTransfer.items oft nur die
// MIME-Typen, .files dagegen leeres Array — wir prüfen beide Pfade. Wenn
// kein passender Image-Typ dabei ist, lassen wir das Event durchlaufen
// (z.B. wenn der User aus Versehen Text in den Terminal-Bereich zieht).
export function hasImageFiles(dt: DataTransfer): boolean {
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file' && isAllowedImageMime(item.type)) return true;
  }
  for (const file of Array.from(dt.files)) {
    if (isAllowedImageMime(file.type)) return true;
  }
  return false;
}

// Liest ein File komplett in ein Uint8Array. Sandbox-konform — kein Node-FS,
// nur die Browser-FileReader-API.
export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

// Phase-2 Season-2: Driver für den Clipboard-Image-Paste-Pfad. Sucht im
// Clipboard das erste image/*-Item, speichert es via IPC und gibt den
// fertigen Path-Insert-Text zurück (mit Quoting bei Whitespace im Pfad).
export function createImagePasteSaver(): ImagePasteSaver {
  return {
    tryReadAndSaveAsPathInsert: async () => {
      // navigator.clipboard.read ist im Renderer nur verfügbar, wenn die
      // clipboard-read-Permission greift — die ist in main.ts whitelisted.
      // Auf älteren Electron-Pfaden oder im jsdom-Test-Setup kann die API
      // fehlen; dann verhält sich der Driver wie „kein Bild gefunden".
      if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
      const items = await navigator.clipboard.read();
      const action = await classifyClipboardItems(items, {
        readBlobAsBytes: async (blob) => new Uint8Array(await blob.arrayBuffer()),
      });
      if (action === null) return null;
      // action ist garantiert save-and-paste — classifyClipboardItems hat
      // schon das Image-MIME geprüft.
      if (action.kind !== 'save-and-paste') return null;
      const base64 = bytesToBase64(action.bytes);
      const res = await window.api.fs.saveScreenshot({
        mime: action.mime as ScreenshotMime,
        base64,
      });
      if (!res.ok) return '';
      return quotePathIfNeeded(res.data.absolutePath);
    },
  };
}

// Liefert die letzten n Buffer-Zeilen als reinen Text (ohne ANSI-Escapes).
// translateToString(true) trimt rechte Whitespace-Padding, das xterm für leere
// Zellen einfügt — wichtig für den TUI-Pattern-Match (sonst wären selbst leere
// Buffer-Reihen randvoll mit Spaces).
export function snapshotBufferLines(term: Terminal, n: number): string[] {
  const buf = term.buffer.active;
  const total = buf.length;
  const start = Math.max(0, total - n);
  const lines: string[] = [];
  for (let i = start; i < total; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    lines.push(line.translateToString(true));
  }
  return lines;
}
