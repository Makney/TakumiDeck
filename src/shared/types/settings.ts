// Settings + Modell-Konfiguration (settings.json im AppData-Ordner).

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

// Phase-2 Season-34: User-definiertes Modell. Built-in-Liste lebt in
// src/shared/models.ts (`BUILT_IN_MODEL_OPTIONS`); CustomModel-Eintraege
// erweitern die Dropdown-Auswahl in SettingsModal + NewSessionModal.
// Kontext-Limits werden ausschliesslich ueber die Per-Modell-Limit-Tabelle
// (settings.model_limits) gepflegt — die deckt Custom-Modelle mit ab.
export interface CustomModel {
  id: string;
  label: string;
}

// Phase-2 Season-34 (Variante D): ein vom Anthropic `/v1/models`-Endpoint
// abgerufenes Modell. Nur ID + Anzeigename — der Endpoint liefert KEIN
// Kontextfenster, deshalb gibt es hier kein Limit-Feld.
export interface FetchedModel {
  id: string;
  displayName: string;
}

// Ergebnis des optionalen Modell-Auto-Refresh. `available=false` heisst: kein
// API-Key gesetzt (z.B. Abo-/OAuth-Nutzung) — der Renderer weist dann auf die
// manuelle Pflege hin, statt einen Fehler zu zeigen. HTTP-/Netzwerkfehler
// kommen NICHT hier an, sondern als IpcResult.ok=false.
export type ModelFetchResult =
  | { available: true; models: FetchedModel[] }
  | { available: false; reason: 'no-api-key' };

// Vollständige Settings-Shape laut Architektur Kapitel 4.
// Wird als settings.json im AppData-Ordner persistiert.
export interface AppSettings {
  // Phase-2 Season-25: Settings-Schema-Versionierung analog zum SQLite-
  // Migrations-Runner. `SettingsStore.read()` zieht Bestandsuser ueber eine
  // versionierte TypeScript-Migrations-Pipeline (`src/main/settings/migrations.ts`)
  // auf den aktuellen Stand, bevor das zod-Vollschema parst. Wert haelt
  // CURRENT_SETTINGS_SCHEMA_VERSION; Bestandsuser ohne das Feld werden vor
  // dem Pipeline-Lauf implizit als Version 1 gelesen.
  schema_version: number;
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
  // Phase-2 Season-34: User-erweiterbare Modell-Liste, gepflegt im Settings-
  // Tab „Modelle". Built-ins (`BUILT_IN_MODEL_OPTIONS` in src/shared/models.ts)
  // bleiben fix; dieser Slot ergaenzt fuer neue Anthropic-Releases vor dem
  // naechsten App-Update.
  custom_models: CustomModel[];
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
  // Phase-2 Season-24: Default-Layout fuer den Markdown-Editor. 'split'
  // rendert Editor und Preview parallel mit synchronem Scrolling (neuer
  // Daily-Driver-Default), 'editor' und 'preview' verhalten sich wie der
  // alte Phase-1-Toggle. Per Datei in der Editor-Toolbar umschaltbar.
  markdown_editor_layout: 'split' | 'editor' | 'preview';
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
