import { z } from 'zod';

// zod-Schemas für Runtime-Validation an IPC-Boundaries.
// Verwendung im Main-Handler: `const input = SettingsPatchSchema.parse(payload)`.
// Schemas matchen die TypeScript-Typen in types.ts; bei Drift greifen sie als Wahrheit.

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
