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
