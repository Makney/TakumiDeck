// Domänen-Typen, die zwischen Main und Renderer geteilt werden.
// Sprint 1: Settings + App-Misc + IpcResult.
// Sprint 2: Session-Row, PTY-Inputs/-Events, RendererApi-Erweiterung.

// Result-Type-Pattern: IPC-Handler werfen nicht, sondern returnen ein Result.
// Renderer muss `ok` prüfen, bevor `data` benutzt wird.
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

// Plannutzungs-Bar-Konfiguration (im Settings-JSON serialisiert).
export interface LimitBar {
  id: string;
  label: string;
  window_hours: number;
  filter: 'all' | 'top_tier' | 'sonnet' | 'haiku' | 'custom';
  limit_method: 'p90' | 'fixed';
  model_pattern?: string;
  fixed_limit?: number;
}

// Vollständige Settings-Shape laut Architektur Kapitel 4.
// Wird als settings.json im AppData-Ordner persistiert.
export interface AppSettings {
  workspace_path: string;
  default_model: string;
  // Pfad zur claude-Binary. Default 'claude' nutzt PATH; user kann absoluten Pfad setzen.
  claude_binary_path: string;
  model_limits: Record<string, number>;
  default_limit: number;
  limit_bars: LimitBar[];
  p90_window_hours: number;
  token_warning_thresholds: {
    yellow: number;
    orange: number;
    red: number;
  };
  terminal_font_family: string;
  terminal_font_size: number;
  theme: 'dark' | 'light';
  accent_color: string;
  shortcuts: Record<string, string>;
}

// Session-Row laut SQLite-Schema (Architektur Kapitel 4).
// status-Werte und type-Werte folgen Architektur 6.2.
export type SessionType = 'feature' | 'bug' | 'review' | 'docs-sync';
export type SessionStatus =
  | 'running'
  | 'waiting'
  | 'idle'
  | 'completed'
  | 'archived'
  | 'interrupted'
  | 'error';

export interface SessionRow {
  id: string;
  project_id: string;
  title: string;
  type: SessionType;
  season_number: number | null;
  status: SessionStatus;
  current_model: string | null;
  worktree_branch: string | null;
  notes_md: string;
  cwd: string;
  started_at: number;
  ended_at: number | null;
}

// PTY-IPC-Payloads (Renderer → Main).
export interface PtyCreateInput {
  sessionId: string;
  title: string;
  type: SessionType;
  model: string;
  cwd: string;
  cols: number;
  rows: number;
}

export interface PtyWriteInput {
  sessionId: string;
  data: string;
}

export interface PtyResizeInput {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface PtyKillInput {
  sessionId: string;
}

// Events Main → Renderer.
export interface PtyDataEvent {
  sessionId: string;
  data: string;
}

export interface PtyExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

// Session-Update-Payload (Sprint 2: nur die in Sprint 2 wirklich beschreibbaren Felder).
// Weitere Felder (status, ended_at, current_model) folgen mit Sprint 3 (Lifecycle).
export interface SessionUpdateInput {
  sessionId: string;
  patch: {
    title?: string;
    notes_md?: string;
    status?: SessionStatus;
    current_model?: string | null;
    ended_at?: number | null;
  };
}

// Bridge-API-Shape, die der Renderer über window.api erhält.
export interface RendererApi {
  settings: {
    get: () => Promise<IpcResult<AppSettings>>;
    set: (patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>;
  };
  app: {
    getVersion: () => Promise<IpcResult<string>>;
    openDataFolder: () => Promise<IpcResult<string>>;
  };
  pty: {
    create: (input: PtyCreateInput) => Promise<IpcResult<SessionRow>>;
    write: (input: PtyWriteInput) => Promise<IpcResult<null>>;
    resize: (input: PtyResizeInput) => Promise<IpcResult<null>>;
    kill: (input: PtyKillInput) => Promise<IpcResult<null>>;
    // Listener-Registrierung. Rückgabewert ist die Unsubscribe-Funktion.
    onData: (handler: (event: PtyDataEvent) => void) => () => void;
    onExit: (handler: (event: PtyExitEvent) => void) => () => void;
  };
  sessions: {
    update: (input: SessionUpdateInput) => Promise<IpcResult<SessionRow>>;
  };
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
