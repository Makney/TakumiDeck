import { describe, it, expect } from 'vitest';
import { derivePhaseLabel, formatSeasonName } from '../../src/main/ipc/templates';

describe('derivePhaseLabel', () => {
  it('extrahiert "Phase 2" aus docs/roadmap/PHASE2.md', () => {
    expect(derivePhaseLabel('docs/roadmap/PHASE2.md')).toBe('Phase 2');
  });

  it('extrahiert "Phase 11" aus mehrstelligen Nummern', () => {
    expect(derivePhaseLabel('docs/roadmap/PHASE11.md')).toBe('Phase 11');
  });

  it('toleriert Windows-Pfadtrenner', () => {
    expect(derivePhaseLabel('docs\\roadmap\\PHASE3.md')).toBe('Phase 3');
  });

  it('case-insensitive', () => {
    expect(derivePhaseLabel('docs/roadmap/phase4.md')).toBe('Phase 4');
  });

  it('liefert null bei null-Eingabe', () => {
    expect(derivePhaseLabel(null)).toBeNull();
  });

  it('liefert null, wenn der Dateiname keine PHASE<N>-Zahl traegt', () => {
    expect(derivePhaseLabel('docs/roadmap/ROADMAP.md')).toBeNull();
  });
});

describe('formatSeasonName', () => {
  it('Phase + Season + Titel: vollstaendiges Format', () => {
    expect(
      formatSeasonName({ title: 'Trigger-Phrasen-Schnellbuttons', season_number: 3 }, 'Phase 2'),
    ).toBe('Phase 2 Season 3: Trigger-Phrasen-Schnellbuttons');
  });

  it('ohne Phase-Label: nur Season + Titel', () => {
    expect(
      formatSeasonName({ title: 'Etwas', season_number: 7 }, null),
    ).toBe('Season 7: Etwas');
  });

  it('Phase-Label, aber keine Season-Number: Phase + Titel', () => {
    expect(
      formatSeasonName({ title: 'Bugfix-Cluster', season_number: null }, 'Phase 1'),
    ).toBe('Phase 1: Bugfix-Cluster');
  });

  it('weder Phase noch Season: nur Titel', () => {
    expect(
      formatSeasonName({ title: 'Solo-Titel', season_number: null }, null),
    ).toBe('Solo-Titel');
  });
});
