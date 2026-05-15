import type { AppSettings } from '@shared/types';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Standardwerte laut Architektur Kapitel 4.
// `workspace_path` bleibt anpassbar pro Maschine — Default zeigt auf <home>/Projekte,
// fällt auf das Home-Verzeichnis zurück, wenn der Default-Ordner noch nicht existiert
// (sonst kippt der Sprint-2-PTY-Spawn mit ERROR_DIRECTORY direkt beim ersten Start).
function pickDefaultWorkspacePath(): string {
  const preferred = path.join(os.homedir(), 'Projekte');
  if (fs.existsSync(preferred)) return preferred;
  return os.homedir();
}

export function buildDefaultSettings(): AppSettings {
  return {
    workspace_path: pickDefaultWorkspacePath(),
    // Phase-2 Season-18: Default ist `true`, damit der Read-Merge fuer
    // Bestandsuser ohne das Feld den Wizard NICHT triggert. Nur
    // `SettingsStore.initialize()` ueberschreibt das beim Anlegen einer
    // wirklich frischen settings.json explizit auf `false`.
    workspace_wizard_completed: true,
    default_model: 'claude-sonnet-4-6',
    // Default 'claude' nutzt PATH. User kann auf einen absoluten Pfad wechseln,
    // wenn die Binary nicht im PATH liegt oder mehrere Installationen koexistieren.
    claude_binary_path: 'claude',

    // Sprint-8-Korrektur (TECH_SCHULDEN „Modell-Limits-Defaults zu hoch"):
    // Standard-Kontextfenster aller Modelle sind 200k. Das ältere 1M war Anthropics
    // Extended-Context-Beta — als Default falsch, weil die Per-Session-Kontext-Bar
    // dann grün bleibt, obwohl /context schon orange wäre.
    model_limits: {
      'claude-opus-4-7': 200_000,
      'claude-opus-4-6': 200_000,
      'claude-sonnet-4-6': 200_000,
      'claude-sonnet-4-5': 200_000,
      'claude-haiku-4-5': 200_000,
    },
    default_limit: 200_000,

    // Sprint-8: User-definierte Sensitive-File-Patterns — additiv zu den
    // hartcoded Defaults in src/renderer/components/sensitiveFiles.ts (Variante A:
    // Defaults bleiben immer aktiv, User kann nur erweitern). Default-Wert ist
    // ein leeres Array; Eintragsformat sind RegEx-Strings ohne Slashes (z.B.
    // 'credentials\\.json$', 'vault\\.ya?ml$').
    sensitive_file_patterns: [],

    // Sprint 9 — Default-Bars trimmt:
    //   - 5-Stunden-Limit (alle Modelle)
    //   - Wöchentlich · alle Modelle
    //   - Wöchentlich · Nur Sonnet
    // „Wöchentlich · Claude Design" ist raus — das Design-Limit wird durch die
    // Claude-Design-Webapp selbst befüllt, nicht durch die lokale JSONL-
    // Aggregation. User mit Bestands-Settings können den Eintrag im Settings-
    // Dialog selber entfernen.
    limit_bars: [
      { id: '5h', label: '5-Stunden-Limit', window_hours: 5, filter: 'all', limit_method: 'p90' },
      { id: 'weekly_all', label: 'Wöchentlich · alle Modelle', window_hours: 168, filter: 'all', limit_method: 'p90' },
      { id: 'weekly_sonnet', label: 'Wöchentlich · Nur Sonnet', window_hours: 168, filter: 'sonnet', limit_method: 'p90' },
    ],

    p90_window_hours: 192,

    token_warning_thresholds: {
      yellow: 70,
      orange: 85,
      red: 95,
    },

    // Phase-2 Season-8: Soft-Warning fuer die persoenliche Erfahrungsgrenze.
    // Default 20 % — empirisch der Punkt, an dem die Output-Qualitaet bei
    // sehr langen Sessions spuerbar nachlaesst (Anthropic-Recommendation).
    // Per User abschaltbar; greift unabhaengig von token_warning_thresholds.
    context_soft_warning: {
      enabled: true,
      threshold_percent: 20,
    },

    // Phase-2 Season-17: Screenshot-Retention. 30 Tage / 500 MiB — Roadmap-
    // Default-Werte. Wer komplett deaktivieren will, setzt beide Werte auf 0.
    screenshot_retention: {
      max_age_days: 30,
      max_total_mib: 500,
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
