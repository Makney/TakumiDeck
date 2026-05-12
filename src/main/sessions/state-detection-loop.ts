import type { Logger } from '../logger';
import type { SessionRepository } from '../db/repos/sessions';
import type { MessageRepository } from '../db/repos/messages';
import type { SessionLifecycle } from './lifecycle';
import { detectActivityState } from './state-detection';

// State-Detection-Loop (Sprint 5 + Phase-2 Season-1).
//
// Periodischer Tick (Default 2 s) für Sessions in den vier „live"-Status
// `running` / `idle` / `waiting` / `permission-prompt`:
//
//   - running: letzte JSONL-Message < 3 s alt (Claude schreibt gerade).
//   - waiting: letzte JSONL-Message ≥ 3 s alt UND Rolle = 'assistant'.
//     Bedeutet: Claude hat geantwortet, User ist am Zug. Zuverlässiger als
//     TUI-Pattern-Matching, weil JSONL strukturierte Daten liefert statt
//     volatilen Terminaltext.
//   - idle: letzte JSONL-Message ≥ 3 s alt UND Rolle = 'user' (oder kein Eintrag
//     nach Timeout). Selten — tritt auf, wenn die Session eingefroren ist ohne
//     dass Claude geantwortet hat.
//   - permission-prompt: kommt weiterhin vom Renderer (TUI-Pattern auf dem
//     xterm-Buffer). Der Loop lässt `permission-prompt`-Sessions vollständig
//     in Ruhe, damit der Renderer-Status nicht überschrieben wird.
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
  // Callback nach erfolgreicher Transition — Main.ts verkabelt dies mit
  // getWebContents()?.send(SessionStatusPush), damit der Renderer-Store
  // sofort aktualisiert wird ohne selbst pollen zu müssen.
  notifyRenderer?: (sessionId: string, status: string) => void;
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
    let candidates;
    try {
      candidates = [
        ...this.deps.sessions.listByStatus('running'),
        ...this.deps.sessions.listByStatus('idle'),
        ...this.deps.sessions.listByStatus('waiting'),
        ...this.deps.sessions.listByStatus('permission-prompt'),
      ];
    } catch (e) {
      this.deps.log.warn(`[state-detection] Kandidaten-Lookup fehlgeschlagen: ${e}`);
      return;
    }
    for (const session of candidates) {
      try {
        // permission-prompt kommt vom Renderer — Loop lässt diese Sessions
        // vollständig in Ruhe, damit der TUI-Status nicht überschrieben wird.
        if (session.status === 'permission-prompt') continue;

        const lastEventAt = this.deps.messages.lastTimestampForSession(session.id);
        if (lastEventAt === null) continue; // frisch gespawnt, noch kein Output

        const activityState = detectActivityState({ lastEventAt, now, idleThresholdMs });

        // Running-Sessions mit stale JSONL überspringen: extended thinking /
        // Perambulating schreibt kein JSONL — der Timestamp läuft aus, obwohl
        // Claude noch rechnet. Den `waiting`-Trigger darf nur der Renderer setzen
        // (TUI-Pattern: `> ? for shortcuts` sichtbar ohne `esc to interrupt`).
        if (activityState !== 'running' && session.status === 'running') continue;

        // JSONL-Rollen-Detection für `waiting` (nur für nicht-running-Sessions):
        // wenn Claude geantwortet hat (letzte Rolle = 'assistant') und keine
        // frische Aktivität mehr, ist die Session im Wartezustand — User am Zug.
        let next: 'running' | 'idle' | 'waiting';
        if (activityState === 'running') {
          next = 'running';
          // Waiting-Sessions nur auf running gehen, wenn der User die Aktion
          // ausgelöst hat (frische user-JSONL). Fresh assistant-JSONL bedeutet:
          // Claude hat gerade geantwortet, der Renderer setzt `waiting` via TUI —
          // Loop darf hier NICHT zurückspringen, sonst flackert der Status
          // (waiting → running innerhalb von 3 s nach dem Antwort-Abschluss).
          if (session.status === 'waiting') {
            const lastRole = this.deps.messages.lastRoleForSession(session.id);
            if (lastRole !== 'user') continue;
          }
        } else {
          const lastRole = this.deps.messages.lastRoleForSession(session.id);
          next = lastRole === 'assistant' ? 'waiting' : 'idle';
        }

        if (next === session.status) continue;
        const result = this.deps.lifecycle.transition(session.id, next, 'manual');
        if (!result.ok) {
          this.deps.log.warn(
            `[state-detection] transition ${session.id} → ${next} fehlgeschlagen: ${result.error}`,
          );
        } else {
          this.deps.notifyRenderer?.(session.id, next);
        }
      } catch (e) {
        this.deps.log.warn(
          `[state-detection] Session ${session.id.slice(0, 8)} übersprungen: ${e}`,
        );
      }
    }
  }
}
