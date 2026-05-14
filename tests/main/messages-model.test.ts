import { describe, it, expect } from 'vitest';
import {
  MessageRepository,
  InMemoryMessageDriver,
} from '../../src/main/db/repos/messages';
import type { MessageInsert } from '../../src/shared/types';

// Phase-2 Season-10: Tests fuer die messages.model-Spalte und das Aggregat,
// das der Verlauf-Panel-Detail-Pane in der Inline-Liste „Modelle" zeigt.
// SQLite-Driver bleibt durch das gemeinsame MessageDbDriver-Interface gedeckt,
// die SQL-Statements selbst sind in messages.ts trivial.

function makeRepo() {
  const driver = new InMemoryMessageDriver();
  return { repo: new MessageRepository(driver), driver };
}

function makeMessage(overrides: Partial<MessageInsert>): MessageInsert {
  return {
    session_id: 's1',
    project_id: 'p1',
    role: 'assistant',
    content: '',
    tokens_in: 0,
    tokens_out: 0,
    ts: 1,
    model: null,
    ...overrides,
  };
}

describe('MessageRepository.aggregateModelsForSession', () => {
  it('zaehlt Messages pro Modell, sortiert absteigend nach count', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7', ts: 1 }));
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7', ts: 2 }));
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7', ts: 3 }));
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-sonnet-4-6', ts: 4 }));
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-sonnet-4-6', ts: 5 }));
    expect(repo.aggregateModelsForSession('s1')).toEqual([
      { model: 'claude-opus-4-7', count: 3 },
      { model: 'claude-sonnet-4-6', count: 2 },
    ]);
  });

  it('ignoriert NULL-Modelle (externe Sessions ohne Modell-Info)', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7' }));
    driver.insert(makeMessage({ session_id: 's1', model: null }));
    driver.insert(makeMessage({ session_id: 's1', model: null }));
    expect(repo.aggregateModelsForSession('s1')).toEqual([
      { model: 'claude-opus-4-7', count: 1 },
    ]);
  });

  it('normalisiert undefined → null beim Insert (Bestands-Caller ohne model-Feld)', () => {
    const { repo, driver } = makeRepo();
    // Bewusst ohne model-Property — analog zu state-detection.test.ts und
    // reconciliation.test.ts, die das Feld vor Season 10 nicht setzten.
    driver.insert({
      session_id: 's1',
      project_id: 'p1',
      role: 'assistant',
      content: '',
      tokens_in: 0,
      tokens_out: 0,
      ts: 1,
    });
    expect(repo.aggregateModelsForSession('s1')).toEqual([]);
  });

  it('isoliert sessions: messages anderer Sessions zaehlen nicht mit', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7' }));
    driver.insert(makeMessage({ session_id: 's2', model: 'claude-sonnet-4-6' }));
    expect(repo.aggregateModelsForSession('s1')).toEqual([
      { model: 'claude-opus-4-7', count: 1 },
    ]);
    expect(repo.aggregateModelsForSession('s2')).toEqual([
      { model: 'claude-sonnet-4-6', count: 1 },
    ]);
  });

  it('liefert leeres Array fuer Session ohne Messages', () => {
    const { repo } = makeRepo();
    expect(repo.aggregateModelsForSession('ghost')).toEqual([]);
  });

  it('Tie-Break: gleicher count, sortiert alphabetisch aufsteigend nach model', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-sonnet-4-6', ts: 1 }));
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7', ts: 2 }));
    // counts beide 1 — Opus 4.7 zuerst (alphabetisch vor Sonnet 4.6).
    expect(repo.aggregateModelsForSession('s1')).toEqual([
      { model: 'claude-opus-4-7', count: 1 },
      { model: 'claude-sonnet-4-6', count: 1 },
    ]);
  });
});

describe('MessageRepository.aggregateModelsForSessions (Bulk)', () => {
  it('liefert Aggregate fuer mehrere Sessions in einer Map', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7' }));
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7' }));
    driver.insert(makeMessage({ session_id: 's2', model: 'claude-sonnet-4-6' }));
    const result = repo.aggregateModelsForSessions(['s1', 's2']);
    expect(result.get('s1')).toEqual([{ model: 'claude-opus-4-7', count: 2 }]);
    expect(result.get('s2')).toEqual([{ model: 'claude-sonnet-4-6', count: 1 }]);
  });

  it('leere Eingabe → leere Map', () => {
    const { repo } = makeRepo();
    expect(repo.aggregateModelsForSessions([])).toEqual(new Map());
  });

  it('Sessions ohne messages tauchen NICHT in der Map auf (Caller defaultet zu [])', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7' }));
    const result = repo.aggregateModelsForSessions(['s1', 'ghost']);
    expect(result.has('s1')).toBe(true);
    expect(result.has('ghost')).toBe(false);
  });

  it('NULL-Modelle werden auch im Bulk gefiltert', () => {
    const { repo, driver } = makeRepo();
    driver.insert(makeMessage({ session_id: 's1', model: 'claude-opus-4-7' }));
    driver.insert(makeMessage({ session_id: 's1', model: null }));
    driver.insert(makeMessage({ session_id: 's2', model: null }));
    const result = repo.aggregateModelsForSessions(['s1', 's2']);
    expect(result.get('s1')).toEqual([{ model: 'claude-opus-4-7', count: 1 }]);
    expect(result.has('s2')).toBe(false);
  });
});
