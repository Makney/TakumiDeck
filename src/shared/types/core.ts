// Geteilte Basis-Typen, die keinem Fach-Domain zuzuordnen sind.

// Re-Export der Schema-abgeleiteten Typen: schemas.ts ist die Single Source of
// Truth für IPC-Vertrags-Shapes. Konsumenten können wahlweise hier oder direkt
// aus @shared/schemas importieren.
import type { ClaudeMdFrontmatter, WindowAction } from '../schemas';
export type { ClaudeMdFrontmatter, WindowAction };

// Result-Type-Pattern: IPC-Handler werfen nicht, sondern returnen ein Result.
// Renderer muss `ok` prüfen, bevor `data` benutzt wird.
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
