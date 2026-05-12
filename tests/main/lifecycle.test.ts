import { describe, it, expect } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';
import {
  SessionLifecycle,
  isTransitionAllowed,
} from '../../src/main/sessions/lifecycle';
import type { SessionStatus } from '@shared/types';

// Test-Setup: jede Session bekommt eine frische InMemory-Repo, plus eine Lifecycle-Instanz
// mit Fixed-Clock, damit ended_at deterministisch ist.
function makeFixture(initialStatus: SessionStatus = 'running') {
  const driver = new InMemorySessionDriver();
  const repo = new SessionRepository(driver);
  const fixedNow = 1_700_000_000_000;
  const lifecycle = new SessionLifecycle(repo, () => fixedNow);

  const row = repo.create({
    id: 'sess-test',
    project_id: 'proj-1',
    title: 'Lifecycle-Test',
    type: 'feature',
    model: 'claude-sonnet-4-6',
    cwd: 'C:\\Test',
  });

  // Falls der Test eine andere Start-Status-Lage braucht, einmal direkt patchen
  // (umgeht die State-Machine, weil wir einen Vorzustand für den eigentlichen Test setzen).
  if (initialStatus !== 'running') {
    repo.update(row.id, {
      status: initialStatus,
      ended_at: initialStatus === 'archived' ? fixedNow - 10_000 : fixedNow - 5_000,
    });
  }

  return { repo, lifecycle, fixedNow };
}

// ---- Truth-Table -----------------------------------------------------------
// Quelle: ALLOWED-Map in lifecycle.ts. Wir fixieren die Sprint-3-Erwartung explizit
// im Test, damit eine Erweiterung in Sprint 5 (waiting/idle aktiv schreiben) bewusst
// gemacht werden muss — und nicht versehentlich passiert.
describe('isTransitionAllowed (Truth-Table)', () => {
  const allowed: Array<[SessionStatus, SessionStatus]> = [
    ['running', 'completed'],
    ['running', 'interrupted'],
    ['running', 'error'],
    ['running', 'archived'],
    ['completed', 'running'],
    ['completed', 'archived'],
    ['interrupted', 'running'],
    ['interrupted', 'archived'],
    ['error', 'running'],
    ['error', 'archived'],
  ];
  const disallowed: Array<[SessionStatus, SessionStatus]> = [
    ['archived', 'running'],
    ['archived', 'completed'],
    ['archived', 'archived'],
    // Hinweis: running → waiting war Sprint-3 noch verboten und Sprint-5 weiterhin;
    // Phase-2 Season-1 (TUI-Detection) hat es freigeschaltet. Test-Truth dort:
    // tests/main/lifecycle-phase2.test.ts.
    ['completed', 'completed'],
    ['completed', 'interrupted'],
    ['interrupted', 'completed'],
    ['error', 'completed'],
  ];

  it.each(allowed)('erlaubt %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  it.each(disallowed)('verbietet %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(false);
  });
});

// ---- Side-Effects ----------------------------------------------------------
describe('SessionLifecycle.transition Side-Effects', () => {
  it('setzt beim Übergang in einen Endzustand ended_at über die Clock', () => {
    const { lifecycle, fixedNow } = makeFixture('running');
    const result = lifecycle.transition('sess-test', 'completed', 'pty-exit');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('completed');
    expect(result.data.ended_at).toBe(fixedNow);
  });

  it('überschreibt ein bereits gesetztes ended_at nicht', () => {
    const { lifecycle, repo, fixedNow } = makeFixture('completed');
    // Vorzustand: ended_at = fixedNow - 5_000 (aus makeFixture)
    const beforeRow = repo.findById('sess-test');
    expect(beforeRow?.ended_at).toBe(fixedNow - 5_000);

    const result = lifecycle.transition('sess-test', 'archived', 'tab-close');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('archived');
    // ended_at bleibt der ursprüngliche Endzeitpunkt — nicht „archived-Zeitpunkt".
    expect(result.data.ended_at).toBe(fixedNow - 5_000);
  });

  it('nullt ended_at beim Resume zurück auf null', () => {
    const { lifecycle } = makeFixture('interrupted');
    const result = lifecycle.transition('sess-test', 'running', 'resume');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('running');
    expect(result.data.ended_at).toBeNull();
  });

  it('idempotenter Übergang ist ein No-op und liefert die aktuelle Row', () => {
    const { lifecycle, repo } = makeFixture('completed');
    const before = repo.findById('sess-test');
    const result = lifecycle.transition('sess-test', 'completed', 'manual');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(before);
  });
});

// ---- Error-Pfade -----------------------------------------------------------
describe('SessionLifecycle.transition Fehlerfälle', () => {
  it('lehnt nicht erlaubte Übergänge mit Code LIFECYCLE_INVALID_TRANSITION ab', () => {
    const { lifecycle } = makeFixture('archived');
    const result = lifecycle.transition('sess-test', 'running', 'resume');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LIFECYCLE_INVALID_TRANSITION');
    expect(result.error).toMatch(/archived → running/);
  });

  it('returnt SESSION_NOT_FOUND, wenn die Session nicht existiert', () => {
    const { lifecycle } = makeFixture('running');
    const result = lifecycle.transition('ghost-id', 'completed', 'pty-exit');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SESSION_NOT_FOUND');
  });
});

// ---- Shutdown-Flag ---------------------------------------------------------
describe('SessionLifecycle Shutdown-Flag', () => {
  it('Default ist nicht-shutting-down', () => {
    const { lifecycle } = makeFixture();
    expect(lifecycle.isShuttingDown()).toBe(false);
  });

  it('markShuttingDown setzt das Flag dauerhaft', () => {
    const { lifecycle } = makeFixture();
    lifecycle.markShuttingDown();
    expect(lifecycle.isShuttingDown()).toBe(true);
  });
});
