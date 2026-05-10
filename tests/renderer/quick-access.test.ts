import { describe, it, expect } from 'vitest';
import {
  buildQuickAccessList,
  normalizePath,
} from '../../src/renderer/components/quickAccess';
import type { ClaudeMdFrontmatter } from '../../src/shared/types';

// Sprint 7 — Pure-Logik-Tests für die Schnellzugriff-Liste (Architektur 6.8 +
// Phase 4 des Sprint-7-Briefings).

describe('normalizePath', () => {
  it('mappt Backslashes auf Forward-Slashes', () => {
    expect(normalizePath('docs\\CHANGELOG.md')).toBe('docs/CHANGELOG.md');
  });

  it('kollabiert Doppel-Slashes', () => {
    expect(normalizePath('docs//foo//bar.md')).toBe('docs/foo/bar.md');
  });

  it('entfernt führendes ./', () => {
    expect(normalizePath('./CLAUDE.md')).toBe('CLAUDE.md');
  });

  it('lässt einen sauberen Pfad unverändert', () => {
    expect(normalizePath('docs/sub/file.md')).toBe('docs/sub/file.md');
  });
});

describe('buildQuickAccessList', () => {
  it('liefert die 4 Standards in fester Reihenfolge bei null-Frontmatter', () => {
    const result = buildQuickAccessList(null);
    expect(result.map((e) => e.relPath)).toEqual([
      'CLAUDE.md',
      'docs/CHANGELOG.md',
      'docs/FEATURES.md',
      'docs/ENTSCHEIDUNGEN.md',
    ]);
    expect(result.every((e) => e.source === 'standard')).toBe(true);
  });

  it('hängt das current_phase_file als phase-Eintrag an', () => {
    const fm: ClaudeMdFrontmatter = {
      workbench: {
        current_phase_file: 'docs/roadmap/PHASE1.md',
        trigger_phrases: { docs_update: 'x', commit: 'y' },
      },
    };
    const result = buildQuickAccessList(fm);
    const phase = result.find((e) => e.source === 'phase');
    expect(phase).toBeDefined();
    expect(phase!.relPath).toBe('docs/roadmap/PHASE1.md');
    expect(phase!.label).toBe('PHASE1.md');
  });

  it('hängt on_demand_files als on_demand-Einträge an', () => {
    const fm: ClaudeMdFrontmatter = {
      workbench: {
        trigger_phrases: { docs_update: 'x', commit: 'y' },
        on_demand_files: [
          'docs/CODING_RULES.md',
          { path: 'docs/MARKDOWN_RULES.md', trigger: 'when editing md' },
        ],
      },
    };
    const result = buildQuickAccessList(fm);
    const onDemand = result.filter((e) => e.source === 'on_demand');
    expect(onDemand.map((e) => e.relPath)).toEqual([
      'docs/CODING_RULES.md',
      'docs/MARKDOWN_RULES.md',
    ]);
  });

  it('dedupliziert: wenn current_phase_file in on_demand_files steht, bleibt nur die phase-Variante', () => {
    const fm: ClaudeMdFrontmatter = {
      workbench: {
        current_phase_file: 'docs/roadmap/PHASE1.md',
        trigger_phrases: { docs_update: 'x', commit: 'y' },
        on_demand_files: ['docs/roadmap/PHASE1.md', 'docs/CODING_RULES.md'],
      },
    };
    const result = buildQuickAccessList(fm);
    const phase1 = result.filter((e) => e.relPath === 'docs/roadmap/PHASE1.md');
    expect(phase1).toHaveLength(1);
    expect(phase1[0]!.source).toBe('phase');
    // CODING_RULES bleibt als on_demand erhalten.
    expect(result.some((e) => e.relPath === 'docs/CODING_RULES.md')).toBe(true);
  });

  it('dedupliziert: Standards gewinnen vor on_demand_files', () => {
    const fm: ClaudeMdFrontmatter = {
      workbench: {
        trigger_phrases: { docs_update: 'x', commit: 'y' },
        on_demand_files: ['CLAUDE.md', 'docs/CHANGELOG.md'],
      },
    };
    const result = buildQuickAccessList(fm);
    const claude = result.filter((e) => e.relPath === 'CLAUDE.md');
    expect(claude).toHaveLength(1);
    expect(claude[0]!.source).toBe('standard');
  });

  it('normalisiert Pfade aus dem Frontmatter (Backslashes etc.)', () => {
    const fm: ClaudeMdFrontmatter = {
      workbench: {
        trigger_phrases: { docs_update: 'x', commit: 'y' },
        on_demand_files: ['docs\\sub\\file.md'],
      },
    };
    const result = buildQuickAccessList(fm);
    expect(result.some((e) => e.relPath === 'docs/sub/file.md')).toBe(true);
  });

  it('akzeptiert leeres on_demand_files-Array ohne Crash', () => {
    const fm: ClaudeMdFrontmatter = {
      workbench: {
        trigger_phrases: { docs_update: 'x', commit: 'y' },
        on_demand_files: [],
      },
    };
    const result = buildQuickAccessList(fm);
    expect(result.length).toBe(4); // nur Standards
  });
});
