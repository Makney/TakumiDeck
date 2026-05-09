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

// Sprint-3-Payloads für session:close und session:resume.
export interface SessionCloseInput {
  sessionId: string;
}

export interface SessionResumeInput {
  sessionId: string;
  cols: number;
  rows: number;
}

// --- Workspace / Projects (Sprint 4) --------------------------------

// SQLite-Project-Row laut Schema in 0001_init.sql plus abgeleiteter session_count
// (Aggregat aus der sessions-Tabelle). Sprint 4 nutzt session_count, um den
// Legacy-Default-Bucket nur bei tatsächlich verbleibenden Sessions in der Sidebar
// zu zeigen — sonst verschwindet er sauber, sobald der cwd-Remap alles umgehängt hat.
export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  added_manually: number; // SQLite BOOLEAN → 0/1
  has_git: number;
  next_season_number: number;
  created_at: number;
  session_count: number;
}

// Output des Workspace-Scanners. Wird im Main aus rohem fs zusammengebaut, dann
// per insert() in die projects-Tabelle übernommen — id und created_at vergibt das Repo.
export interface ScannedProject {
  name: string;
  path: string;
  has_git: boolean;
}

// Frontmatter-Output des CLAUDE.md-Parsers (zod-validierte Form).
// `body` ist der reine Markdown-Text *nach* dem Frontmatter-Block.
// `frontmatter` ist null, wenn entweder gar keine Frontmatter da ist oder die
// workbench-Section fehlt — beides sind legitime Zustände, keine Fehler.
export interface ClaudeMdParseResult {
  frontmatter: ClaudeMdFrontmatter | null;
  body: string;
  warnings: string[];
}

export interface ClaudeMdFrontmatter {
  workbench: {
    project_name?: string;
    default_model?: string;
    current_phase_file?: string;
    trigger_phrases: {
      docs_update: string;
      commit: string;
    };
    on_demand_files?: Array<
      | string
      | { path: string; trigger?: string; auto_inject?: boolean }
    >;
  };
}

export interface ProjectAddInput {
  path: string;
}

export interface ProjectReadCfgInput {
  projectId: string;
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
    close: (input: SessionCloseInput) => Promise<IpcResult<SessionRow>>;
    resume: (input: SessionResumeInput) => Promise<IpcResult<SessionRow>>;
  };
  projects: {
    list: () => Promise<IpcResult<ProjectRow[]>>;
    // project:add ohne Args → Main öffnet dialog.showOpenDialog selbst und liefert
    // entweder den hinzugefügten Project-Row zurück, oder null bei Cancel, oder ein
    // Result-Err, falls der gewählte Ordner keine CLAUDE.md enthält bzw. der Pfad
    // bereits existiert.
    add: () => Promise<IpcResult<ProjectRow | null>>;
    // Re-Scan des konfigurierten workspace_path. Liefert die finale Liste — neue Projekte
    // wurden bereits in der DB persistiert, der Renderer aktualisiert seinen Store anhand
    // der zurückgegebenen Liste.
    scanWorkspace: () => Promise<IpcResult<ProjectRow[]>>;
    readClaudeMd: (input: ProjectReadCfgInput) => Promise<IpcResult<ClaudeMdParseResult>>;
  };
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
