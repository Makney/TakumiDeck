import type { IpcResult } from './types';

// Helfer, um Result-Type-Werte konsistent zu erzeugen.
// Verwendung in Main-Handlern: `return ok(data)` oder `return err('Beschreibung', 'CODE')`.
export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

// Einheitliche Error-Shape: `code` ist immer als Key vorhanden (undefined, wenn
// nicht gesetzt). So tragen alle Error-Results dasselbe Wire-Format und ein
// `'code' in result`-Check verhält sich konsistent über IPC.
export function err<T = never>(error: string, code?: string): IpcResult<T> {
  return { ok: false, error, code };
}

// Verwandelt einen unbekannten Fehler in einen Error-Result.
// Nützlich in catch-Blöcken, um Stack-Strings zu vermeiden und Codes zu setzen.
export function errFromUnknown<T = never>(e: unknown, code?: string): IpcResult<T> {
  const msg = e instanceof Error ? e.message : String(e);
  return err(msg, code);
}
