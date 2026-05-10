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
});

export const AppSettingsSchema = z.object({
  workspace_path: z.string(),
  default_model: z.string(),
  claude_binary_path: z.string().min(1),
  model_limits: z.record(z.string(), z.number().positive()),
  default_limit: z.number().positive(),
  limit_bars: z.array(LimitBarSchema),
  p90_window_hours: z.number().positive(),
  token_warning_thresholds: z.object({
    yellow: z.number().min(0).max(100),
    orange: z.number().min(0).max(100),
    red: z.number().min(0).max(100),
  }),
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

export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>;

// --- Session / PTY ----------------------------------------------------

export const SessionTypeSchema = z.enum(['feature', 'bug', 'review', 'docs-sync']);

export const SessionStatusSchema = z.enum([
  'running',
  'waiting',
  'idle',
  'completed',
  'archived',
  'interrupted',
  'error',
]);

export const PtyCreateInputSchema = z.object({
  sessionId: z.string().uuid(),
  // Sprint-5-Fix: Renderer schickt jetzt das aktive Projekt mit, statt im Main
  // hart auf DEFAULT_PROJECT_ID zu fallen (Sprint-2-Lifeline). Damit hängen
  // Sessions am echten Projekt, was Per-Projekt-Aggregate korrekt macht.
  projectId: z.string().min(1),
  title: z.string().min(1),
  type: SessionTypeSchema,
  model: z.string().min(1),
  cwd: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const PtyWriteInputSchema = z.object({
  sessionId: z.string().uuid(),
  data: z.string(),
});

export const PtyResizeInputSchema = z.object({
  sessionId: z.string().uuid(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const PtyKillInputSchema = z.object({
  sessionId: z.string().uuid(),
});

// SessionUpdate-Patch: nur Felder, die in Sprint 2 vom Renderer geschrieben werden dürfen.
export const SessionUpdatePatchSchema = z
  .object({
    title: z.string().min(1),
    notes_md: z.string(),
    status: SessionStatusSchema,
    current_model: z.string().nullable(),
    ended_at: z.number().int().nullable(),
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

// Sprint 6: Verlauf-Panel-Filter laut Architektur 6.6 (Typ, Status, Volltext-Suche).
// Leere Listen → kein Filter; query "" → kein Volltext-Filter.
export const SessionHistoryInputSchema = z.object({
  projectId: z.string().min(1),
  types: z.array(SessionTypeSchema).optional(),
  statuses: z.array(SessionStatusSchema).optional(),
  query: z.string().optional(),
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
  content: z.string(),
});

// fs:list-tree (Phase 5): hierarchischer Scan eines Projekts. maxDepth bewusst
// optional — Default kommt aus dem Scanner (5).
export const FsListTreeInputSchema = z.object({
  projectId: z.string().min(1),
  maxDepth: z.number().int().min(0).max(10).optional(),
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
    trigger_phrases: z.object({
      docs_update: z.string().min(1),
      commit: z.string().min(1),
    }),
    on_demand_files: z.array(ClaudeMdOnDemandFileSchema).optional(),
  }),
});

// Output des Parsers (kein wrapper um z.any/passthrough — wir wollen, dass die
// Renderer-Seite mit einem flachen Frontmatter arbeitet, das exakt geprüft ist).
export type ClaudeMdFrontmatter = z.infer<typeof ClaudeMdFrontmatterSchema>;

// project:add nimmt einen Pfad und prüft im Main, dass eine CLAUDE.md drinliegt.
// Path ist absolute (dialog.showOpenDialog liefert ohnehin nur absolute Pfade).
export const ProjectAddInputSchema = z.object({
  path: z.string().min(1),
});

// project:read-claude-md liest die CLAUDE.md eines bekannten Projekts und parst sie.
// projectId ist eine UUID (DB-Primary-Key); kein Renderer schickt freie Pfade rein.
export const ProjectReadCfgInputSchema = z.object({
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

// usage:heatmap — Phase-2-Stub. Sprint 5 returnt nur `{ ok: true, data: { stub: true } }`,
// damit der IPC-Channel reserviert ist und Phase 2 ihn nahtlos befüllen kann.
export const UsageHeatmapInputSchema = z.object({}).passthrough();
