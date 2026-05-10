import type { Logger } from '../logger';
import type { SessionRepository } from '../db/repos/sessions';
import type { MessageRepository } from '../db/repos/messages';
import type { SessionLifecycle } from './lifecycle';
import { detectActivityState } from './state-detection';

// State-Detection-Loop (Sprint 5).
//
// Periodischer Tick (Default 2 s), der für alle Sessions im Status `running` oder
// `idle` die Activity-Detection neu ausführt: ist die letzte JSONL-Message jünger
// als 3 s, gilt die Session als running, sonst als idle. Status-Änderungen laufen
// durch SessionLifecycle.transition (running ↔ idle ist seit Sprint 5 erlaubt).
//
// Sessions ohne jegliche Messages (frisch gespawnt, noch kein claude-Output) werden
// nicht angefasst — sonst würde eine Session, die der User gerade neu erstellt hat,
// sofort als idle markiert, bevor claude überhaupt etwas geschrieben hat.

export interface StateDetectionLoopDeps {
  sessions: SessionRepository;
  messages: MessageRepository;
  lifecycle: SessionLifecycle;
  log: Logger;
  intervalMs?: number;
  idleThresholdMs?: number;
  now?: () => number;
}

export class StateDetectionLoop {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: StateDetectionLoopDeps) {}

  start(): void {
    if (this.timer) return;
    const interval = this.deps.intervalMs ?? 2000;
    this.timer = setInterval(() => this.tick(), interval);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Synchroner Tick: für jede aktive Session den letzten ts ziehen, klassifizieren,
  // ggf. via Lifecycle umschreiben. Pure Repo-Calls — fast genug für 2-5 Sessions.
  // public, damit Tests den Tick deterministisch ohne setInterval triggern können.
  tick(): void {
    const now = (this.deps.now ?? Date.now)();
    const idleThresholdMs = this.deps.idleThresholdMs ?? 3000;
    const candidates = [
      ...this.deps.sessions.listByStatus('running'),
      ...this.deps.sessions.listByStatus('idle'),
    ];
    for (const session of candidates) {
      const lastEventAt = this.deps.messages.lastTimestampForSession(session.id);
      if (lastEventAt === null) continue; // siehe Kommentar oben — kein Auto-idle vor erstem Output
      const next = detectActivityState({ lastEventAt, now, idleThresholdMs });
      if (next === session.status) continue;
      const result = this.deps.lifecycle.transition(session.id, next, 'manual');
      if (!result.ok) {
        this.deps.log.warn(
          `[state-detection] transition ${session.id} → ${next} fehlgeschlagen: ${result.error}`,
        );
      }
    }
  }
}
