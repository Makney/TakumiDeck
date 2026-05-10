import type { ClaudeMdFrontmatter } from '@shared/types';

// Pure-Logik: berechnet die Schnellzugriff-Liste für den Editor (Sprint 7, Phase 4).
//
// Architektur 6.8: „Schnellzugriff-Liste — workbench.on_demand_files aus
// CLAUDE.md YAML + Plus immer: CLAUDE.md, CHANGELOG, FEATURES, ROADMAP,
// ENTSCHEIDUNGEN".
//
// Wir liefern eine deduplizierte Liste in fester Reihenfolge:
//   1. Standards (CLAUDE.md ganz oben, danach docs/CHANGELOG, FEATURES, ENTSCHEIDUNGEN)
//   2. Phase-File aus current_phase_file (wenn gesetzt)
//   3. On-Demand-Files aus dem Frontmatter
// Doppelte Pfade (z.B. wenn current_phase_file in on_demand_files vorkommt) werden
// herausgefiltert — der erste Eintrag in dieser Reihenfolge gewinnt.

export type QuickAccessSource = 'standard' | 'phase' | 'on_demand';

export interface QuickAccessEntry {
  // Forward-Slash-Pfad relativ zum Projekt-Root.
  relPath: string;
  // Anzeigename — die kurze Form (Dateiname ohne Verzeichnis), für die Tab-Pille.
  label: string;
  source: QuickAccessSource;
}

const STANDARD_FILES: ReadonlyArray<{ path: string; label: string }> = [
  { path: 'CLAUDE.md', label: 'CLAUDE.md' },
  { path: 'docs/CHANGELOG.md', label: 'CHANGELOG.md' },
  { path: 'docs/FEATURES.md', label: 'FEATURES.md' },
  { path: 'docs/ENTSCHEIDUNGEN.md', label: 'ENTSCHEIDUNGEN.md' },
];

export function buildQuickAccessList(
  frontmatter: ClaudeMdFrontmatter | null,
): QuickAccessEntry[] {
  const seen = new Set<string>();
  const out: QuickAccessEntry[] = [];

  for (const std of STANDARD_FILES) {
    const norm = normalizePath(std.path);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ relPath: norm, label: std.label, source: 'standard' });
  }

  if (frontmatter?.workbench.current_phase_file) {
    const norm = normalizePath(frontmatter.workbench.current_phase_file);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push({ relPath: norm, label: basename(norm), source: 'phase' });
    }
  }

  const onDemand = frontmatter?.workbench.on_demand_files ?? [];
  for (const item of onDemand) {
    const path = typeof item === 'string' ? item : item.path;
    if (!path) continue;
    const norm = normalizePath(path);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ relPath: norm, label: basename(norm), source: 'on_demand' });
  }

  return out;
}

// Forward-Slash-Normalisierung: Backslashes (Windows-Schreibweise im Frontmatter)
// und Dopplungen werden auf einzelne Forward-Slashes gemappt; führende ./ entfernt.
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

function basename(relPath: string): string {
  const parts = relPath.split('/');
  return parts[parts.length - 1] ?? relPath;
}
