// Pure-Logik für den Drag-Drop ins Terminal-Pane (Phase-2 Season-2).
//
// Die Komponente bekommt einen DataTransfer (vom drop-Event) und liefert
// eine Liste an Schritten, die der Caller seriell ausführt:
//   - `paste-path`     — Datei hat bereits einen Disk-Pfad, direkt einfügen.
//   - `save-and-paste` — Bild liegt nur als Blob vor (Snipping-Tool-Direct,
//                        Browser-Drag); muss erst per IPC gespeichert werden.
//
// Files ohne Image-MIME werden ignoriert — TakumiDeck dropt keine Code-Files
// ins Terminal (User wollte explizit „Screenshots", siehe Season-2-Briefing).
//
// Driver-Injection für Tests:
//   - `getPathForFile` ist `webUtils.getPathForFile` aus dem Preload-Wrapper.
//   - `readAsBytes` liest das File als Uint8Array; in Tests ein einfacher Fake.

import { quotePathIfNeeded } from './pathQuoting';

export type ScreenshotMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const ALLOWED_MIMES = new Set<ScreenshotMime>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export type DropAction =
  | { kind: 'paste-path'; absolutePath: string }
  | { kind: 'save-and-paste'; mime: ScreenshotMime; bytes: Uint8Array };

export interface DropClassifierDeps {
  getPathForFile: (file: File) => string;
  readAsBytes: (file: File) => Promise<Uint8Array>;
}

// Klassifiziert die Files eines DataTransfer-ähnlichen Objekts. Der Aufrufer
// (TerminalTab) ruft die Action-Liste seriell durch — eine Failure-Action
// (z.B. saveScreenshot-IPC-Fehler) blockt die nachfolgenden Pastes nicht,
// weil sie als separate Promises laufen.
//
// Wir akzeptieren nur File-Objekte; den `text/plain`-Teil des DataTransfer
// ignorieren wir, weil sonst ein versehentliches Drag eines Text-Snippets
// als „Pfad" eingefügt würde — Quelle für unerwartete Eingaben im Terminal.
export async function classifyDrop(
  files: readonly File[],
  deps: DropClassifierDeps,
): Promise<DropAction[]> {
  const actions: DropAction[] = [];
  for (const file of files) {
    if (!isAllowedImageMime(file.type)) continue;
    const diskPath = deps.getPathForFile(file);
    if (diskPath.length > 0) {
      actions.push({ kind: 'paste-path', absolutePath: diskPath });
      continue;
    }
    // Kein Disk-Pfad → Direkt-Bild (z.B. Drag aus Snipping-Tool-Vorschau).
    // Bytes lesen und an die save-and-paste-Action hängen; der Caller
    // schickt sie über den fs:save-screenshot-IPC.
    const bytes = await deps.readAsBytes(file);
    actions.push({ kind: 'save-and-paste', mime: file.type as ScreenshotMime, bytes });
  }
  return actions;
}

// Klassifiziert Image-Daten aus der Zwischenablage (Ctrl+Shift+V mit Bild-
// Inhalt — typischer Workflow: Win+Shift+S → Snip im Clipboard → Paste).
// Liefert null, wenn die Zwischenablage kein passendes Bild enthält — Caller
// fällt dann auf den Text-Pfad zurück.
export async function classifyClipboardItems(
  items: readonly ClipboardItem[],
  deps: { readBlobAsBytes: (blob: Blob) => Promise<Uint8Array> },
): Promise<DropAction | null> {
  for (const item of items) {
    for (const mime of item.types) {
      if (!isAllowedImageMime(mime)) continue;
      const blob = await item.getType(mime);
      const bytes = await deps.readBlobAsBytes(blob);
      return { kind: 'save-and-paste', mime: mime as ScreenshotMime, bytes };
    }
  }
  return null;
}

export function isAllowedImageMime(mime: string): mime is ScreenshotMime {
  return ALLOWED_MIMES.has(mime as ScreenshotMime);
}

// Konvertiert ein Uint8Array in den base64-String, den fs:save-screenshot
// erwartet. Im Renderer ist `btoa` verfügbar, aber nur für binär-sichere
// Strings — wir bauen einen latin1-Slice zusammen, weil ArrayBuffer-Bytes
// 0x00..0xff abdecken (außerhalb von UTF-8).
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    // String.fromCharCode mit Uint8Array → latin1-codepoints; safe für btoa.
    bin += String.fromCharCode(...slice);
  }
  return btoa(bin);
}

// Bequemer Top-Level-Builder: nimmt eine Liste DropActions, ruft den Saver
// für `save-and-paste`-Einträge und liefert die finale Pfad-Sequenz zum
// Pasten. Skipped silently fehlgeschlagene Saves (z.B. EACCES) — der Caller
// loggt sie, der User merkt es am ausbleibenden Pfad.
export interface PathInsertionDeps {
  saveScreenshot: (input: {
    mime: ScreenshotMime;
    base64: string;
  }) => Promise<{ ok: true; absolutePath: string } | { ok: false; error: string }>;
  log?: (msg: string, error?: unknown) => void;
}

export async function actionsToInsertText(
  actions: readonly DropAction[],
  deps: PathInsertionDeps,
): Promise<string> {
  const log = deps.log ?? (() => undefined);
  const paths: string[] = [];
  for (const action of actions) {
    if (action.kind === 'paste-path') {
      paths.push(action.absolutePath);
      continue;
    }
    const base64 = bytesToBase64(action.bytes);
    const saved = await deps.saveScreenshot({ mime: action.mime, base64 });
    if (saved.ok) {
      paths.push(saved.absolutePath);
    } else {
      log('Screenshot-Save fehlgeschlagen', saved.error);
    }
  }
  if (paths.length === 0) return '';
  return paths.map(quotePathIfNeeded).join(' ');
}
