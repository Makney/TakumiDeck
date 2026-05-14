import { describe, it, expect } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';

// Phase-2 Season-11 — SessionRepository.assignSeasonNumber (Templates-Send-
// Flow). Idempotent: hat die Session schon eine season_number, gewinnt sie.
// Sonst MAX(season_number)+1 ueber alle Sessions des gleichen Projekts und
// UPDATE. Der Test deckt die drei Equivalenzklassen ab + die Cross-Project-
// Trennung (Sessions in Projekt B duerfen den Counter in Projekt A nicht
// beeinflussen).

function makeRepo() {
  const driver = new InMemorySessionDriver();
  return { repo: new SessionRepository(driver), driver };
}

const baseInput = {
  project_id: 'proj-1',
  title: 't',
  type: 'feature' as const,
  model: 'm',
  cwd: '/x',
};

describe('SessionRepository.assignSeasonNumber', () => {
  it('weist Session#1 die Nummer 1 zu, wenn das Projekt sonst keine Feature-Sessions hat', () => {
    const { repo } = makeRepo();
    const s = repo.create({ ...baseInput, id: 's1', type: 'bug' });
    expect(s.season_number).toBeNull();
    const result = repo.assignSeasonNumber('s1');
    expect(result).toEqual({ seasonNumber: 1, freshlyAssigned: true });
    expect(repo.findById('s1')?.season_number).toBe(1);
  });

  it('weist MAX(season_number)+1 ueber sessions des gleichen Projekts zu', () => {
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 's-feature-1', season_number: 1 });
    repo.create({ ...baseInput, id: 's-feature-2', season_number: 2 });
    repo.create({ ...baseInput, id: 's-feature-5', season_number: 5 });
    // Neue Session ohne Nummer — bekommt MAX+1 = 6, Luecken (3, 4) bleiben.
    repo.create({ ...baseInput, id: 's-target', type: 'bug' });
    const result = repo.assignSeasonNumber('s-target');
    expect(result).toEqual({ seasonNumber: 6, freshlyAssigned: true });
  });

  it('returnt die bestehende Nummer, wenn die Session schon eine hat (idempotent)', () => {
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 's-feature-5', season_number: 5 });
    // Re-Allocate denselben Aufruf — die 5 muss bleiben, kein 6er-Drift.
    const first = repo.assignSeasonNumber('s-feature-5');
    expect(first).toEqual({ seasonNumber: 5, freshlyAssigned: false });
    const second = repo.assignSeasonNumber('s-feature-5');
    expect(second).toEqual({ seasonNumber: 5, freshlyAssigned: false });
    expect(repo.findById('s-feature-5')?.season_number).toBe(5);
  });

  it('beruecksichtigt Sessions anderer Projekte NICHT', () => {
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 'a1', project_id: 'A', season_number: 1 });
    repo.create({ ...baseInput, id: 'a2', project_id: 'A', season_number: 2 });
    // Projekt B startet bei 1, egal wie hoch A schon ist.
    repo.create({ ...baseInput, id: 'b1', project_id: 'B', type: 'bug' });
    const result = repo.assignSeasonNumber('b1');
    expect(result).toEqual({ seasonNumber: 1, freshlyAssigned: true });
  });

  it('returnt null fuer eine unbekannte Session-ID', () => {
    const { repo } = makeRepo();
    expect(repo.assignSeasonNumber('ghost')).toBeNull();
  });

  it('zieht den Counter mit, wenn eine zweite Session in Folge alloziert wird', () => {
    // Praxis-Bug-Szenario: zwei aufeinanderfolgende Templates-Sends an zwei
    // verschiedene Sessions im selben Projekt sollen zwei aufeinanderfolgende
    // Nummern bekommen — nicht beide dieselbe.
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 's1', type: 'bug' });
    repo.create({ ...baseInput, id: 's2', type: 'bug' });
    const r1 = repo.assignSeasonNumber('s1');
    const r2 = repo.assignSeasonNumber('s2');
    expect(r1?.seasonNumber).toBe(1);
    expect(r2?.seasonNumber).toBe(2);
  });
});
