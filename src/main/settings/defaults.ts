import type { AppSettings } from '@shared/types';
import os from 'node:os';
import path from 'node:path';

// Standardwerte laut Architektur Kapitel 4.
// `workspace_path` bleibt anpassbar pro Maschine — Default zeigt auf <home>/Projekte.
export function buildDefaultSettings(): AppSettings {
  return {
    workspace_path: path.join(os.homedir(), 'Projekte'),
    default_model: 'claude-sonnet-4-6',

    model_limits: {
      'claude-opus-4-7': 1_000_000,
      'claude-opus-4-6': 1_000_000,
      'claude-sonnet-4-6': 1_000_000,
      'claude-sonnet-4-5': 200_000,
      'claude-haiku-4-5': 200_000,
    },
    default_limit: 200_000,

    limit_bars: [
      { id: '5h', label: '5-Stunden-Limit', window_hours: 5, filter: 'all', limit_method: 'p90' },
      { id: 'weekly_all', label: 'Wöchentlich · alle Modelle', window_hours: 168, filter: 'all', limit_method: 'p90' },
      { id: 'weekly_design', label: 'Wöchentlich · Claude Design', window_hours: 168, filter: 'top_tier', limit_method: 'p90' },
      { id: 'weekly_sonnet', label: 'Nur Sonnet', window_hours: 168, filter: 'sonnet', limit_method: 'p90' },
    ],

    p90_window_hours: 192,

    token_warning_thresholds: {
      yellow: 70,
      orange: 85,
      red: 95,
    },

    terminal_font_family: 'JetBrains Mono, Cascadia Code, MesloLGS NF',
    terminal_font_size: 13,

    theme: 'dark',
    accent_color: '#4ade80',

    shortcuts: {
      new_session: 'Ctrl+N',
      templates: 'Ctrl+T',
      settings: 'Ctrl+K',
      tab_next: 'Ctrl+Tab',
      tab_prev: 'Ctrl+Shift+Tab',
    },
  };
}
