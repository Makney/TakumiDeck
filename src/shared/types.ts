// Domänen-Typen, die zwischen Main und Renderer geteilt werden.
// Sprint 1: Settings + App-Misc + IpcResult.
// Sprint 2: Session-Row, PTY-Inputs/-Events, RendererApi-Erweiterung.

// Re-Export der Schema-abgeleiteten Typen: schemas.ts ist die Single Source of
// Truth für IPC-Vertrags-Shapes. Konsumenten können wahlweise hier oder direkt
// aus @shared/schemas importieren.
import type { ClaudeMdFrontmatter, WindowAction } from './schemas';
export type { ClaudeMdFrontmatter, WindowAction };

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
  // Sprint 9 — UI-Slot: Reset-Zeitpunkt für wöchentliche Limits (z.B.
  // Anthropic's Account-weiter Reset jeden Montag 00:00 UTC). UsageBar
  // zeigt den Wert im Tooltip; die Token-Aggregation respektiert ihn
  // erst in Phase 2 — bis dahin bleibt das `window_hours`-Rolling-Window
  // gültig.
  //   day_of_week: 0=Sonntag, 1=Montag, ..., 6=Samstag
  //   hour:        0–23
  //   minute:      0–59
  reset_schedule?: {
    day_of_week: number;
    hour: number;
    minute: number;
  };
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
  // Sprint-8 (Variante A): zusätzliche Sensitive-File-Patterns als RegEx-Strings.
  // Werden im Pre-Commit-Panel ZUSÄTZLICH zu den hartcoded Defaults
  // (.env(.*), secrets.*, *.key, *.pem) ausgewertet. Defaults sind nicht
  // deaktivierbar — der User kann nur erweitern.
  sensitive_file_patterns: string[];
}

// Session-Row laut SQLite-Schema (Architektur Kapitel 4).
// status-Werte und type-Werte folgen Architektur 6.2.
export type SessionType = 'feature' | 'bug' | 'review' | 'docs-sync';
// Phase-2 Season-1 ergänzt `permission-prompt`. Treiber ist die volle
// TUI-State-Detection (siehe src/shared/tui-patterns.ts). DB-Layer ist Text-
// Column und braucht keine Migration; das Schema-Update in `schemas.ts` reicht.
export type SessionStatus =
  | 'running'
  | 'waiting'
  | 'idle'
  | 'permission-prompt'
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
  // Sprint-6-Hotfix: claude-codes eigene Session-UUID (= das, was --resume erwartet).
  // Ab Sprint-6-Hotfix gleich `id`, weil beim Spawn `--session-id <id>` vorgegeben wird.
  // Für Legacy-Sessions (Sprint 2/3 + pre-fix Sprint 6) null, bis der JSONL-Watcher
  // sie aus der ersten Zeile rückwirkend befüllt.
  claude_session_id: string | null;
}

// PTY-IPC-Payloads (Renderer → Main).
// Bereich-4-Review (B-5): cwd wird im Main aus projects.getById(projectId).path
// hergeleitet — Renderer übergibt keinen freien Pfad mehr.
export interface PtyCreateInput {
  sessionId: string;
  // Sprint-5-Fix: Renderer schickt jetzt das aktive Projekt mit, damit die DB-
  // Session am echten Projekt hängt (statt am Default-Project-Lifeline aus Sprint 2).
  projectId: string;
  title: string;
  type: SessionType;
  model: string;
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

// Phase-2 Season-1: Pattern-Match-Resultat aus dem Renderer.
// `state` ist auf die vier Detection-Werte beschränkt; alles andere ist Sache
// der etablierten Lifecycle-IPCs (close/archive/resume/update).
export interface PtyTuiStateInput {
  sessionId: string;
  state: 'running' | 'waiting' | 'idle' | 'permission-prompt';
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

// Sprint-6-UX-Fix: Archive-Aktion aus dem Verlauf-Detail-Pane.
export interface SessionArchiveInput {
  sessionId: string;
}

export interface SessionResumeInput {
  sessionId: string;
  cols: number;
  rows: number;
}

// --- Session-Verlauf (Sprint 6) -------------------------------------

// Filter-Set MVP laut Architektur 6.6: Typ, Status, Volltext-Suche im Titel.
// Modell-Filter ist Phase 2 — bewusst NICHT mitgenommen.
// Leere Listen bedeuten "kein Filter aktiv" (= alle Werte erlaubt).
export interface SessionHistoryInput {
  projectId: string;
  types?: SessionType[];
  statuses?: SessionStatus[];
  query?: string;
}

// Ergebnis-Eintrag fürs Verlauf-Panel.
// Felder laut Architektur 6.6: Season-Nr/Typ, Name, Status, Modell, Datum, Notizen-Count
// plus Token-Total (für Detail-Pane). notes_md kommt mit, damit das Detail-Pane den
// vollen Text rendern kann ohne zusätzlichen Roundtrip — typische Notes sind <2 KB.
export interface SessionHistoryEntry {
  id: string;
  project_id: string;
  title: string;
  type: SessionType;
  season_number: number | null;
  status: SessionStatus;
  current_model: string | null;
  cwd: string;
  notes_md: string;
  started_at: number;
  ended_at: number | null;
  // Aus messages aggregiert: Summen + Anzahl. Sessions ohne Messages haben 0/0/0.
  tokens_in: number;
  tokens_out: number;
  message_count: number;
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

export interface ProjectReadCfgInput {
  projectId: string;
}

// --- Datei-Browser-Tree (Sprint 7, Phase 5) ---------------------------

// Hierarchischer Tree-Knoten für den Right-Pane-Datei-Browser. Verzeichnisse
// haben children (rekursiv); Files haben kein children-Feld. Pfade sind
// Forward-Slash-getrennt und projekt-relativ — der Renderer gibt sie 1:1 an
// fs:read zurück, wenn der User auf eine Datei klickt.
export interface FsTreeNode {
  name: string;
  relPath: string;
  kind: 'file' | 'dir';
  // Pflicht bei kind=dir; optional bei file (= immer leer/undefined). Leeres
  // children-Array bei dir bedeutet entweder echtes Leere-Verzeichnis ODER
  // dass die maxDepth des Scans erreicht wurde — Renderer kann das nicht
  // unterscheiden, was im MVP akzeptabel ist.
  children?: FsTreeNode[];
}

export interface FsListTreeInput {
  projectId: string;
  // Optional: Tiefe override. Default 5 (gleiches Limit wie Workspace-Scanner).
  maxDepth?: number;
}

// --- Filesystem read/write (Sprint 7) ---------------------------------

export interface FsReadInput {
  projectId: string;
  relPath: string;
}

export interface FsWriteInput {
  projectId: string;
  relPath: string;
  content: string;
}

export interface FsReadResult {
  // Voller Datei-Inhalt (UTF-8). Editor lädt diesen als Initial-Content.
  content: string;
  // Pfad relativ zum Projekt — Renderer behält ihn im Tab-State.
  relPath: string;
  // Absoluter Pfad (für Hover/Title-Anzeige); nie zur Re-Identifikation nutzen,
  // weil dasselbe File zwei Project-Backings haben kann.
  absolutePath: string;
}

export interface FsWriteResult {
  // Bytes geschrieben (UTF-8-Länge). Renderer nutzt das als Bestätigung, nicht
  // semantisch — der wichtige Effekt ist der Save selbst.
  bytesWritten: number;
}

// Phase-2 Season-2: Screenshot-Drop. Renderer übergibt Mime + base64-Bytes,
// Main schreibt die Datei in <userData>/screenshots/ und liefert den
// absoluten Pfad zurück, der dann ins Terminal gepastet wird.
export interface FsSaveScreenshotInput {
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  base64: string;
}

export interface FsSaveScreenshotResult {
  absolutePath: string;
  fileName: string;
  bytesWritten: number;
}

// --- Git (Sprint 7) --------------------------------------------------

// Status-Codes aus simple-git's Single-Char-Codes auf semantisches Vokabular gemappt.
// 'unchanged' deckt Whitespace/leeren Code im jeweiligen Slot ab (z.B. wenn nur der
// Worktree, nicht der Index verändert wurde).
export type GitFileStatus =
  | 'unchanged'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'renamed'
  | 'copied'
  | 'unmerged';

export interface GitFileChange {
  // Pfad relativ zum Repo-Root, in Forward-Slash-Notation (simple-git normalisiert).
  path: string;
  // Worktree-Status: was hat der User im Working-Tree, das noch nicht gestaged ist.
  worktreeStatus: GitFileStatus;
  // Index-Status: was ist schon mit `git add` markiert. Beide getrennt, damit das
  // Pre-Commit-Panel staged vs. unstaged differenzieren kann.
  indexStatus: GitFileStatus;
  // Sprint 9 — Line-Counts pro File (aus `git diff --numstat`). Untracked
  // Files liefern keine Counts (Git kennt sie noch nicht), Binary-Files
  // ebenfalls nicht — daher `null` als legitimer Wert für „nicht messbar".
  insertions: number | null;
  deletions: number | null;
}

export interface GitStatusResult {
  branch: string;
  files: GitFileChange[];
  ahead: number;
  behind: number;
}

// IPC-Inputs: Renderer schickt die projectId, der Main löst sie gegen die DB auf
// und ruft den Driver mit dem absoluten Repo-Pfad. Direkte Pfad-Übergabe vermeiden
// wir bewusst — sonst kann der Renderer einen beliebigen Pfad reinschicken und
// simple-git darauf laufen lassen.
export interface GitStatusInput {
  projectId: string;
}

export interface GitDiffInput {
  projectId: string;
  // Optional: nur den Diff einer einzelnen Datei (für Datei-Tab-Diff in Sprint 7+).
  // null/undefined = kompletter Working-Tree-Diff.
  filePath?: string;
}

export interface GitDiffResult {
  // Roher Unified-Diff-Text wie git diff ihn ausgibt. Leer-String = kein Diff.
  // Renderer parst den Patch via @codemirror/merge (Phase 6).
  patch: string;
  // Ob der Pfad ein Git-Repo ist. False = kein .git im Project-Pfad,
  // Renderer zeigt entsprechenden Hinweis statt eines Diffs.
  hasGit: boolean;
}

// Phase 6: Datei-Inhalt am Git-Ref (Default 'HEAD'). Leerer String = Datei
// existiert am Ref nicht (z.B. neu im Working-Tree, nie committed).
export interface GitShowInput {
  projectId: string;
  relPath: string;
  ref?: string;
}

export interface GitShowResult {
  content: string;
  // hasGit-Hint analog zu GitDiffResult — sollte praktisch nie false sein,
  // weil der Caller vorher git:status gerufen hat (das hätte schon NOT_A_GIT_REPO
  // geliefert). Hier zur Defensiv-Konsistenz.
  hasGit: boolean;
}

// --- Templates (Sprint 6) --------------------------------------------

// Q1 + Q2 (B/B): on-demand-Discovery + beide Quellen separat mit source-Tag.
// `name` ist nur der Dateiname (z.B. "season_prompt.md"), `path` der absolute Pfad
// für Hover-Anzeige, `content` der rohe Markdown-Inhalt mit {{...}}-Variablen.
//
// Phase-2 Season-4: `relPath` ist gefuellt fuer projekt-relative Templates
// (source='project'), damit der Markdown-Editor im Right-Pane sie direkt
// oeffnen kann (fs:read/fs:write verlangen projekt-relative Pfade). Bei
// globalen Templates ist relPath null — sie liegen ausserhalb jedes Projekts.
export interface TemplateFile {
  source: 'global' | 'project';
  name: string;
  path: string;
  relPath: string | null;
  content: string;
}

export interface FsListTemplatesInput {
  // projectId muss in der DB existieren. Bei DEFAULT_PROJECT_ID werden NUR globale
  // Templates geliefert (Default-Project hat keinen eigenen docs-Ordner).
  projectId: string;
}

// Phase-2 Season-4: Auto-Variablen-Bundle, das Templates aus Quellen abseits
// des Renderers brauchen — SQLite (LETZTE_SEASON_NAME) und projekt-relative
// Markdown-Dateien (TECH_SCHULDEN.md + ENTSCHEIDUNGEN.md). Der Renderer
// produziert die einfacheren Auto-Variablen (PROJEKT_NAME/DATUM/...) weiterhin
// lokal in buildAutoVariables(); diese hier kommen aus dem Main.
export interface TemplatesResolveAutoVarsInput {
  projectId: string;
}

export interface TemplatesResolveAutoVarsResult {
  // Format: "Phase X Season Y: <Titel>" (wenn Phase aus current_phase_file
  // ableitbar) bzw. "Season Y: <Titel>" bzw. nur "<Titel>". Leer, wenn keine
  // completed Feature-Session existiert.
  letzte_season_name: string;
  // Top-N offene Schulden aus docs/TECH_SCHULDEN.md, durch \n\n getrennt.
  // Leer, wenn die Datei fehlt oder keine offenen Eintraege uebrig sind.
  tech_schulden_relevant: string;
  // Top-3 Eintraege aus docs/ENTSCHEIDUNGEN.md, durch \n\n getrennt.
  // Leer, wenn die Datei fehlt oder keine Eintraege parsbar sind.
  letzte_entscheidungen: string;
}

// --- Token-Tracking (Sprint 5) ---------------------------------------

// Geparste JSONL-Zeile, gefiltert auf das, was wir tatsächlich brauchen.
// timestamp wird vom Parser zu epoch-ms normalisiert (ISO-String → Date.parse).
export interface ParsedJsonlMessage {
  ts: number;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  // Summe input + cache_creation + cache_read — der Sprint-5-Konsum-Wert.
  totalTokens: number;
  // Roh-Zeilen-Inhalt für messages.content (kein Parsing-Aufwand für die Anzeige
  // im Verlauf-Panel, Sprint 6 entscheidet das endgültige Format).
  rawLine: string;
  // Sprint-6-Hotfix: claude-codes eigene Session-UUID, sofern in der JSONL-Zeile
  // angegeben. Wird vom Watcher genutzt, um Legacy-Sessions rückwirkend in
  // sessions.claude_session_id zu mappen (Resume-Bug-Fix Variante C).
  sessionId: string | null;
}

// Repository-Insert für eine messages-Row.
export interface MessageInsert {
  session_id: string;
  project_id: string | null;
  role: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  ts: number;
}

// Repository-Insert/Upsert für einen usage_buckets-Row.
// PRIMARY KEY ist (bucket_start, model) → Upsert mit `tokens = tokens + excluded.tokens`.
export interface UsageBucketUpsert {
  bucket_start: number; // epoch-Stunde (= floor(ts_ms / 3_600_000))
  model: string;
  tokens: number;
}

// Persistierter Lese-Offset pro JSONL-Datei.
export interface JsonlOffsetRow {
  file_path: string;
  offset_bytes: number;
  last_seen_at: number;
}

// IPC-Output von usage:window. Renderer rendert eine UsageBar pro Bar-Definition.
export interface UsageWindowResult {
  barId: string;
  label: string;
  tokens: number;
  limit: number;
  percent: number; // 0..100+ (kann >100 sein, wenn das Limit gerissen ist)
  // Wie wurde das Limit ermittelt? 'p90' (geschätzt aus den letzten N Stunden),
  // 'fixed' (fester Wert aus settings.fixed_limit), 'fallback' (model_limits-Default,
  // wenn der P90-Datensatz zu klein ist).
  limitSource: 'p90' | 'fixed' | 'fallback';
  windowHours: number;
  // Per-Modell-Aufschlüsselung (für Tooltips + Detail-Modal).
  perModel: Array<{ model: string; tokens: number }>;
  generatedAt: number;
}

// IPC-Output von usage:context. Per-Session-Kontext der zuletzt aktiven Message,
// vergleicht den letzten Stand gegen das Per-Modell-Limit.
export interface UsageContextResult {
  sessionId: string;
  model: string | null;
  tokens: {
    input: number;
    cache_creation: number;
    cache_read: number;
    total: number; // = input + cache_creation + cache_read
  };
  limit: number;
  percent: number;
  // epoch-ms der letzten message.usage-Zeile in der Session.
  lastEventAt: number | null;
}

// Phase-2-Stub für die Heatmap. Sprint 5 reserviert nur den Channel.
export interface UsageHeatmapResult {
  stub: true;
  message: string;
}

export interface UsageWindowInput {
  barId: string;
  asOf?: number;
}

export interface UsageContextInput {
  sessionId: string;
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
    // Sprint 8 (Architektur 6.0 Header-Bar): Window-Controls aus dem Renderer
    // triggern, weil die Header-Bar eigene Buttons rendert (-webkit-app-region:
    // no-drag).
    windowAction: (action: WindowAction) => Promise<IpcResult<null>>;
    // Sprint 8: Health-Check für die claude-Binary. Liefert ok=true mit dem
    // resolved-Pfad oder ok=false mit User-freundlicher Hinweistext.
    claudeHealth: () => Promise<
      IpcResult<{ resolved: string; healthy: true } | { resolved: null; healthy: false; hint: string }>
    >;
  };
  pty: {
    create: (input: PtyCreateInput) => Promise<IpcResult<SessionRow>>;
    write: (input: PtyWriteInput) => Promise<IpcResult<null>>;
    resize: (input: PtyResizeInput) => Promise<IpcResult<null>>;
    kill: (input: PtyKillInput) => Promise<IpcResult<null>>;
    // Phase-2 Season-1: Renderer pusht TUI-detektierten Status. Rückgabe ist
    // null bei Erfolg (Status gesetzt oder bereits aktuell), Error-Code bei
    // verweigertem Lifecycle-Übergang.
    pushTuiState: (input: PtyTuiStateInput) => Promise<IpcResult<null>>;
    // Listener-Registrierung. Rückgabewert ist die Unsubscribe-Funktion.
    onData: (handler: (event: PtyDataEvent) => void) => () => void;
    onExit: (handler: (event: PtyExitEvent) => void) => () => void;
  };
  sessions: {
    update: (input: SessionUpdateInput) => Promise<IpcResult<SessionRow>>;
    close: (input: SessionCloseInput) => Promise<IpcResult<SessionRow>>;
    resume: (input: SessionResumeInput) => Promise<IpcResult<SessionRow>>;
    history: (input: SessionHistoryInput) => Promise<IpcResult<SessionHistoryEntry[]>>;
    archive: (input: SessionArchiveInput) => Promise<IpcResult<SessionRow>>;
    // Phase-2 Season-1: Main pushed Status-Änderungen aktiv; Renderer-Store
    // abonniert und ruft setStatus auf, ohne selbst pollen zu müssen.
    onStatusPush: (handler: (event: SessionStatusPushEvent) => void) => () => void;
  };
  templates: {
    // Phase-2 Season-4: Auto-Variablen, die DB- oder FS-Zugriff brauchen.
    // Renderer kombiniert das Ergebnis mit den lokalen Auto-Variablen aus
    // buildAutoVariables() im Modal.
    resolveAutoVars: (
      input: TemplatesResolveAutoVarsInput,
    ) => Promise<IpcResult<TemplatesResolveAutoVarsResult>>;
  };
  fs: {
    listTemplates: (input: FsListTemplatesInput) => Promise<IpcResult<TemplateFile[]>>;
    // Sprint 7: Markdown-Editor liest und schreibt nur projekt-relativ.
    read: (input: FsReadInput) => Promise<IpcResult<FsReadResult>>;
    write: (input: FsWriteInput) => Promise<IpcResult<FsWriteResult>>;
    // Sprint 7, Phase 5: hierarchischer Datei-Browser-Tree für den Right-Pane.
    listTree: (input: FsListTreeInput) => Promise<IpcResult<FsTreeNode[]>>;
    // Phase-2 Season-2: Screenshot ins userData/screenshots/ ablegen,
    // absoluten Pfad zurückbekommen (wird im Terminal als Text gepastet,
    // damit claude-code das Bild via Read-Tool erreichen kann).
    saveScreenshot: (
      input: FsSaveScreenshotInput,
    ) => Promise<IpcResult<FsSaveScreenshotResult>>;
    // Phase-2 Season-2: Bridge zu Electron's webUtils.getPathForFile —
    // File.path wurde in Electron 32 entfernt. Liefert leeren String,
    // wenn das File keine Disk-Repräsentation hat (z.B. Clipboard-
    // Image oder Browser-Drag).
    getPathForFile: (file: File) => string;
  };
  git: {
    // Sprint 7: Branch + geänderte Files für Pre-Commit-Panel + Diff-Tab.
    status: (input: GitStatusInput) => Promise<IpcResult<GitStatusResult>>;
    // Working-Tree-Diff. filePath optional (= ganzer Tree).
    diff: (input: GitDiffInput) => Promise<IpcResult<GitDiffResult>>;
    // Datei-Inhalt am Ref (Default 'HEAD'); für Diff-Viewer (Phase 6).
    show: (input: GitShowInput) => Promise<IpcResult<GitShowResult>>;
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
  usage: {
    // 5h / weekly_all / weekly_design / weekly_sonnet etc. — eine Bar pro Aufruf.
    window: (input: UsageWindowInput) => Promise<IpcResult<UsageWindowResult>>;
    // Per-Session-Kontext-Bar.
    context: (input: UsageContextInput) => Promise<IpcResult<UsageContextResult>>;
    // Phase-2-Stub.
    heatmap: () => Promise<IpcResult<UsageHeatmapResult>>;
    // Renderer wird über neue Tokens benachrichtigt: 'global' = bestimmte limit_bar
    // wurde aktualisiert, 'context' = Per-Session-Kontext-Bar wurde aktualisiert.
    onUpdate: (handler: (event: UsageUpdateEvent) => void) => () => void;
  };
}

// Event-Push aus dem Watcher → Renderer. Architektur 4 trennt Live-Push (Per-Session
// sofort) vs. Debounced (globale Bars max 2/Sek). Der Renderer reagiert pro Kanal:
// `context` re-fetcht die Per-Session-Kontext-Bar, `global` re-fetcht alle limit_bars
// (oder gezielt die im scope angegebenen).
// Phase-2 Season-1: Main → Renderer, wenn der State-Detection-Loop einen
// Live-Status (running/waiting/idle) geändert hat.
export interface SessionStatusPushEvent {
  sessionId: string;
  status: SessionStatus;
}

export interface UsageUpdateEvent {
  kind: 'global' | 'context';
  // Optional: betroffene Session (kind === 'context') oder Liste von Bar-IDs
  // (kind === 'global', leer = alle).
  sessionId?: string;
  barIds?: string[];
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
