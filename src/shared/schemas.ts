import { z } from 'zod';

// zod-Schemas für Runtime-Validation an IPC-Boundaries.
// Verwendung im Main-Handler: `const input = SchemaName.parse(payload)`.
// Schemas matchen die TypeScript-Typen in types.ts; bei Drift greifen sie als Wahrheit.

// --- Settings ---------------------------------------------------------

export const LimitBarSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  window_hours: z.number().positive(),
  filter: z.enum(['all', 'top_tier', 'sonnet', 'haiku', 'custom']),
  limit_method: z.enum(['p90', 'fixed']),
  model_pattern: z.string().optional(),
  fixed_limit: z.number().positive().optional(),
  // Sprint 9 — Reset-Zeitpunkt pro Bar (UI-Slot, Phase-2-Backend).
  // day_of_week: 0=Sonntag, 1=Montag, ..., 6=Samstag.
  reset_schedule: z
    .object({
      day_of_week: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
    })
    .optional(),
  // Phase 2 Season Flacsh — Aggregations-Modus pro Bar.
  //   'rolling' (Default): immer die letzten `window_hours` Stunden ab jetzt.
  //   'session_block': Window startet beim ersten Token nach dem letzten
  //     Window-Ende und laeuft genau `window_hours` Stunden als fixer Block.
  //     Anthropic-Realitaet fuer das 5h-Limit. Default-by-Convention im
  //     Resolver: `window_hours <= 6` → session_block, sonst rolling, wenn das
  //     Feld weggelassen wird.
  aggregation_mode: z.enum(['rolling', 'session_block']).optional(),
});

// Phase-2 Season-34: User-definierte Modelle ueber die Settings-UI.
// Built-in-IDs wandern in src/shared/models.ts; CustomModel ergaenzt die Liste
// pro Benutzer um neue Anthropic-Releases ohne Code-Push. Kontext-Limits laufen
// ausschliesslich ueber settings.model_limits (Per-Modell-Limit-Tabelle).
export const CustomModelSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
});

export const AppSettingsSchema = z.object({
  // Phase-2 Season-25: Schema-Versionsfeld fuer die Settings-Migrations-Pipeline.
  // `SettingsStore.read()` ruft `runSettingsMigrations()` zwischen JSON-Parse
  // und zod-Validierung; Bestandsuser ohne das Feld werden implizit als
  // Version 1 gelesen, die Pipeline schreibt das migrierte Objekt mit
  // erhoehter Version zurueck auf die Disk.
  schema_version: z.number().int().positive(),
  workspace_path: z.string(),
  // Phase-2 Season-18: First-Start-Workspace-Wizard. Default-Merge in
  // `SettingsStore.read()` greift `buildDefaultSettings().workspace_wizard_completed=true`,
  // sodass Bestandsuser ohne das Feld als „Wizard erledigt" gelten und der
  // Welcome-Screen nicht aufpoppt. Frische Anlagen (`SettingsStore.initialize()`)
  // ueberschreiben das in der Datei explizit mit `false`.
  workspace_wizard_completed: z.boolean(),
  default_model: z.string(),
  claude_binary_path: z.string().min(1),
  // Phase-2 Season-34: User-erweiterbare Modell-Liste. Built-ins bleiben in
  // src/shared/models.ts hardcoded, damit das App-Update neue Anthropic-Modelle
  // mitliefert; dieses Feld ist die User-Erweiterung fuer ad-hoc neue IDs.
  custom_models: z.array(CustomModelSchema),
  model_limits: z.record(z.string(), z.number().positive()),
  default_limit: z.number().positive(),
  limit_bars: z.array(LimitBarSchema),
  p90_window_hours: z.number().positive(),
  token_warning_thresholds: z.object({
    yellow: z.number().min(0).max(100),
    orange: z.number().min(0).max(100),
    red: z.number().min(0).max(100),
  }),
  // Phase-2 Season-8 (Soft-Warning): persoenliche Erfahrungsgrenze fuer die
  // Per-Session-Kontext-Bar. Bei `enabled=true` zeigt die Action-Bar einen
  // Marker an `threshold_percent` und toent die Bar oberhalb dezent ein.
  context_soft_warning: z.object({
    enabled: z.boolean(),
    threshold_percent: z.number().min(0).max(100),
  }),
  // Phase-2 Season-17: Boot-One-Shot-Retention fuer <userData>/screenshots/.
  // `max_age_days = 0` schaltet die Age-Regel ab, `max_total_mib = 0` das Cap.
  // Beide auf 0 deaktiviert die Auto-Retention komplett — der Manual-Clear-
  // Button im Settings-Modal funktioniert davon unabhaengig.
  screenshot_retention: z.object({
    max_age_days: z.number().min(0).max(3650),
    max_total_mib: z.number().min(0).max(1_000_000),
  }),
  // Phase-2 Season-19: Easter-Egg-Token-Vergleiche („du hast ~31× LotR
  // geschrieben") in der Stats-Pane-Uebersicht. `false` blendet den
  // Streifen unter der Heatmap aus. Werk-Liste ist aktuell hartcodiert
  // in src/shared/easter-egg-works.ts; eine konfigurierbare Liste
  // kommt erst, wenn der erste User-Wunsch nach eigenem Werk auftaucht.
  easter_egg_enabled: z.boolean(),
  // Phase-2 Season-20: Top-N fuer die zwei Doku-Auto-Variablen
  // {{TECH_SCHULDEN_RELEVANT}} und {{LETZTE_ENTSCHEIDUNGEN}} im Templates-
  // Resolve-IPC. Frueher hartcodiert auf 3 in src/main/ipc/templates.ts.
  // 0 unterdrueckt die Variable komplett (leerer String); 20 ist die obere
  // Grenze, weil mehr Eintraege den Prompt unnoetig blaehen.
  template_top_n: z.object({
    schulden: z.number().int().min(0).max(20),
    entscheidungen: z.number().int().min(0).max(20),
  }),
  // Phase-2 Season-24: Default-Layout fuer den Markdown-Editor.
  // 'split' rendert Editor und Preview parallel mit synchronem Scrolling
  // (Daily-Driver), 'editor' nur den CodeMirror-Buffer, 'preview' nur die
  // gerenderte Ansicht. Per-Datei kann der Modus weiterhin in der Toolbar
  // umgeschaltet werden — diese Einstellung legt nur den Startwert fest.
  markdown_editor_layout: z.enum(['split', 'editor', 'preview']),
  terminal_font_family: z.string(),
  terminal_font_size: z.number().positive(),
  theme: z.enum(['dark', 'light']),
  accent_color: z.string(),
  shortcuts: z.record(z.string(), z.string()),
  // Sprint-8 (Variante A): additive User-Patterns. Strings müssen
  // gültige RegEx-Quellen sein; das Renderer-Util prüft per try/catch
  // beim Compile (RegExp-Konstruktor-Fehler werden gemeldet, aber das
  // Pattern still gedroppt — die Defaults greifen weiterhin).
  sensitive_file_patterns: z.array(z.string()),
});

// Patch-Schema: alle Felder optional, damit settings:set teilweise updaten kann.
// .strict() würde unbekannte Keys ablehnen — verwenden wir bewusst nicht, damit das
// Frontend Settings-Felder schicken kann, bevor sie hier explizit modelliert sind.
export const AppSettingsPatchSchema = AppSettingsSchema.partial();

// Phase-2 Season-18: Ordner-Picker fuer den First-Start-Workspace-Wizard.
// Input ist optional — der Handler nimmt einen sinnvollen Default-Titel,
// wenn nichts kommt. Das Schema laesst auch `undefined`-Payload zu, damit
// die Preload-Bridge ohne Args aufgerufen werden kann.
export const AppPickFolderInputSchema = z
  .object({
    title: z.string().min(1).optional(),
  })
  .optional();

// --- Session / PTY ----------------------------------------------------

// Phase-2 Season-5: 'custom' fuer User-definierte Session-Arten; die freie
// Bezeichnung liegt im PtyCreate-Payload separat unter customTypeLabel.
// Phase-2 Season-31: 'terminal' spawnt eine PowerShell statt der claude-Binary —
// kein --session-id, kein --model, kein JSONL. Title bleibt Pflicht; alle
// claude-spezifischen Skip-Pfade werden im pty:create-Handler ueber Inline-
// Gates gezogen (siehe src/main/ipc/pty.ts).
export const SessionTypeSchema = z.enum([
  'feature',
  'bug',
  'review',
  'docs-sync',
  'custom',
  'terminal',
]);

export const SessionStatusSchema = z.enum([
  'running',
  'waiting',
  'idle',
  // Phase-2 Season-1: TUI-Detection meldet Permission-Prompts, damit Sidebar +
  // History-Pane sie sichtbar machen können (Sprint-9-Backlog-Punkt).
  'permission-prompt',
  'completed',
  'archived',
  'interrupted',
  'error',
]);

export const PtyCreateInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    // Sprint-5-Fix: Renderer schickt jetzt das aktive Projekt mit, statt im Main
    // hart auf DEFAULT_PROJECT_ID zu fallen (Sprint-2-Lifeline). Damit hängen
    // Sessions am echten Projekt, was Per-Projekt-Aggregate korrekt macht.
    projectId: z.string().min(1),
    title: z.string().min(1),
    type: SessionTypeSchema,
    model: z.string().min(1),
    // Bereich-4-Review (2026-05-11): cwd wurde aus dem Schema entfernt und im Main
    // serverseitig aus projects.getById(projectId).path hergeleitet — damit kein
    // Renderer-freier Pfad mehr in einen `claude`-Spawn fließt (B-5).
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    // Phase-2 Season-5: freie Bezeichnung fuer type='custom'. Pflicht (min. 1
    // Zeichen) bei 'custom', bei allen anderen Typen ignoriert/null.
    customTypeLabel: z.string().min(1).max(60).nullish(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'custom' && (val.customTypeLabel === null || val.customTypeLabel === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customTypeLabel ist Pflicht bei type=custom',
        path: ['customTypeLabel'],
      });
    }
  });

// Bereich-4-Review (B-6): pty:write-Cap auf 1 MiB. Renderer ist Trust-Boundary;
// eine fehlerhafte Schleife könnte sonst unbounded Buffer an den Main schieben.
// 1 MiB ist mehrere Größenordnungen über realem Tastatur-Input, bleibt aber
// klein genug, um Speicher-Druck auf den Main-Prozess zu verhindern.
export const PtyWriteInputSchema = z.object({
  sessionId: z.string().uuid(),
  data: z.string().max(1024 * 1024),
});

export const PtyResizeInputSchema = z.object({
  sessionId: z.string().uuid(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const PtyKillInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// Phase-2 Season-1: pty:tui-state. Renderer schickt den vom Pattern-Match
// detektierten TUI-Status. Whitelist auf die vier bekannten Werte; alles andere
// (z.B. terminal-status wie completed/archived) wird verworfen — der Lifecycle
// soll diese Pfade nur über die etablierten IPC-Handler bedienen.
export const PtyTuiStateInputSchema = z.object({
  sessionId: z.string().uuid(),
  state: z.enum(['running', 'waiting', 'idle', 'permission-prompt']),
});

// Phase-2 Season-33: terminal:save-buffer / terminal:load-buffer fuer die
// Buffer-Persistierung von terminal-Sessions. Snapshot-Cap auf 1 MiB als
// defensive Trust-Boundary — der Pure-Helper im Renderer trimt auf 256 KiB,
// aber das Schema schluckt etwas Puffer fuer kuenftige Anpassungen ohne
// Schema-Bruch. Bei type !== 'terminal' lehnt der Handler den Save ab.
export const TerminalSaveBufferInputSchema = z.object({
  sessionId: z.string().uuid(),
  snapshot: z.string().max(1024 * 1024),
});

export const TerminalLoadBufferInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// SessionUpdate-Patch: nur Felder, die in Sprint 2 vom Renderer geschrieben werden dürfen.
// Bereich-4-Review (B-1): ended_at ist NICHT mehr patchbar — die SessionLifecycle
// setzt/nullt das Feld als Status-Side-Effect. Ein Renderer-Patch würde diese
// Invariante überschreiben können (auch wenn aktuell kein Renderer-Call das tut).
export const SessionUpdatePatchSchema = z
  .object({
    title: z.string().min(1),
    notes_md: z.string(),
    status: SessionStatusSchema,
    current_model: z.string().nullable(),
  })
  .partial();

export const SessionUpdateInputSchema = z.object({
  sessionId: z.string().uuid(),
  patch: SessionUpdatePatchSchema,
});

// Sprint 3: Tab-Schließen via × → Status archived (+ PTY-Kill, falls running).
export const SessionCloseInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// Sprint 3: Resume-Button auf interrupted/completed/error → claude --resume <id>.
// cols/rows kommen aus dem Renderer (xterm-Dimensionen zum Zeitpunkt des Klicks).
export const SessionResumeInputSchema = z.object({
  sessionId: z.string().uuid(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

// Verlauf-Panel-Filter: Typ, Status, Volltext-Suche (Sprint 6) und Modell
// (Phase-2 Season-10). Leere Listen → kein Filter; query "" → kein Volltext-
// Filter. models akzeptiert beliebige Strings, weil die `current_model`-Werte
// der Sessions nicht auf das UI-Whitelist beschraenkt sind (Renderer schickt
// die fuenf bekannten Modell-IDs, aber alte Sessions mit umbenannten Modellen
// muessen genauso filterbar bleiben).
export const SessionHistoryInputSchema = z.object({
  projectId: z.string().min(1),
  types: z.array(SessionTypeSchema).optional(),
  statuses: z.array(SessionStatusSchema).optional(),
  query: z.string().optional(),
  models: z.array(z.string().min(1)).optional(),
});

// Sprint-6-UX-Fix: explizites Archivieren via Verlauf-Panel-Detail-Pane.
// Lifecycle-Transition zu archived; kein PTY-Kill (Session ist beim Archive
// ohnehin nicht mehr running — sonst würde der archived-Übergang die Live-PTY
// hinterlassen, was die State-Machine in Sprint 3 gerade verhindern soll).
export const SessionArchiveInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// Sprint 6: fs:list-templates läuft on-demand beim Modal-Open. projectId wird
// gegen die DB aufgelöst, um den Per-Projekt-Pfad zu finden.
export const FsListTemplatesInputSchema = z.object({
  projectId: z.string().min(1),
});

// Phase-2 Season-4 / Season-23: templates:resolve-auto-vars — Renderer schickt
// die projectId plus die Liste der angefragten Server-Pfade. Der Main loest
// nur die explizit angefragten auf (kein unnoetiger Datei-Read bei Templates,
// die z.B. nur claude_md-Felder konsumieren). Bekannte Pfade siehe
// TemplatesResolveAutoVarsInput in shared/types.ts.
export const TemplatesResolveAutoVarsInputSchema = z.object({
  projectId: z.string().min(1),
  paths: z.array(z.string().min(1)).optional(),
});

// Phase-2 Season-23: Template-Frontmatter-Schema. Diskriminiert ueber die
// Schluessel-Praesenz (`auto` vs. `input`). Strict im Sinne von „kein
// vermischtes Feld" — wenn der User beides setzt, lehnt zod ab und der
// Reader laesst das Template ohne Schema laufen (Fallback). Labels duerfen
// leer/weggelassen sein (Fallback: der Token-Name in Caps); required
// default=false.
const TemplateAutoVariableSchema = z
  .object({
    auto: z.string().min(1),
  })
  .strict();

const TemplateInputVariableSchema = z
  .object({
    input: z.enum(['text', 'textarea']),
    label: z.string().min(1).optional(),
    required: z.boolean().optional(),
  })
  .strict();

export const TemplateVariableSpecSchema = z.union([
  TemplateAutoVariableSchema,
  TemplateInputVariableSchema,
]);

export const TemplateSchemaSchema = z.object({
  variables: z.record(z.string().min(1), TemplateVariableSpecSchema),
});

// Phase-2 Season-11: Eingabe-Schema fuer templates:allocate-season-for-session.
// Renderer schickt die aktive Session-ID; der Main resolved dazu das Projekt
// und alloziert eine Season-Nummer (idempotent, siehe Channel-Doku).
export const TemplatesAllocateSeasonForSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// Phase-2 Season-21: docs:sync-status. Renderer schickt die projectId; der
// Main resolved gegen ProjectRepository.getById und liest die vier
// Doku-Originale + ihre erwarteten Summary-Files. SHA-256 der Originale wird
// gegen `source_hash` im Frontmatter der Summary verglichen.
export const DocsSyncStatusInputSchema = z.object({
  projectId: z.string().min(1),
});

// Phase-2 Season-22: docs:on-demand-status. Selbe projectId-Form wie
// DocsSyncStatusInput, aber der Handler nimmt die On-Demand-Files-Liste
// dynamisch aus dem CLAUDE.md-Frontmatter statt aus der DOCS_SYNC_FILES-
// Whitelist. Liefert pro Datei den gleichen Status plus den Summary-Body
// (Frontmatter gestrippt) fuer Files, deren Summary geladen wurde —
// damit der Renderer bei Submit den Praeambel-Text bauen kann, ohne
// einen zweiten IPC fuer die Body-Reads zu machen.
export const DocsOnDemandStatusInputSchema = z.object({
  projectId: z.string().min(1),
});

// --- Filesystem read/write (Sprint 7) ---------------------------------

// fs:read / fs:write laufen ausschließlich relativ zu einem registrierten Projekt.
// Der Renderer kann keinen freien Pfad reinschicken — wir resolven serverseitig
// gegen Project-Pfad + relPath und prüfen, dass das Ergebnis innerhalb des
// Project-Roots bleibt (Anti-Traversal). relPath ist Forward-Slash-getrennt
// (Renderer-Konvention; Main normalisiert).
export const FsReadInputSchema = z.object({
  projectId: z.string().min(1),
  relPath: z.string().min(1),
});

export const FsWriteInputSchema = z.object({
  projectId: z.string().min(1),
  relPath: z.string().min(1),
  // Voller Datei-Inhalt; UTF-8 ohne BOM. Save-Trigger ist manuell (Q1 Variante A:
  // Ctrl+S), kein Streaming.
  // Bereich-4-Review (B-6): Cap auf 10 MiB. Markdown-Notizen liegen real bei
  // wenigen 100 KiB; 10 MiB lässt großzügig Luft, schließt aber den unbounded
  // Buffer-Pfad vom Renderer.
  content: z.string().max(10 * 1024 * 1024),
});

// fs:list-tree (Phase 5): hierarchischer Scan eines Projekts. maxDepth bewusst
// optional — Default kommt aus dem Scanner (5).
export const FsListTreeInputSchema = z.object({
  projectId: z.string().min(1),
  maxDepth: z.number().int().min(0).max(10).optional(),
});

// Phase-2 Season-2: Screenshot-Drop. Renderer schickt die Image-Bytes als
// base64-String (contextBridge clont Buffer/ArrayBuffer nicht stabil über
// die Sandbox-Grenze; base64 ist verlustfrei und langweilig zu validieren).
//
// MIME-Whitelist auf die vier Browser-Standard-Image-Formate, die ein Snipping-
// Tool, ein Snip-aus-Browser oder ein File-Drag liefert. SVG ist NICHT erlaubt
// (XSS-Vektor bei Inline-Render, und claude-code braucht es nicht).
//
// Cap auf 25 MiB als Roh-Bytes ≈ 33 MiB base64 — schließt Bildschirm-Snipshots
// (4K-PNG ≈ 6–10 MiB) bequem ein, kappt aber einen versehentlichen
// Mega-Screenshot oder einen unbounded Buffer-Pfad vom Renderer.
export const FsSaveScreenshotInputSchema = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  // Roh-Bytes als base64. Validierung der Form (gültiges base64) lassen wir
  // Buffer.from machen — eine invalide Eingabe produziert weniger Bytes, der
  // Decode-Loss wird im Handler nicht weiter geprüft (Trust-Boundary ist die
  // MIME-Whitelist + Größen-Cap, nicht die Bytes-Korrektheit).
  base64: z.string().min(1).max(33 * 1024 * 1024),
});

// Phase-2 Season-17: Summary + Clear haben keinen Input ausser dem Channel-
// Kontext — der Screenshots-Ordner liegt in <userData>/screenshots/ und ist
// nicht vom Renderer beeinflussbar. Wir validieren trotzdem ein leeres Objekt
// fuer Konsistenz mit den anderen IPCs (zod-Boundary, kein Trust).
export const FsScreenshotsSummaryInputSchema = z.object({}).strict();
export const FsClearScreenshotsInputSchema = z.object({}).strict();

// Phase-2 Season-29 (Multi-Tab-Diff Auto-Refresh): Renderer setzt das aktive
// Projekt fuer den Datei-Watcher im Main. `projectId=null` stoppt den Watcher
// (Use-Case: alle Projekte deselektiert, Welcome-Screen, App-Shutdown vor
// before-quit).
export const FsSetWatchedProjectInputSchema = z.object({
  projectId: z.string().min(1).nullable(),
});

// --- Git (Sprint 7) --------------------------------------------------

// git:status / git:diff laufen immer gegen ein bekanntes Projekt. Renderer schickt
// nur die projectId; der Main resolved gegen ProjectRepository.getById und ruft
// den GitDriver mit dem absoluten Repo-Pfad. Direkte Pfad-Übergabe wäre eine
// Renderer-→-Filesystem-Lücke (Sandboxing-Bypass).
export const GitStatusInputSchema = z.object({
  projectId: z.string().min(1),
});

export const GitDiffInputSchema = z.object({
  projectId: z.string().min(1),
  filePath: z.string().min(1).optional(),
});

// Phase 6: HEAD-Version einer Datei für die @codemirror/merge.unifiedMergeView.
// ref optional, Default 'HEAD'.
export const GitShowInputSchema = z.object({
  projectId: z.string().min(1),
  relPath: z.string().min(1),
  ref: z.string().min(1).optional(),
});

// Phase-2 Season-29 (Multi-Tab-Diff): Index-Version einer Datei. Server ruft
// `git show :<relPath>` und liefert den gestagten Inhalt zurueck. Ohne ref —
// die Staging-Area hat keinen frei waehlbaren Ref.
export const GitShowStagedInputSchema = z.object({
  projectId: z.string().min(1),
  relPath: z.string().min(1),
});

// Phase-2 Season-29 (Multi-Tab-Diff): Session-Diff. sessionId statt projectId,
// weil der Main das Projekt + den Baseline-SHA aus der Session-Row resolved.
// Damit kann der Renderer keinen freien Baseline-SHA reinschmuggeln.
export const GitSessionDiffInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// --- Workspace / Projects (Sprint 4) ---------------------------------

// CLAUDE.md-YAML-Frontmatter laut Architektur Kapitel 5.
//
// Konvention: trigger_phrases sind strict-Pflicht (in Working-Rules referenziert),
// alle anderen Felder sind optional, damit ein Projekt mit minimalem Frontmatter
// (z.B. nur ein workbench-Block ohne default_model) parsebar bleibt.
//
// on_demand_files akzeptiert sowohl die ausführliche Objekt-Form (path/trigger/auto_inject)
// als auch ein einfaches Pfad-Array — die Validation bleibt locker, weil Sprint 4 die
// Liste noch nicht konsumiert (Markdown-Editor in Sprint 7 nutzt sie zuerst).
export const ClaudeMdOnDemandFileSchema = z.union([
  z.string().min(1),
  z.object({
    path: z.string().min(1),
    trigger: z.string().optional(),
    auto_inject: z.boolean().optional(),
  }),
]);

export const ClaudeMdFrontmatterSchema = z.object({
  workbench: z.object({
    project_name: z.string().min(1).optional(),
    default_model: z.string().optional(),
    current_phase_file: z.string().optional(),
    // Phase-2 Season-23: optionales Versions-Feld, das Templates wie
    // RELEASE_START.md / BUG_REPORT.md als {{CURRENT_VERSION}} ueber den
    // Auto-Pfad `claude_md.workbench.current_version` lesen. Projekte ohne
    // Versions-Pflege lassen das Feld weg — der Token bleibt dann literal
    // im Prompt stehen (kein erzwungener leerer String).
    current_version: z.string().min(1).optional(),
    // Phase-2 Season-3: `trigger_phrases` erlaubt zusätzlich zu den zwei Pflicht-
    // Keys (`docs_update` + `commit`) beliebige weitere `<key>: <phrase>`-Paare.
    // Die Action-Bar rendert pro Eintrag eine Schnellzugriffs-Pille; das Schema-
    // Catchall hält die zod-Validierung an einer Stelle, statt die Pflicht-Keys
    // hartzucodieren und Extra-Keys per `passthrough()` ungeprüft durchzuwinken.
    trigger_phrases: z
      .object({
        docs_update: z.string().min(1),
        commit: z.string().min(1),
      })
      .catchall(z.string().min(1)),
    on_demand_files: z.array(ClaudeMdOnDemandFileSchema).optional(),
  }),
});

// Output des Parsers (kein wrapper um z.any/passthrough — wir wollen, dass die
// Renderer-Seite mit einem flachen Frontmatter arbeitet, das exakt geprüft ist).
export type ClaudeMdFrontmatter = z.infer<typeof ClaudeMdFrontmatterSchema>;

// project:read-claude-md liest die CLAUDE.md eines bekannten Projekts und parst sie.
// projectId ist eine UUID (DB-Primary-Key); kein Renderer schickt freie Pfade rein.
export const ProjectReadCfgInputSchema = z.object({
  projectId: z.string().min(1),
});

// Phase-2 Season-8: project:remove. Identische projectId-Form wie die anderen
// Project-Channels (string.min(1) statt uuid(), weil DEFAULT_PROJECT_ID intern
// auch als UUID kommt aber die anderen Schemas die laxere Variante nutzen —
// Konsistenz schlägt strikte UUID-Validierung). Der Handler lehnt
// DEFAULT_PROJECT_ID separat ab.
export const ProjectRemoveInputSchema = z.object({
  projectId: z.string().min(1),
});

// --- JSONL-Watcher (Sprint 5) ----------------------------------------

// Schema für das, was claude-code in `~/.claude/projects/<encoded-cwd>/<sid>.jsonl`
// schreibt. Wir validieren nur die Felder, die wir konsumieren — alles andere bleibt
// per .passthrough() durch, damit zukünftige Claude-Code-API-Erweiterungen keine
// Parse-Errors auslösen. Token-Felder müssen, sobald `usage` da ist, nicht-negativ
// sein; eine Zeile ohne `message.usage` wird vom Parser still gedroppt.
export const JsonlUsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative().optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const JsonlMessageSchema = z
  .object({
    // claude-code schreibt timestamp als ISO-String; ältere Versionen evtl. epoch-ms.
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    sessionId: z.string().optional(),
    message: z
      .object({
        model: z.string().optional(),
        usage: JsonlUsageSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// --- Token-Tracking IPC (Sprint 5) -----------------------------------

// usage:window — eine einzelne limit_bar (5h, weekly_all, ...) berechnet auf Basis
// der usage_buckets-Tabelle. Renderer schickt die Bar-ID, der Main löst sie gegen
// settings.limit_bars auf und liefert das aggregierte Tokens-Total + p90/fixed-Limit.
export const UsageWindowInputSchema = z.object({
  barId: z.string().min(1),
  // Optional: einen Stichzeitpunkt für die Window-Berechnung (Tests). Default = now.
  asOf: z.number().int().positive().optional(),
});

// usage:context — Per-Session-Kontext-Bar. Sprint 5 liest den letzten message.usage-
// Stand der Session aus der messages-Tabelle und liefert ihn als „aktueller Kontext".
export const UsageContextInputSchema = z.object({
  sessionId: z.string().min(1),
});

// --- Stats (Phase-2 Season-12) ---------------------------------------

// Range-Filter fuer die Stats-Cards. `all` = keine Zeit-Einschraenkung,
// `30d`/`7d` = Sessions/Messages der letzten N Tage (started_at bzw. ts ≥
// now - N*86400000). Persistenz im localStorage; Default `all`.
export const StatsRangeSchema = z.enum(['all', '30d', '7d']);

// Scope: aktives Projekt vs. alle Projekte. `projectId=null` heisst global —
// das Schema modelliert das als optionales Feld, damit der Renderer beim
// Global-Scope einfach kein projectId mitschickt.
export const StatsOverviewInputSchema = z.object({
  projectId: z.string().min(1).nullish(),
  range: StatsRangeSchema,
  // Optional: Stichzeitpunkt fuer die Range-Berechnung (Tests). Default = now.
  asOf: z.number().int().positive().optional(),
});

// Phase-2 Season-13 — Aktivitaets-Heatmap. Genau zwei zulaessige Wochen-
// Fenster, weil ein dynamischer Wert (z.B. 13W oder 80W) das UI-Grid komplex
// macht ohne Mehrwert. 30W ≈ ein halbes Jahr (Default), 52W = ein Jahr
// (Vergleichbarkeit mit GitHub-Original).
export const StatsHeatmapWeeksSchema = z.union([z.literal(30), z.literal(52)]);

export const StatsHeatmapInputSchema = z.object({
  projectId: z.string().min(1).nullish(),
  weeks: StatsHeatmapWeeksSchema,
  asOf: z.number().int().positive().optional(),
});

// Phase-2 Season-14 — Modelle-View. Shape ist deckungsgleich mit dem Overview-
// Input (projectId nullish, Range als Enum, asOf optional fuer Tests). Wir
// halten das Schema bewusst separat, damit kuenftige Modell-spezifische
// Optionen (z.B. Min-Token-Threshold, Pagination) hier andocken koennen,
// ohne den Overview-Channel mitzubelasten.
export const StatsModelsInputSchema = z.object({
  projectId: z.string().min(1).nullish(),
  range: StatsRangeSchema,
  asOf: z.number().int().positive().optional(),
});

// --- App / Window-Controls (Sprint 8) --------------------------------

// Whitelist für app:window-action — sperrt die Renderer-Boundary auf genau drei
// BrowserWindow-Operationen, damit kein beliebiger Methoden-Call durchgereicht
// werden kann.
export const WindowActionSchema = z.enum(['minimize', 'maximize', 'close']);

export type WindowAction = z.infer<typeof WindowActionSchema>;
