// Pure-Logik für den Screenshot-Drop aus dem Terminal-Pane (Phase-2 Season-2).
// Hier wohnt alles, was sich ohne echte Disk und ohne Electron testen lässt:
//   - MIME → Dateinamen-Extension
//   - Zeitstempel-basierter Default-Filename
//
// Der eigentliche `fs.writeFile`-Aufruf bleibt im IPC-Handler (siehe
// src/main/ipc/fs.ts), damit dieses Modul Node-Driver-frei ist und in den
// Unit-Tests ohne tmpdir-Setup auskommt.

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Wirft, wenn der MIME-Typ nicht in der Whitelist steht — das schema-validierte
// IPC-Payload hat den Wert schon eingegrenzt, der Throw ist eine Defensive für
// Aufrufer, die den Parser umgehen würden.
export function mimeToExtension(mime: string): string {
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error(`Unbekannter Screenshot-MIME-Typ: ${mime}`);
  return ext;
}

// Liefert den Dateinamen `screenshot-YYYY-MM-DD-HH-MM-SS-mmm.<ext>`.
// Wir bauen den String per UTC-Komponenten zusammen statt toISOString()
// zu parsen, weil das Ergebnis ohne Doppelpunkte / Punkte direkt
// Windows-Datei-kompatibel ist. Lexikographische Sortierung im Ordner
// entspricht der Erstellungs-Reihenfolge.
export function buildScreenshotFilename(now: Date, mime: string): string {
  const ext = mimeToExtension(mime);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const stamp =
    `${now.getUTCFullYear()}-` +
    `${pad(now.getUTCMonth() + 1)}-` +
    `${pad(now.getUTCDate())}-` +
    `${pad(now.getUTCHours())}-` +
    `${pad(now.getUTCMinutes())}-` +
    `${pad(now.getUTCSeconds())}-` +
    `${pad(now.getUTCMilliseconds(), 3)}`;
  return `screenshot-${stamp}.${ext}`;
}
