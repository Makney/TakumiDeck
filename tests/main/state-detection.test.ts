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

  it('schaltet running → idle, wenn die letzte Message zu alt ist', () => {
    const { sessions, messages, loop } = setup();
    messages.insert({
      session_id: 'sess-active',
      project_id: 'proj-1',
      role: 'assistant',
      content: '',
      tokens_in: 100,
      tokens_out: 0,
      ts: FIXED_NOW - 5000, // 5 s her, > 3 s Threshold
    });
    loop.tick();
    expect(sessions.findById('sess-active')?.status).toBe('idle');
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
});
