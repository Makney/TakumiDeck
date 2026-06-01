// Sessions: Row-Shape, PTY-/Terminal-IPC, Lifecycle-Payloads und Verlauf.

// Session-Row laut SQLite-Schema (Architektur Kapitel 4).
// status-Werte und type-Werte folgen Architektur 6.2.
// Phase-2 Season-5: 'custom' fuer User-definierte Session-Arten; die freie
// Bezeichnung lebt in `custom_type_label` (nullable), damit der Verlauf-Filter
// alle 'custom'-Sessions in einem Bucket halten kann.
// Phase-2 Season-31: 'terminal' spawnt direkt eine PowerShell (kein claude),
// fuer Quick-Shells / git-Operationen / ad-hoc-Befehle ohne Token-Verbrauch.
// claude_session_id, jsonl_path und current_model bleiben fuer terminal-Sessions
// dauerhaft NULL — Resume spawnt die Shell im gespeicherten cwd neu.
export type SessionType = 'feature' | 'bug' | 'review' | 'docs-sync' | 'custom' | 'terminal';
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
  // Phase-2 Season-5: freie Bezeichnung fuer type='custom'. Nur dort befuellt;
  // bei allen anderen Typen null (Migration 0005 setzt NULL als Default).
  custom_type_label: string | null;
  // Phase-2 Season-15: vollstaendiger Pfad zur passenden claude-code JSONL-Datei
  // (~/.claude/projects/<encoded-cwd>/<claude-uuid>.jsonl). Watcher und
  // Polling-Ring matchen direkt darueber, statt den Filename pro Tick neu zu
  // parsen. null fuer Legacy-Sessions, bis Spawn-Pfad / Watcher-Backfill /
  // Boot-One-Shot-Pass die Spalte befuellt.
  jsonl_path: string | null;
  // Phase-2 Season-29 (Multi-Tab-Diff): HEAD-SHA des Projekt-Repos zum
  // Zeitpunkt des PTY-Spawns. Der Session-Diff-Modus im DiffViewer
  // vergleicht den Working-Tree gegen diesen Baseline-Commit. NULL bei
  // Legacy-Sessions, has_git=0-Projekten, detached HEAD ohne Commit oder
  // wenn der revParse-Aufruf beim Spawn fehlgeschlagen ist.
  start_commit_sha: string | null;
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
  // Phase-2 Season-5: nur bei type='custom' gesetzt — freie User-Bezeichnung
  // (z.B. "Refactor"). Bei den vier festen Typen weglassen oder null.
  customTypeLabel?: string | null;
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

// Phase-2 Season-33: Terminal-Buffer-Persistierung. Renderer serialisiert
// im Cleanup via @xterm/addon-serialize und schickt den getrimten Snapshot
// (Pure-Helper `trimBufferSnapshot`) ans Main. Beim Mount eines resumed
// Terminal-Tabs ruft der Renderer Load und schreibt das Ergebnis vor dem
// ersten PTY-Frame zurueck in xterm. `snapshot` ist null, wenn die
// Session noch keinen persistierten Buffer hat (Neu-Spawn oder noch nie
// resumed) bzw. wenn der Save vom Handler abgelehnt wurde (claude-Typ).
export interface TerminalSaveBufferInput {
  sessionId: string;
  snapshot: string;
}

export interface TerminalLoadBufferInput {
  sessionId: string;
}

export interface TerminalLoadBufferResult {
  snapshot: string | null;
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

// Filter-Set: Typ, Status, Volltext-Suche im Titel und (Phase-2 Season-10)
// Modell. Leere Listen bedeuten "kein Filter aktiv" (= alle Werte erlaubt).
export interface SessionHistoryInput {
  projectId: string;
  types?: SessionType[];
  statuses?: SessionStatus[];
  query?: string;
  // Phase-2 Season-10: filtert auf sessions.current_model. Leere Liste oder
  // weggelassen = kein Filter. Match ist exakt (kein Wildcard, keine
  // Familien-Aggregation wie "alle Opus") — die UI bietet die fuenf bekannten
  // Modell-IDs als feste Pillen-Liste.
  models?: string[];
}

// Phase-2 Season-10: Aggregat-Eintrag fuer die Detail-Pane-"Modelle"-Liste.
// Ein Eintrag pro Modell, das in den messages der Session vorkommt. Der
// Watcher schreibt messages.model ab Migration 0006; Pre-Migration-Rows
// haben einen Backfill aus sessions.current_model. NULL-Modelle (externe
// Sessions ohne Modell-Info) werden vom Aggregat ausgeschlossen.
export interface SessionModelAggregateEntry {
  model: string;
  count: number;
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
  // Phase-2 Season-5: freie Bezeichnung fuer type='custom', sonst null.
  custom_type_label: string | null;
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
  // Phase-2 Season-10: Modell-Aggregat fuer die Detail-Pane-"Modelle"-Liste.
  // Absteigend sortiert nach count (Tie-Break model ASC). Leer, wenn die
  // Session keine messages mit Modell-Info hat. Reise mit jedem Eintrag mit,
  // damit der Detail-Pane keinen zweiten Round-Trip braucht (max 5 Eintraege
  // pro Session = vernachlaessigbare Payload).
  models: SessionModelAggregateEntry[];
}

// Event-Push aus dem State-Detection-Loop → Renderer.
// Phase-2 Season-1: Main → Renderer, wenn der State-Detection-Loop einen
// Live-Status (running/waiting/idle) geändert hat.
export interface SessionStatusPushEvent {
  sessionId: string;
  status: SessionStatus;
}
