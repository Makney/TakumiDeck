import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';
import {
  MessageRepository,
  InMemoryMessageDriver,
} from '../../src/main/db/repos/messages';
import { SessionLifecycle } from '../../src/main/sessions/lifecycle';
import {
  reconcileCrashedSessions,
  type ReconciliationLog,
} from '../../src/main/sessions/reconciliation';

// Sprint 8 — Crash-Recovery-Reconciliation-Pass.
// V4-C: ended_at = MAX(messages.ts), Fallback now().

const FIXED_NOW = 1_700_000_000_000;

function makeFixture() {
  const sessionDriver = new InMemorySessionDriver();
  const messageDriver = new InMemoryMessageDriver();
  const sessions = new SessionRepository(sessionDriver);
  const messages = new MessageRepository(messageDriver);
  const lifecycle = new SessionLifecycle(sessions, () => FIXED_NOW);

  const logEntries: { level: 'info' | 'warn'; message: string }[] = [];
  const log: ReconciliationLog = {
    info: (m) => logEntries.push({ level: 'info', message: m }),
    warn: (m) => logEntries.push({ level: 'warn', message: m }),
  };

  return { sessions, messages, lifecycle, log, logEntries };
}

describe('reconcileCrashedSessions', () => {
  let fixture: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fixture = makeFixture();
  });

  it('patcht running-Sessions ohne ended_at auf interrupted', () => {
    const session = fixture.sessions.create({
      id: '11111111-1111-1111-1111-111111111111',
      project_id: 'proj-1',
      title: 'Crashed-1',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });

    const result = reconcileCrashedSessions({
      ...fixture,
      clock: () => FIXED_NOW,
    });

    expect(result.inspected).toBe(1);
    expect(result.reconciled).toBe(1);
    expect(result.reconciledIds).toEqual([session.id]);
    expect(result.failed).toEqual([]);

    const updated = fixture.sessions.findById(session.id);
    expect(updated?.status).toBe('interrupted');
    // Keine messages → Fallback now() = FIXED_NOW.
    expect(updated?.ended_at).toBe(FIXED_NOW);
  });

  it('patcht idle-Sessions genauso (Sprint-5-Erweiterung)', () => {
    const session = fixture.sessions.create({
      id: '22222222-2222-2222-2222-222222222222',
      project_id: 'proj-1',
      title: 'Crashed-Idle',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });
    // Direkt auf idle setzen (umgeht State-Machine, simuliert Sprint-5-State).
    fixture.sessions.update(session.id, { status: 'idle' });

    const result = reconcileCrashedSessions(fixture);

    expect(result.reconciled).toBe(1);
    const updated = fixture.sessions.findById(session.id);
    expect(updated?.status).toBe('interrupted');
  });

  it('nutzt MAX(messages.ts) als ended_at (V4-C, genauer als now())', () => {
    const session = fixture.sessions.create({
      id: '33333333-3333-3333-3333-333333333333',
      project_id: 'proj-1',
      title: 'Crashed-mit-Messages',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });
    const lastTs = FIXED_NOW - 60_000; // gestern Mittag (relativ zum FIXED_NOW)
    fixture.messages.insert({
      session_id: session.id,
      project_id: 'proj-1',
      role: 'assistant',
      content: 'last message',
      tokens_in: 100,
      tokens_out: 200,
      ts: FIXED_NOW - 120_000,
    });
    fixture.messages.insert({
      session_id: session.id,
      project_id: 'proj-1',
      role: 'assistant',
      content: 'newer message',
      tokens_in: 50,
      tokens_out: 100,
      ts: lastTs,
    });

    const result = reconcileCrashedSessions(fixture);

    expect(result.reconciled).toBe(1);
    const updated = fixture.sessions.findById(session.id);
    expect(updated?.status).toBe('interrupted');
    // ended_at MUSS auf den lastTs der letzten Message zeigen, NICHT auf now().
    expect(updated?.ended_at).toBe(lastTs);
  });

  it('lässt Sessions mit bereits gesetztem ended_at unangetastet', () => {
    const session = fixture.sessions.create({
      id: '44444444-4444-4444-4444-444444444444',
      project_id: 'proj-1',
      title: 'Already-ended',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });
    // Kuriose Daten-Inkonsistenz: status=running, aber ended_at gesetzt.
    // Reconciliation darf das NICHT überschreiben.
    fixture.sessions.update(session.id, { ended_at: FIXED_NOW - 5_000 });

    const result = reconcileCrashedSessions(fixture);

    expect(result.inspected).toBe(1);
    expect(result.reconciled).toBe(0);
    const updated = fixture.sessions.findById(session.id);
    expect(updated?.ended_at).toBe(FIXED_NOW - 5_000);
    // Status bleibt running — wir patchen nur Crash-Kandidaten.
    expect(updated?.status).toBe('running');
  });

  it('lässt completed/archived/interrupted-Sessions unangetastet', () => {
    fixture.sessions.create({
      id: '55555555-5555-5555-5555-555555555555',
      project_id: 'proj-1',
      title: 'Already-completed',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });
    fixture.sessions.update('55555555-5555-5555-5555-555555555555', {
      status: 'completed',
      ended_at: FIXED_NOW - 1000,
    });

    const result = reconcileCrashedSessions(fixture);

    expect(result.inspected).toBe(0);
    expect(result.reconciled).toBe(0);
  });

  it('idempotent: zweiter Pass macht nichts mehr', () => {
    fixture.sessions.create({
      id: '66666666-6666-6666-6666-666666666666',
      project_id: 'proj-1',
      title: 'Crashed-mehrfach',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });

    const first = reconcileCrashedSessions(fixture);
    expect(first.reconciled).toBe(1);

    const second = reconcileCrashedSessions(fixture);
    expect(second.inspected).toBe(0);
    expect(second.reconciled).toBe(0);
  });

  it('verarbeitet mehrere Crash-Kandidaten in einem Pass', () => {
    const ids = [
      '77777777-7777-7777-7777-777777777771',
      '77777777-7777-7777-7777-777777777772',
      '77777777-7777-7777-7777-777777777773',
    ];
    for (const id of ids) {
      fixture.sessions.create({
        id,
        project_id: 'proj-1',
        title: `Crash-${id}`,
        type: 'feature',
        model: 'claude-sonnet-4-6',
        cwd: 'C:\\X',
      });
    }

    const result = reconcileCrashedSessions(fixture);
    expect(result.inspected).toBe(3);
    expect(result.reconciled).toBe(3);
    expect(result.reconciledIds.sort()).toEqual([...ids].sort());
  });

  it('schreibt Info-Log-Zeilen pro patchedSession + Pass-Summary', () => {
    fixture.sessions.create({
      id: '88888888-8888-8888-8888-888888888888',
      project_id: 'proj-1',
      title: 'Logged',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\X',
    });

    reconcileCrashedSessions(fixture);

    const infoMessages = fixture.logEntries
      .filter((e) => e.level === 'info')
      .map((e) => e.message);
    // Mindestens zwei Info-Zeilen: pro Session + Pass-Summary.
    expect(infoMessages.length).toBeGreaterThanOrEqual(2);
    expect(
      infoMessages.some((m) => m.includes('88888888-8888-8888-8888-888888888888')),
    ).toBe(true);
    expect(infoMessages.some((m) => m.includes('Pass abgeschlossen'))).toBe(true);
  });

  it('keine Logs bei leerem Pass (nichts zu reconcilen)', () => {
    reconcileCrashedSessions(fixture);
    // Pass-Summary nur, wenn inspected > 0 — bei leerem Pass = stille Operation.
    expect(fixture.logEntries).toEqual([]);
  });
});
