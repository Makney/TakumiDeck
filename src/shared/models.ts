// Gemeinsame Modell-Liste fuer SettingsModal + NewSessionModal.
//
// Die App liefert eine fixe Built-in-Liste der bekannten Anthropic-Modelle —
// neue Anthropic-Releases brauchen weiterhin einen Code-Push (damit der Default
// auf eine sinnvolle ID zeigt). Daneben kann der User in den Settings beliebige
// `CustomModel`-Eintraege pflegen; die werden im Dropdown unter den Built-ins
// gelistet und mit `isCustom=true` markiert.
//
// IDs werden ueber `dedupeCustomModelsAgainstBuiltins` gegen die Built-in-Liste
// dedupliziert: ein Custom-Eintrag mit derselben ID wie ein Built-in ersetzt
// dessen Label (z.B. wenn der User „Opus 4.7" lieber „Opus" nennt).

import type { CustomModel, FetchedModel } from './types';

// Built-in-Modell-IDs in Anzeige-Reihenfolge (absteigend nach Capability;
// Daily-Driver Sonnet 4.6 weiter als Default in defaults.ts gesetzt).
export const BUILT_IN_MODEL_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

export interface ModelOption {
  id: string;
  label: string;
  isCustom: boolean;
}

// Baut die fuer Dropdowns nutzbare Liste aus Built-ins + Custom. Built-ins
// kommen zuerst; Customs sind in Eingabe-Reihenfolge. Custom-Eintrag mit
// derselben ID wie ein Built-in ueberschreibt das Built-in-Label (User-Wahl
// gewinnt). Eintraege mit leerer/duplikat-ID werden uebersprungen — die
// UI-Validierung sollte das vorher abfangen, das hier ist Defense-in-Depth.
export function buildModelOptions(customModels: ReadonlyArray<CustomModel>): ModelOption[] {
  const seen = new Set<string>();
  const out: ModelOption[] = [];

  for (const builtin of BUILT_IN_MODEL_OPTIONS) {
    const override = customModels.find((c) => c.id === builtin.id);
    const label = override ? override.label : builtin.label;
    out.push({ id: builtin.id, label, isCustom: false });
    seen.add(builtin.id);
  }

  for (const custom of customModels) {
    const id = custom.id.trim();
    if (id.length === 0) continue;
    if (seen.has(id)) continue;
    out.push({ id, label: custom.label.trim() || id, isCustom: true });
    seen.add(id);
  }

  return out;
}

// Defensive Normalisierung fuer Controlled-<select>: zeigt der gespeicherte Wert
// auf eine ID, die nicht (mehr) in den Optionen ist (z.B. geloeschtes Custom-
// Modell, CLAUDE.md-Default), faellt die Anzeige auf die erste Option zurueck,
// damit der Select nicht still die erste Option rendert, waehrend der value-Prop
// auf einen unsichtbaren Wert zeigt.
export function resolveModelSelectValue(
  value: string,
  options: ReadonlyArray<{ id: string }>,
): string {
  if (options.some((o) => o.id === value)) return value;
  return options[0]?.id ?? value;
}

export type CustomModelValidationError =
  | 'empty_id'
  | 'empty_label'
  | 'duplicate_id';

// Pure-Validator fuer neue Custom-Model-Eintraege im Settings-Tab. Liefert
// die erste gefundene Fehlerart oder `null` bei Erfolg. existingIds umfasst
// sowohl Built-in- als auch bereits angelegte Custom-IDs.
export function validateNewCustomModel(input: {
  id: string;
  label: string;
  existingIds: ReadonlyArray<string>;
}): CustomModelValidationError | null {
  const id = input.id.trim();
  if (id.length === 0) return 'empty_id';
  if (input.label.trim().length === 0) return 'empty_label';
  if (input.existingIds.includes(id)) return 'duplicate_id';
  return null;
}

// --- Variante D: Auto-Refresh gegen die Anthropic Models-API ----------------
//
// Die App fragt optional den offiziellen `/v1/models`-Endpoint ab, um neue
// Anthropic-Releases zu entdecken, bevor ein App-Update die Built-in-Liste
// nachzieht. Das funktioniert nur mit einem API-Key (x-api-key) — Abo-/OAuth-
// User haben den nicht zwingend; der IPC liefert dann `available=false` und die
// UI weist auf die manuelle Pflege unten hin. Der Endpoint liefert nur ID +
// Anzeigename, KEINE Kontextfenster-Groesse — Limits bleiben User-/Default-Sache.
//
// Die beiden Funktionen hier sind die context-freie, testbare Kernlogik:
// Antwort-Parsing und der Abgleich gegen bereits bekannte IDs.

// Robustes Parsing der `/v1/models`-Antwort. Erwartet das Anthropic-Shape
// `{ data: [{ id, display_name, ... }], ... }`, ist aber defensiv: Eintraege
// ohne String-`id` werden uebersprungen, fehlendes `display_name` faellt auf
// die ID zurueck. Kein Pagination-Handling — es gibt nur eine Handvoll Modelle,
// die in eine Seite passen (wir fragen mit limit=100 ab).
export function parseAnthropicModelsResponse(json: unknown): FetchedModel[] {
  if (!json || typeof json !== 'object') return [];
  const data = (json as Record<string, unknown>)['data'];
  if (!Array.isArray(data)) return [];
  const out: FetchedModel[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec['id'] === 'string' ? rec['id'].trim() : '';
    if (id.length === 0 || seen.has(id)) continue;
    const rawName = rec['display_name'];
    const displayName =
      typeof rawName === 'string' && rawName.trim().length > 0 ? rawName.trim() : id;
    out.push({ id, displayName });
    seen.add(id);
  }
  return out;
}

// Filtert aus den abgerufenen Modellen die heraus, die der App noch unbekannt
// sind — also weder Built-in noch bereits als Custom-Modell gepflegt. Genau
// diese Liste zeigt die UI als „neu entdeckt" mit Uebernehmen-Button an.
export function diffNewModels(
  fetched: ReadonlyArray<FetchedModel>,
  knownIds: ReadonlyArray<string>,
): FetchedModel[] {
  const known = new Set(knownIds.map((id) => id.trim()).filter((id) => id.length > 0));
  return fetched.filter((m) => !known.has(m.id));
}
