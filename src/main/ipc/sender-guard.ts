import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { err, ok } from '@shared/result';
import type { IpcResult } from '@shared/types';

// Bereich-4-Review (B-2): Sender-Validation für privilegierte IPC-Channels.
//
// `ipcMain.handle` ruft den Handler aus JEDEM `WebContents` auf, der den Channel
// invoked — Renderer-Hauptfenster, BrowserView, Webview, künftige Side-Windows.
// Heute existiert nur das Hauptfenster, aber jeder neue WebContents wäre
// automatisch privilegiert. Defense-in-Depth: vor dem ersten Side-Effect prüfen,
// dass `event.sender` exakt das MainWindow-WebContents ist.
//
// Der Resolver wird einmal beim App-Start gesetzt (main.ts), bevor die Handler
// registriert werden. Falls er nie gesetzt wurde, blocken wir defensiv —
// Tests müssen den Resolver entweder mocken oder die Handler direkt aufrufen
// (ohne ipcMain-Roundtrip, wie es git-ipc.test.ts bereits tut).

type WebContentsResolver = () => WebContents | null;

let resolver: WebContentsResolver | null = null;

export function setMainWebContentsResolver(fn: WebContentsResolver): void {
  resolver = fn;
}

// Für Tests: Resolver wieder löschen, damit Side-Effects zwischen Suites nicht leaken.
export function resetMainWebContentsResolver(): void {
  resolver = null;
}

export function assertFromMainWindow(event: IpcMainInvokeEvent): IpcResult<null> {
  if (resolver === null) {
    // Kein Resolver gesetzt → defensiv blocken. Würde im normalen Betrieb nie
    // passieren (main.ts setzt den Resolver vor jeder Handler-Registrierung).
    return err('Sender-Guard nicht initialisiert', 'SENDER_GUARD_UNINITIALIZED');
  }
  const main = resolver();
  if (main === null) {
    // MainWindow existiert (noch) nicht — z.B. während Shutdown. IPC sollte zu
    // diesem Zeitpunkt nichts mehr verarbeiten.
    return err('Hauptfenster nicht verfügbar', 'SENDER_GUARD_NO_MAIN_WINDOW');
  }
  if (event.sender !== main) {
    return err('IPC-Aufruf nicht vom Hauptfenster', 'SENDER_GUARD_FORBIDDEN');
  }
  return ok(null);
}
