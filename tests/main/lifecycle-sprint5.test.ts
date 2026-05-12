import { describe, it, expect } from 'vitest';
import { isTransitionAllowed, SessionLifecycle } from '../../src/main/sessions/lifecycle';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';
import type { SessionStatus } from '@shared/types';

// Sprint-5-Erweiterung der Lifecycle-State-Machine: running ↔ idle.
//
// Sprint-3-Truth-Table (lifecycle.test.ts) bleibt unverändert grün — diese Datei
// fügt nur die *neuen* Übergänge hinzu, die Sprint 5 erlaubt. running → waiting
// bleibt explizit verboten (Phase 2: Permission-Prompt-Recognition).

const FIXED_NOW = 1_700_000_000_000;

function makeFixture(initial: SessionStatus = 'running') {
  const driver = new InMemorySessionDriver();
  const repo = new SessionRepository(driver);
  const lifecycle = new SessionLifecycle(repo, () => FIXED_NOW);
  const row = repo.create({
    id: 'sess-1',
    project_id: 'proj-1',
    title: 'Sprint-5-Lifecycle',
    type: 'feature',
    model: 'claude-sonnet-4-6',
    cwd: '/tmp',
  });
  if (initial !== 'running') {
    repo.update(row.id, { status: initial });
  }
  return { repo, lifecycle };
}

describe('Sprint-5-Lifecycle: running ↔ idle erlaubt', () => {
  const newlyAllowed: Array<[SessionStatus, SessionStatus]> = [
    ['running', 'idle'],
    ['idle', 'running'],
  ];
  // Phase-2 Season-1 hat running→waiting und idle→waiting freigeschaltet (siehe
  // tests/main/lifecycle-phase2.test.ts). Hier bleiben nur die Transitions,
  // die auch Phase-2-übergreifend NICHT erlaubt sind — vor allem alles aus dem
  // archived-Endzustand.
  const stillDisallowed: Array<[SessionStatus, SessionStatus]> = [
    ['archived', 'idle'],
    ['archived', 'running'],
  ];

  it.each(newlyAllowed)('erlaubt %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  it.each(stillDisallowed)('verbietet weiterhin %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(false);
  });
});

describe('SessionLifecycle.transition: running ↔ idle Side-Effects', () => {
  it('setzt ended_at NICHT beim Übergang running → idle (idle ist kein Endzustand)', () => {
    const { lifecycle, repo } = makeFixture('running');
    const result = lifecycle.transition('sess-1', 'idle', 'manual');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('idle');
    expect(result.data.ended_at).toBeNull();
    expect(repo.findById('sess-1')?.ended_at).toBeNull();
  });

  it('Übergang idle → running ist idempotent für ended_at (bleibt null)', () => {
    const { lifecycle } = makeFixture('idle');
    const result = lifecycle.transition('sess-1', 'running', 'manual');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('running');
    expect(result.data.ended_at).toBeNull();
  });

  it('idle → completed setzt ended_at via Clock', () => {
    const { lifecycle } = makeFixture('idle');
    const result = lifecycle.transition('sess-1', 'completed', 'pty-exit');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('completed');
    expect(result.data.ended_at).toBe(FIXED_NOW);
  });

  it('idle → interrupted (App-Quit-Pfad)', () => {
    const { lifecycle } = makeFixture('idle');
    const result = lifecycle.transition('sess-1', 'interrupted', 'app-quit');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('interrupted');
  });
});
