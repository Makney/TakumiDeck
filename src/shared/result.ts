import type { IpcResult } from './types';

// Helfer, um Result-Type-Werte konsistent zu erzeugen.
// Verwendung in Main-Handlern: `return ok(data)` oder `return err('Beschreibung', 'CODE')`.
export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function err<T = never>(error: string, code?: string): IpcResult<T> {
  return code === undefined ? { ok: false, error } : { ok: false, error, code };
}

// Verwandelt einen unbekannten Fehler in einen Error-Result.
// Nützlich in catch-Blöcken, um Stack-Strings zu vermeiden und Codes zu setzen.
export function errFromUnknown<T = never>(e: unknown, code?: string): IpcResult<T> {
  const msg = e instanceof Error ? e.message : String(e);
  return err(msg, code);
}
