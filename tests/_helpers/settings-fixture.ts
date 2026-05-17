import type { AppSettings } from '@shared/types';

// Test-Fixture fuer AppSettings. Frueher in tests/main/reset-schedule.test.ts und
// tests/main/usage-aggregation.test.ts inline dupliziert — bei jedem Schema-Add
// musste das neue Feld in beiden Files manuell nachgezogen werden (Touch-Points
// haben sich Season 17/18/19 gehaeuft). Helper extrahiert (Pre-Season-Mini-Pass
// von Season 20), neue Felder landen jetzt nur noch hier.
//
// Bewusst NICHT auf buildDefaultSettings() aufgesetzt: Default greift fs.existsSync
// fuer den workspace_path (siehe defaults.ts:pickDefaultWorkspacePath), das wuerde
// die Tests an die Maschine binden. Diese Fixture haelt feste, deterministische
// Werte.
export function buildTestSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    workspace_path: '/tmp/projects',
    workspace_wizard_completed: true,
    default_model: 'claude-sonnet-4-6',
    claude_binary_path: 'claude',
    model_limits: {
      'claude-sonnet-4-6': 1_000_000,
      'claude-opus-4-7': 1_000_000,
      'claude-haiku-4-5': 200_000,
    },
    default_limit: 200_000,
    limit_bars: [],
    p90_window_hours: 192,
    token_warning_thresholds: { yellow: 70, orange: 85, red: 95 },
    context_soft_warning: { enabled: true, threshold_percent: 20 },
    terminal_font_family: 'JetBrains Mono',
    terminal_font_size: 13,
    theme: 'dark',
    accent_color: '#4ade80',
    shortcuts: {},
    sensitive_file_patterns: [],
    screenshot_retention: { max_age_days: 30, max_total_mib: 500 },
    easter_egg_enabled: true,
    template_top_n: { schulden: 3, entscheidungen: 3 },
    markdown_editor_layout: 'split',
    ...overrides,
  };
}
