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
  // Phase 2 Season Flacsh: Aggregations-Modus. `rolling` (Default) zaehlt die
  // letzten `window_hours` Stunden ab jetzt; `session_block` startet ein
  // fixes `window_hours`-Window beim ersten Token nach dem letzten
  // Window-Ende — Anthropic-Realitaet fuer das 5h-Limit.
  aggregation_mode?: 'rolling' | 'session_block';
}

// Vollständige Settings-Shape laut Architektur Kapitel 4.
// Wird als settings.json im AppData-Ordner persistiert.
export interface AppSettings {
  workspace_path: string;
  // Phase-2 Season-18: First-Start-Workspace-Wizard. `false` signalisiert, dass
  // der Welcome-Screen noch nicht durchlaufen wurde — der Boot-Scan wird dann
  // uebersprungen und der Renderer zeigt den Wizard statt des Haupt-Layouts.
  // Bestandsuser sehen den Wizard NICHT: `buildDefaultSettings()` setzt den
  // Default auf `true`, und nur `SettingsStore.initialize()` schreibt bei
  // einer wirklich frisch angelegten Datei `false`.
  workspace_wizard_completed: boolean;
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
  // Phase-2 Season-8 (Soft-Warning): zusaetzlicher persoenlicher Schwellwert
  // an der Per-Session-Kontext-Bar (Action-Bar-ctx-Slot). Marker + dezente
  // Tonung, sobald die Auslastung den Wert ueberschreitet — unabhaengig von
  // den globalen yellow/orange/red-Stufen oben (die schalten ab 70 % etc.).
  // `threshold_percent` ist die User-Erfahrungsgrenze (Default 20 %).
  // `enabled=false` blendet Marker und Tonung komplett aus.
  context_soft_warning: {
    enabled: boolean;
    threshold_percent: number;
  };
  // Phase-2 Season-17: Boot-One-Shot-Retention fuer <userData>/screenshots/.
  // `max_age_days = 0` schaltet die Age-Regel ab, `max_total_mib = 0` das Cap.
  // Beide auf 0 deaktiviert die Auto-Retention komplett.
  screenshot_retention: {
    max_age_days: number;
    max_total_mib: number;
  };
  // Phase-2 Season-19: Easter-Egg-Token-Vergleiche in der Stats-Pane-
  // Uebersicht. `false` blendet den Streifen unter der Heatmap aus.
  easter_egg_enabled: boolean;
  // Phase-2 Season-20: Top-N fuer {{TECH_SCHULDEN_RELEVANT}} und
  // {{LETZTE_ENTSCHEIDUNGEN}}. 0 unterdrueckt die jeweilige Variable.
  template_top_n: {
    schulden: number;
    entscheidungen: number;
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
// Phase-2 Season-5: 'custom' fuer User-definierte Session-Arten; die freie
// Bezeichnung lebt in `custom_type_label` (nullable), damit der Verlauf-Filter
// alle 'custom'-Sessions in einem Bucket halten kann.
export type SessionType = 'feature' | 'bug' | 'review' | 'docs-sync' | 'custom';
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

// Phase-2 Season-8: project:remove. Renderer schickt die DB-UUID; der Main
// hängt alle Sessions des Projekts auf den Default-Bucket um (samt messages)
// und löscht die projects-Row. DEFAULT_PROJECT_ID ist server-seitig immutable.
export interface ProjectRemoveInput {
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

// Phase-2 Season-17: Summary fuer den Settings-Manual-Clear-Block (vor und
// nach dem Klick).
export interface FsScreenshotsSummaryResult {
  fileCount: number;
  totalBytes: number;
}

// Phase-2 Season-17: Bilanz nach Manual-Clear. `failures` zaehlt Einzel-Files,
// die der unlink-Pass nicht losgeworden ist (z.B. EBUSY), damit das UI eine
// dezente Warnung zeigen kann.
export interface FsClearScreenshotsResult {
  filesDeleted: number;
  bytesFreed: number;
  failures: number;
}

// Phase-2 Season-18: Ordner-Picker fuer den First-Start-Workspace-Wizard.
// `title` ist optional; wenn weg, nimmt der Handler einen Default. Es gibt
// bewusst kein `defaultPath` — der Wizard waehlt typischerweise sowieso
// einen frischen Pfad, und im Renderer wuerden Path-Pre-Fills die Sandbox-
// Grenze unnoetig aufweichen.
export interface AppPickFolderInput {
  title?: string;
}

// `canceled=true` heisst der User hat den Dialog geschlossen; `path` ist dann
// `null`. Im Erfolgsfall liefert `path` einen absoluten Pfad zurueck.
export interface AppPickFolderResult {
  canceled: boolean;
  path: string | null;
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
//
// Phase-2 Season-23: optionaler YAML-Frontmatter mit `variables:`-Map.
// Wenn vorhanden, deklariert das Template explizit welche {{TOKENS}} Inputs
// vs. Auto-Vars sind. `content` ist immer der RAW-Inhalt inkl. Frontmatter —
// Body-Extraktor und Variable-Filler kommen damit klar, weil das Frontmatter
// keinen Token enthaelt. `schema=null` heisst entweder kein Frontmatter da
// oder Frontmatter-Parsing fehlgeschlagen → Renderer faellt auf die alten
// hartcodierten Variable-Listen zurueck (Backward-Compat fuer Bestand).
export interface TemplateFile {
  source: 'global' | 'project';
  name: string;
  path: string;
  relPath: string | null;
  content: string;
  schema: TemplateSchema | null;
}

// Phase-2 Season-23: pro-Token-Deklaration im Template-Frontmatter.
//
// Diskriminierte Union via Schluessel-Praesenz (`auto` vs. `input`), damit das
// YAML kompakt bleibt:
//   CURRENT_VERSION: { auto: claude_md.workbench.current_version }
//   SYMPTOM:         { input: textarea, label: "Symptom", required: true }
//
// `auto` ist ein Pfad in der Resolver-Notation:
//   - 'today'                                       → heutiges Datum YYYY-MM-DD
//   - 'project.name'                                → Project-Display-Name
//   - 'project.next_season_number'                  → naechste Season-Nummer
//   - 'claude_md.workbench.<key>'                   → Frontmatter-Feld
//   - 'claude_md.workbench.trigger_phrases.<key>'   → Trigger-Phrase
//   - 'db.last_completed_feature_session'           → vom Main aufgeloest
//   - 'docs.tech_schulden_top_n'                    → vom Main aufgeloest
//   - 'docs.entscheidungen_top_n'                   → vom Main aufgeloest
// Resolvbare Pfade ohne Wert (Frontmatter-Feld fehlt, DB-Row null) → Token
// bleibt als `{{TOKEN}}` literal im Output stehen (kein leerer String,
// damit der User die fehlende Quelle sieht statt eine stumme Luecke).
export type TemplateVariableSpec =
  | { auto: string }
  | {
      input: 'text' | 'textarea';
      label?: string;
      required?: boolean;
    };

export interface TemplateSchema {
  variables: Record<string, TemplateVariableSpec>;
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
//
// Phase-2 Season-23: `paths` ist die Liste der angefragten Server-Pfade,
// damit Templates die drei DB/Doku-Pfade nur dann triggern, wenn sie sie
// auch wirklich verwenden (Performance: kein Schulden/Entscheidungen-Read
// fuer ein BUG_REPORT-Template, das nur claude_md-Felder nutzt). Bekannte
// Server-Pfade: 'db.last_completed_feature_session',
// 'docs.tech_schulden_top_n', 'docs.entscheidungen_top_n'. Unbekannte Pfade
// werden ignoriert (kein Fehler, einfach nicht in der Result-Map). Leere
// Liste oder weggelassen → null Server-Pfade aufgeloest.
export interface TemplatesResolveAutoVarsInput {
  projectId: string;
  paths?: string[];
}

// Phase-2 Season-23: generischer Pfad→Wert-Map als Ablöse der drei
// hartcodierten Felder. Nur die in `paths` angefragten Pfade tauchen im
// Result auf. Pfade ohne Wert (Datei fehlt, DB-Row null, Setting=0) sind
// nicht im Result enthalten — der Renderer behandelt fehlende Eintraege wie
// fehlgeschlagene Auto-Vars (Token bleibt literal stehen).
export type TemplatesResolveAutoVarsResult = Record<string, string>;

// Phase-2 Season-11: Templates-Send mit {{NEXT_SEASON_NR}} alloziert eine Nummer
// fuer die aktive Session. Antwort enthaelt die finale Nummer (frisch zugeteilt
// oder bereits vergeben, falls die Session schon eine hatte).
export interface TemplatesAllocateSeasonForSessionInput {
  sessionId: string;
}

export interface TemplatesAllocateSeasonForSessionResult {
  seasonNumber: number;
  // True, wenn diese Methode den Wert frisch gesetzt hat; false, wenn die
  // Session bereits eine Season-Nummer hatte (idempotenter Pfad).
  freshlyAssigned: boolean;
}

// Phase-2 Season-21 — Docs-Sync. Status-IPC fuer das NewSessionModal mit
// Typ „Docs-Sync". Re-Export der pure-Helper-Typen aus shared/docs-sync.ts,
// damit Preload-Bridge + Renderer denselben Vertrag sehen wie das Modul,
// das die Logik haelt.
import type {
  DocsSyncFileDescriptor as _DocsSyncFileDescriptor,
  DocsSyncFileState as _DocsSyncFileState,
  DocsSyncFileStatus as _DocsSyncFileStatus,
  DocsSyncStatusResult as _DocsSyncStatusResult,
} from './docs-sync';

export type DocsSyncFileDescriptor = _DocsSyncFileDescriptor;
export type DocsSyncFileState = _DocsSyncFileState;
export type DocsSyncFileStatus = _DocsSyncFileStatus;
export type DocsSyncStatusResult = _DocsSyncStatusResult;

export interface DocsSyncStatusInput {
  projectId: string;
}

// Phase-2 Season-22 — On-Demand-Kontext-Praeambel. Pro Datei dasselbe
// Status-Shape wie bei Docs-Sync, plus optional der Summary-Body ohne
// Frontmatter. Body ist nur gesetzt, wenn die Summary geladen werden
// konnte (state in {fresh, stale}); bei missing-summary/missing-source
// ist er null. Renderer entscheidet anhand des Status, ob er die Datei
// pre-checked anbietet und den Body in die Praeambel uebernimmt.
export interface DocsOnDemandStatusInput {
  projectId: string;
}

export interface DocsOnDemandFileStatus extends DocsSyncFileStatus {
  summaryBody: string | null;
}

export interface DocsOnDemandStatusResult {
  files: DocsOnDemandFileStatus[];
  generatedAt: number;
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
  // Phase-2 Season-10: per-Message-Modell aus message.model in der JSONL-Zeile
  // (parser.ts liefert das Feld). NULL fuer externe Sessions ohne Modell-Info
  // bzw. fuer Pre-Migration-Backfill, der die Session nicht aufloesen kann.
  // Optional, damit aeltere Caller (z.B. State-Detection-Tests, die nur den
  // Last-Event-Pfad brauchen) das Feld weglassen koennen — die Driver mappen
  // undefined auf null.
  model?: string | null;
  // Phase-2 Season Flacsh: getrennte Cache-Token-Anteile aus
  // message.usage.cache_creation_input_tokens / cache_read_input_tokens.
  // `tokens_in` bleibt die Summe aus input + cache_creation + cache_read
  // (Backward-Compat); diese Felder erlauben die Cache-Hit-Rate-Aggregation.
  // Optional, damit aeltere Caller das Feld weglassen koennen — Driver
  // mappen undefined auf 0.
  tokens_cache_creation?: number;
  tokens_cache_read?: number;
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
  // Phase 2 Season Flacsh: Reset-Zeitstempel des aktiven Windows fuer die
  // Footer-Anzeige unter der Bar. Beide null fuer rolling-Bars ohne
  // reset_schedule (keine fixe Reset-Zeit).
  //   - session_block: windowStartAt = erster Token im aktiven Block,
  //                    windowEndAt = windowStartAt + window_hours*3600000.
  //   - reset_schedule: windowStartAt = letzter Reset-Zeitpunkt,
  //                     windowEndAt = naechster Reset-Zeitpunkt.
  windowStartAt: number | null;
  windowEndAt: number | null;
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

// --- Stats (Phase-2 Season-12) ---------------------------------------

// Range-Filter der Stats-Cards. Eigene Roadmap-Feature-Zeile "30d/7d-Filter"
// wird mit dieser Season parallel erledigt.
export type StatsRange = 'all' | '30d' | '7d';

export interface StatsOverviewInput {
  // null oder weggelassen = global ueber alle Projekte.
  projectId?: string | null;
  range: StatsRange;
  asOf?: number;
}

// Ergebnis-Shape der acht Cards. Felder mit `_at`-Suffix sind epoch-ms;
// `null`-Werte signalisieren "keine Daten" (Renderer zeigt Em-Dash).
export interface StatsOverviewResult {
  // Erste Reihe — Volumen
  sessions_total: number;
  messages_total: number;
  tokens_total: number;
  active_days: number;
  // Zweite Reihe — Verhalten
  current_streak_days: number;
  longest_streak_days: number;
  // 0–23 (lokale Zeitzone des Main-Prozesses). null = keine Messages.
  peak_hour: number | null;
  peak_hour_count: number;
  // Modell-ID wie in messages.model gespeichert. null = keine Messages
  // mit Modell-Info.
  favorite_model: string | null;
  favorite_model_count: number;
  // Reflektion des Inputs (fuer Debug-Anzeige + Cache-Validierung im Renderer).
  scope: 'project' | 'global';
  range: StatsRange;
  generated_at: number;
}

// Phase-2 Season-13 — Aktivitaets-Heatmap.

export type StatsHeatmapWeeks = 30 | 52;

export interface StatsHeatmapInput {
  projectId?: string | null;
  weeks: StatsHeatmapWeeks;
  asOf?: number;
}

// Eine Zelle im Grid. Level 0 = keine Aktivitaet, 1..4 = Quartil-Stufen ueber
// die nicht-leeren Tage des Fensters. `date` ist YYYY-MM-DD in lokaler Zeit.
export interface StatsHeatmapDay {
  date: string;
  tokens: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface StatsHeatmapResult {
  // ASC-sortiert nach `date`. Enthaelt jeden Kalendertag vom Fenster-Start
  // (Montag N-1 Wochen vor dem Montag der aktuellen Woche) bis heute (lokal)
  // inklusive. Tage ohne Messages haben tokens=0 und level=0. Die Laenge
  // bleibt deterministisch <= weeks * 7.
  days: StatsHeatmapDay[];
  weeks: StatsHeatmapWeeks;
  scope: 'project' | 'global';
  // Quartil-Schwellen ueber die nicht-leeren Tage im Fenster. Renderer
  // zeigt sie optional im Tooltip als Legende. Wenn das Fenster komplett
  // leer ist, sind alle drei Werte 0.
  thresholds: { p25: number; p50: number; p75: number };
  generated_at: number;
}

// Phase-2 Season-14 — Modelle-View. Per-Modell-Aufschluesselung mit Bar-Chart
// (Token-Anteil) und Tabelle (Modell · Sessions · Tokens · Durchschnitt pro
// Session). Range + Scope kommen vom geteilten Stats-Header-Toggle (Season 12).

export interface StatsModelsInput {
  // null oder weggelassen = global ueber alle Projekte.
  projectId?: string | null;
  range: StatsRange;
  asOf?: number;
}

// Eine Zeile pro Modell. `model` ist die Modell-ID, wie in `messages.model`
// gespeichert (claude-opus-4-7, claude-sonnet-4-6, ...). NULL-Modelle (Pre-
// Migration-Backfill-Tail) bleiben raus — der Renderer braucht keine
// "unbekannt"-Reihe. `sessions` zaehlt DISTINCT session_id der Messages mit
// diesem Modell, nicht `sessions.current_model` — damit erscheint ein
// Modell in der Liste, sobald in der Session mindestens eine Message damit
// lief. Das passt zum Detail-Pane-Aggregat aus Season 10.
export interface StatsModelBreakdownRow {
  model: string;
  messages: number;
  sessions: number;
  tokens: number;
  // Anteil an der Gesamt-Token-Summe der zurueckgegebenen Modelle. 0..1.
  // Wird vorberechnet, damit der Renderer keine Summe nochmal aufaddieren
  // muss (und beide Seiten denselben Wert sehen).
  tokens_share: number;
  // tokens / sessions, gerundet auf eine Ganzzahl. `null`, wenn `sessions=0`
  // (sollte bei Aggregat aus Messages nicht vorkommen, defensiv trotzdem).
  tokens_per_session: number | null;
  // Phase-2 Season Flacsh: getrennte Cache-Token-Summen aus der neuen
  // Spalte messages.tokens_cache_read / messages.tokens_cache_creation
  // (Migration 0008). `cache_hit_rate` ist `cache_read / tokens_in` als
  // 0..1-Wert; `null`, wenn das Modell keine tokens_in hat (kein Aggregat
  // moeglich). Pre-Migration-Daten haben die Spalten auf 0 → Hit-Rate
  // landet auf 0, bis der Watcher die Sessions neu eingelesen hat.
  tokens_cache_read: number;
  tokens_cache_creation: number;
  cache_hit_rate: number | null;
}

export interface StatsModelsResult {
  // Absteigend sortiert nach `tokens`, Tie-Break alphabetisch nach `model`.
  rows: StatsModelBreakdownRow[];
  // Summe ueber alle Rows. Renderer kann daraus Empty-State (0) ableiten,
  // ohne ueber `rows` zu iterieren.
  tokens_total: number;
  // Phase-2 Season Flacsh: Gesamt-Cache-Hit-Rate ueber alle Modelle =
  // SUM(tokens_cache_read) / SUM(tokens_in). 0..1, `null` wenn
  // SUM(tokens_in)==0. Renderer zeigt das als prominente Kennzahl oben
  // im Modelle-View-Block.
  cache_hit_rate_total: number | null;
  scope: 'project' | 'global';
  range: StatsRange;
  generated_at: number;
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
    // Phase-2 Season-18: generischer Ordner-Picker. Der First-Start-Wizard
    // ruft ihn als ersten Schritt; `canceled=true` heisst der User hat den
    // Dialog geschlossen, ohne einen Pfad zu waehlen — der Wizard bleibt
    // dann offen.
    pickFolder: (input?: AppPickFolderInput) => Promise<IpcResult<AppPickFolderResult>>;
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
    // Phase-2 Season-11: vom Templates-Send aufgerufen, wenn das Template
    // {{NEXT_SEASON_NR}} verwendet. Idempotent — gibt die bereits zugewiesene
    // Nummer zurueck, falls die Session schon eine hatte.
    allocateSeasonForSession: (
      input: TemplatesAllocateSeasonForSessionInput,
    ) => Promise<IpcResult<TemplatesAllocateSeasonForSessionResult>>;
  };
  // Phase-2 Season-21: Docs-Sync-Session — Status der vier Doku-Files
  // (CHANGELOG/FEATURES/TECH_SCHULDEN/ENTSCHEIDUNGEN) fuers Modal.
  docs: {
    syncStatus: (input: DocsSyncStatusInput) => Promise<IpcResult<DocsSyncStatusResult>>;
    // Phase-2 Season-22: Status + Body der On-Demand-Files aus CLAUDE.md.
    onDemandStatus: (
      input: DocsOnDemandStatusInput,
    ) => Promise<IpcResult<DocsOnDemandStatusResult>>;
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
    // Phase-2 Season-17: liefert die aktuelle Anzeige fuer den Settings-
    // Manual-Clear-Block ohne FS-Mutation.
    screenshotsSummary: () => Promise<IpcResult<FsScreenshotsSummaryResult>>;
    // Phase-2 Season-17: loescht alle Files im <userData>/screenshots/.
    // Im UI hinter einem Doppel-Confirm; der IPC selbst hat keinen Confirm-
    // Schritt, der Caller traegt die Verantwortung.
    clearScreenshots: () => Promise<IpcResult<FsClearScreenshotsResult>>;
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
    // Phase-2 Season-8: Projekt aus der Liste entfernen. Returnt die finale,
    // sortierte Liste (analog scanWorkspace) — der Store ersetzt seinen Stand
    // ohne separaten list-Call. Sessions hängen nach dem Call am Legacy-Bucket.
    remove: (input: ProjectRemoveInput) => Promise<IpcResult<ProjectRow[]>>;
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
  // Phase-2 Season-12: Stats-Cards aus messages + sessions aggregiert.
  // Phase-2 Season-13: Aktivitaets-Heatmap als zweiter Channel parallel.
  // Phase-2 Season-14: Per-Modell-Aufschluesselung als dritter Channel.
  stats: {
    overview: (input: StatsOverviewInput) => Promise<IpcResult<StatsOverviewResult>>;
    heatmap: (input: StatsHeatmapInput) => Promise<IpcResult<StatsHeatmapResult>>;
    models: (input: StatsModelsInput) => Promise<IpcResult<StatsModelsResult>>;
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
