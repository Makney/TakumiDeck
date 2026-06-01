// Templates (Sprint 6): Discovery, Frontmatter-Schema, Auto-Var-Resolver.

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
