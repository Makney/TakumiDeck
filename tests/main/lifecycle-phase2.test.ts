import { describe, it, expect } from 'vitest';
import { isTransitionAllowed, SessionLifecycle } from '../../src/main/sessions/lifecycle';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';
import type { SessionStatus } from '@shared/types';

// Phase-2 Season-1: TUI-State-Detection ergänzt die Lifecycle-Truth-Table um
// die Übergänge nach/aus `waiting` und `permission-prompt`. Die Sprint-3/5-
// Tests bleiben grün; diese Datei fixiert die *neuen* erlaubten und *neu
// verbotenen* Pfade.

const FIXED_NOW = 1_700_000_000_000;

function makeFixture(initial: SessionStatus = 'running') {
  const driver = new InMemorySessionDriver();
  const repo = new SessionRepository(driver);
  const lifecycle = new SessionLifecycle(repo, () => FIXED_NOW);
  const row = repo.create({
    id: 'sess-1',
    project_id: 'proj-1',
    title: 'Phase-2-Lifecycle',
    type: 'feature',
    model: 'claude-sonnet-4-6',
    cwd: '/tmp',
  });
  if (initial !== 'running') {
    repo.update(row.id, { status: initial });
  }
  return { repo, lifecycle };
}

describe('Phase-2-Lifecycle: waiting + permission-prompt freigeschaltet', () => {
  const newlyAllowed: Array<[SessionStatus, SessionStatus]> = [
    // running/idle → TUI-State
    ['running', 'waiting'],
    ['running', 'permission-prompt'],
    ['idle', 'waiting'],
    ['idle', 'permission-prompt'],
    // TUI-State → running (User hat geantwortet, Claude legt los)
    ['waiting', 'running'],
    ['permission-prompt', 'running'],
    // TUI-State ↔ TUI-State (Claude verkettet Prompts)
    ['waiting', 'permission-prompt'],
    ['permission-prompt', 'waiting'],
    // TUI-State → Endzustände (Tab-Close, Crash, App-Quit)
    ['waiting', 'archived'],
    ['waiting', 'interrupted'],
    ['permission-prompt', 'completed'],
    ['permission-prompt', 'archived'],
  ];
  // Bewusst NICHT erlaubt: waiting/permission-prompt → idle. Die
  // StateDetectionLoop soll diese Status nicht via Timestamp-Pfad nach
  // idle überschreiben — der vom Renderer gemeldete TUI-State würde sonst
  // alle 2 s wieder ausgehebelt.
  const stillDisallowed: Array<[SessionStatus, SessionStatus]> = [
    ['waiting', 'idle'],
    ['permission-prompt', 'idle'],
    // Archived bleibt terminal.
    ['archived', 'waiting'],
    ['archived', 'permission-prompt'],
  ];

  it.each(newlyAllowed)('erlaubt %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  it.each(stillDisallowed)('verbietet %s → %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(false);
  });
});

describe('SessionLifecycle.transition Side-Effects für TUI-States', () => {
  it('running → waiting setzt ended_at NICHT (waiting ist kein Endzustand)', () => {
    const { lifecycle, repo } = makeFixture('running');
    const result = lifecycle.transition('sess-1', 'waiting', 'manual');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('waiting');
    expect(result.data.ended_at).toBeNull();
    expect(repo.findById('sess-1')?.ended_at).toBeNull();
  });

  it('running → permission-prompt setzt ended_at NICHT', () => {
    const { lifecycle } = makeFixture('running');
    const result = lifecycle.transition('sess-1', 'permission-prompt', 'manual');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('permission-prompt');
    expect(result.data.ended_at).toBeNull();
  });

  it('permission-prompt → running nullt ended_at zurueck (Resume-Side-Effect)', () => {
    const { lifecycle, repo } = makeFixture('permission-prompt');
    // Vorzustand-Sanity: makeFixture leaves ended_at null bei initial !== 'running',
    // weil wir nur status patchen. Hier explizit checken.
    expect(repo.findById('sess-1')?.ended_at).toBeNull();
    const result = lifecycle.transition('sess-1', 'running', 'manual');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('running');
    expect(result.data.ended_at).toBeNull();
  });

  it('waiting → archived setzt ended_at via Clock', () => {
    const { lifecycle } = makeFixture('waiting');
    const result = lifecycle.transition('sess-1', 'archived', 'tab-close');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('archived');
    expect(result.data.ended_at).toBe(FIXED_NOW);
  });
});
