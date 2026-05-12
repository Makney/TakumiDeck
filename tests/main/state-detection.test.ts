import { describe, it, expect } from 'vitest';
import {
  detectActivityState,
  classifySessionState,
} from '../../src/main/sessions/state-detection';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';
import {
  MessageRepository,
  InMemoryMessageDriver,
} from '../../src/main/db/repos/messages';
import { SessionLifecycle } from '../../src/main/sessions/lifecycle';
import { StateDetectionLoop } from '../../src/main/sessions/state-detection-loop';
import { logger } from '../../src/main/logger';

const FIXED_NOW = 1_700_000_000_000;

describe('detectActivityState (pure)', () => {
  it('liefert idle bei lastEventAt = null', () => {
    expect(detectActivityState({ lastEventAt: null, now: FIXED_NOW })).toBe('idle');
  });

  it('liefert running, wenn die letzte Zeile <3 s alt ist (Default)', () => {
    expect(
      detectActivityState({ lastEventAt: FIXED_NOW - 1000, now: FIXED_NOW }),
    ).toBe('running');
  });

  it('liefert idle, wenn die letzte Zeile genau 3 s alt ist', () => {
    expect(
      detectActivityState({ lastEventAt: FIXED_NOW - 3000, now: FIXED_NOW }),
    ).toBe('idle');
  });

  it('liefert idle bei lastEventAt > now (Clock-Skew)', () => {
    expect(
      detectActivityState({ lastEventAt: FIXED_NOW + 5000, now: FIXED_NOW }),
    ).toBe('idle');
  });

  it('respektiert idleThresholdMs-Override', () => {
    expect(
      detectActivityState({ lastEventAt: FIXED_NOW - 5000, now: FIXED_NOW, idleThresholdMs: 10_000 }),
    ).toBe('running');
  });
});

describe('classifySessionState', () => {
  it('lässt beendete Sessions unverändert', () => {
    expect(
      classifySessionState('completed', { lastEventAt: FIXED_NOW - 100, now: FIXED_NOW }),
    ).toBe('completed');
    expect(
      classifySessionState('archived', { lastEventAt: FIXED_NOW - 100, now: FIXED_NOW }),
    ).toBe('archived');
    expect(
      classifySessionState('error', { lastEventAt: FIXED_NOW - 100, now: FIXED_NOW }),
    ).toBe('error');
    expect(
      classifySessionState('interrupted', { lastEventAt: FIXED_NOW - 100, now: FIXED_NOW }),
    ).toBe('interrupted');
  });

  it('klassifiziert running/idle anhand der Activity-Detection', () => {
    expect(
      classifySessionState('running', { lastEventAt: FIXED_NOW - 100, now: FIXED_NOW }),
    ).toBe('running');
    expect(
      classifySessionState('running', { lastEventAt: FIXED_NOW - 5000, now: FIXED_NOW }),
    ).toBe('idle');
    expect(
      classifySessionState('idle', { lastEventAt: FIXED_NOW - 100, now: FIXED_NOW }),
    ).toBe('running');
  });
});

// ---- Loop-Tests --------------------------------------------------------

describe('StateDetectionLoop.tick', () => {
  function setup() {
    const sessionDriver = new InMemorySessionDriver();
    const sessions = new SessionRepository(sessionDriver);
    const messageDriver = new InMemoryMessageDriver();
    const messages = new MessageRepository(messageDriver);
    const lifecycle = new SessionLifecycle(sessions, () => FIXED_NOW);
    const loop = new StateDetectionLoop({
      sessions,
      messages,
      lifecycle,
      log: logger,
      now: () => FIXED_NOW,
    });

    sessions.create({
      id: 'sess-active',
      project_id: 'proj-1',
      title: 'Aktiv',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: '/tmp',
    });

    return { sessions, messages, messageDriver, lifecycle, loop };
  }

  it('lässt running-Sessions mit staler JSONL unverändert (extended thinking)', () => {
    // JSONL-Loop darf running nicht auf waiting/idle setzen — extended thinking
    // schreibt kein JSONL, der Timestamp läuft aus ohne dass Claude fertig ist.
    // Der Renderer (TUI-Pattern) ist zuständig, waiting zu setzen.
    const { sessions, messages, loop } = setup();
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 100,
      tokens_out: 0,
      ts: FIXED_NOW - 5000,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('running');
  });

  it('schaltet idle → running, wenn eine frische Message reinkommt', () => {
    const { sessions, messages, lifecycle, loop } = setup();
    // Manuell auf idle setzen
    lifecycle.transition('sess-active', 'idle', 'manual');
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 100,
      tokens_out: 0,
      ts: FIXED_NOW - 100,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('running');
  });

  it('lässt running-Sessions ohne Messages unverändert (frischer Spawn)', () => {
    const { sessions, loop } = setup();
    // Keine Messages — frisch gespawnte Session, claude hat noch nicht getippt.
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('running');
  });

  it('lässt completed/archived/etc. unverändert', () => {
    const { sessions, lifecycle, messages, loop } = setup();
    lifecycle.transition('sess-active', 'completed', 'pty-exit');
    // Sogar mit alter Message — completed bleibt completed.
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 1,
      tokens_out: 0,
      ts: FIXED_NOW - 100_000,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('completed');
  });

  // ---- Phase-2 Season-1: JSONL-Rollen-Detection + permission-prompt-Guard ----

  it('lässt running + stale assistant-JSONL unverändert (kein Loop-Override)', () => {
    // Kernfix Phase-2-Regression: running-Sessions dürfen vom Loop nicht auf
    // waiting gesetzt werden — das ist Aufgabe des Renderers (TUI-Pattern).
    const { sessions, messages, loop } = setup();
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 10,
      tokens_out: 0,
      ts: FIXED_NOW - 5000,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('running');
  });

  it('lässt running + stale user-JSONL unverändert (kein running → idle via Loop)', () => {
    const { sessions, messages, loop } = setup();
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'user',
      content: '',
      tokens_in: 0,
      tokens_out: 0,
      ts: FIXED_NOW - 5000,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('running');
  });

  it('setzt idle → waiting, wenn letzte Rolle assistant und Timestamp stale', () => {
    // idle-Sessions können per JSONL-Rollen-Detection auf waiting gehen —
    // das ist korrekt: Claude hat geantwortet, aber die Session ist aus dem
    // running-Zustand already raus (z.B. nach einem restart).
    const { sessions, lifecycle, messages, loop } = setup();
    lifecycle.transition('sess-active', 'idle', 'manual');
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 10,
      tokens_out: 0,
      ts: FIXED_NOW - 5000,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('waiting');
  });

  it('lässt waiting unverändert bei fresh assistant-JSONL (Renderer hat waiting gerade gesetzt)', () => {
    // Kernfix: nach Clauds Antwort ist JSONL < 3 s alt (assistant-Rolle).
    // Loop darf waiting nicht auf running zurücksetzen — das wäre der Flacker-Bug
    // (kurz gelb, sofort wieder grün). Nur fresh user-JSONL darf waiting → running.
    const { sessions, lifecycle, messages, loop } = setup();
    lifecycle.transition('sess-active', 'waiting', 'manual');
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 10,
      tokens_out: 50,
      ts: FIXED_NOW - 200, // frisch, aber Rolle = assistant
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('waiting');
  });

  it('setzt waiting → running, wenn frische JSONL eintrifft (User hat gesendet)', () => {
    const { sessions, lifecycle, messages, loop } = setup();
    // Erst waiting-State herstellen.
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 1,
      tokens_out: 0,
      ts: FIXED_NOW - 10_000,
    });
    lifecycle.transition('sess-active', 'waiting', 'manual');
    // User sendet Nachricht → frische JSONL.
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'user',
      content: '',
      tokens_in: 5,
      tokens_out: 0,
      ts: FIXED_NOW - 200,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('running');
  });

  it('lässt permission-prompt-Sessions vollständig in Ruhe (kein Loop-Override)', () => {
    const { sessions, lifecycle, messages, loop } = setup();
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 1,
      tokens_out: 0,
      ts: FIXED_NOW - 10_000,
    });
    lifecycle.transition('sess-active', 'permission-prompt', 'manual');
    // Auch frische JSONL darf permission-prompt nicht überschreiben.
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 5,
      tokens_out: 0,
      ts: FIXED_NOW - 200,
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('permission-prompt');
  });
});
