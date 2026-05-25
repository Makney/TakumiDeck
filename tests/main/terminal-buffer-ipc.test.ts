import { describe, it, expect } from 'vitest';
import {
  TerminalSaveBufferInputSchema,
  TerminalLoadBufferInputSchema,
} from '../../src/shared/schemas';
import { ok, err, errFromUnknown } from '../../src/shared/result';
import {
  InMemorySessionDriver,
  SessionRepository,
} from '../../src/main/db/repos/sessions';
import {
  InMemorySessionBufferDriver,
  SessionBufferRepository,
} from '../../src/main/db/repos/session-buffer';

// Phase-2 Season-32: Tests fuer die Skip-Gate-Logik beider IPC-Handler.
//
// Wie in tests/main/git-ipc.test.ts replizieren wir die Handler-Logik 1:1
// als testbare Funktionen, weil ipcMain.handle ohne echtes Electron-Environment
// nicht aufrufbar ist. Das Skip-Gate (`session.type !== 'terminal'`) ist die
// Kernpruefung — sie verhindert, dass eine claude-Session versehentlich
// einen Buffer-Snapshot schreibt oder einen falschen geladen kriegt.

function saveBufferHandler(deps: {
  sessions: SessionRepository;
  buffers: SessionBufferRepository;
}) {
  return (payload: unknown) => {
    try {
      const input = TerminalSaveBufferInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      if (session.type !== 'terminal') {
        return err(
          'Buffer-Persist nur fuer terminal-Sessions erlaubt',
          'TERMINAL_BUFFER_TYPE_MISMATCH',
        );
      }
      deps.buffers.upsert(input.sessionId, input.snapshot);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'TERMINAL_SAVE_BUFFER');
    }
  };
}

function loadBufferHandler(deps: {
  sessions: SessionRepository;
  buffers: SessionBufferRepository;
}) {
  return (payload: unknown) => {
    try {
      const input = TerminalLoadBufferInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      if (session.type !== 'terminal') {
        return ok({ snapshot: null });
      }
      return ok({ snapshot: deps.buffers.get(input.sessionId) });
    } catch (e) {
      return errFromUnknown(e, 'TERMINAL_LOAD_BUFFER');
    }
  };
}

function makeDeps() {
  const sessions = new SessionRepository(new InMemorySessionDriver());
  const buffers = new SessionBufferRepository(new InMemorySessionBufferDriver());
  return { sessions, buffers };
}

const SESSION_UUID_TERM = '11111111-1111-1111-1111-111111111111';
const SESSION_UUID_CLAUDE = '22222222-2222-2222-2222-222222222222';
const SESSION_UUID_UNKNOWN = '33333333-3333-3333-3333-333333333333';

describe('terminal:save-buffer Handler', () => {
  it('persistiert den Snapshot fuer terminal-Sessions', () => {
    const deps = makeDeps();
    deps.sessions.create({
      id: SESSION_UUID_TERM,
      project_id: 'proj-1',
      title: 'PS-Shell',
      type: 'terminal',
      model: null,
      cwd: 'C:\\Foo',
    });
    const handler = saveBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_TERM, snapshot: 'snap-content' });
    expect(result).toEqual({ ok: true, data: null });
    expect(deps.buffers.get(SESSION_UUID_TERM)).toBe('snap-content');
  });

  it('lehnt claude-Sessions mit TERMINAL_BUFFER_TYPE_MISMATCH ab', () => {
    const deps = makeDeps();
    deps.sessions.create({
      id: SESSION_UUID_CLAUDE,
      project_id: 'proj-1',
      title: 'Feature-Session',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\Foo',
    });
    const handler = saveBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_CLAUDE, snapshot: 'snap' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TERMINAL_BUFFER_TYPE_MISMATCH');
    }
    expect(deps.buffers.get(SESSION_UUID_CLAUDE)).toBeNull();
  });

  it('lehnt fehlende Sessions mit SESSION_NOT_FOUND ab', () => {
    const deps = makeDeps();
    const handler = saveBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_UNKNOWN, snapshot: 'snap' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('terminal:load-buffer Handler', () => {
  it('liefert den persistierten Snapshot fuer terminal-Sessions', () => {
    const deps = makeDeps();
    deps.sessions.create({
      id: SESSION_UUID_TERM,
      project_id: 'proj-1',
      title: 'PS-Shell',
      type: 'terminal',
      model: null,
      cwd: 'C:\\Foo',
    });
    deps.buffers.upsert(SESSION_UUID_TERM, 'restored-snap', 100);
    const handler = loadBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_TERM });
    expect(result).toEqual({ ok: true, data: { snapshot: 'restored-snap' } });
  });

  it('liefert snapshot=null, wenn der Snapshot noch nie gesetzt wurde', () => {
    const deps = makeDeps();
    deps.sessions.create({
      id: SESSION_UUID_TERM,
      project_id: 'proj-1',
      title: 'PS-Shell',
      type: 'terminal',
      model: null,
      cwd: 'C:\\Foo',
    });
    const handler = loadBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_TERM });
    expect(result).toEqual({ ok: true, data: { snapshot: null } });
  });

  it('liefert snapshot=null fuer claude-Sessions (still, kein Fehler)', () => {
    // Defense-in-Depth: falls der Renderer den Load versehentlich fuer eine
    // claude-Session ruft, ist null das richtige Signal — der Restore-Pfad
    // im TerminalTab macht dann no-op, statt einen Error-Toast zu zeigen.
    const deps = makeDeps();
    deps.sessions.create({
      id: SESSION_UUID_CLAUDE,
      project_id: 'proj-1',
      title: 'Feature-Session',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\Foo',
    });
    // Direkt im Buffer-Repo gesetzt (DB-Manipulation) — der Handler darf den
    // Wert TROTZDEM nicht zurueckliefern, weil das Skip-Gate vorher greift.
    deps.buffers.upsert(SESSION_UUID_CLAUDE, 'should-not-be-loaded', 100);
    const handler = loadBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_CLAUDE });
    expect(result).toEqual({ ok: true, data: { snapshot: null } });
  });

  it('lehnt fehlende Sessions mit SESSION_NOT_FOUND ab', () => {
    const deps = makeDeps();
    const handler = loadBufferHandler(deps);
    const result = handler({ sessionId: SESSION_UUID_UNKNOWN });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SESSION_NOT_FOUND');
  });
});
