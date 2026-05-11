import type { SessionStatus, SessionRow } from '@shared/types';
import type { SessionRepository } from '../db/repos/sessions';
import type { IpcResult } from '@shared/types';
import { ok, err } from '@shared/result';
import type { Logger } from '../logger';

// Zentrale Session-Lifecycle-State-Machine.
//
// Alle Status-Übergänge laufen durch transition() — disallowed-Übergänge werden hier
// abgewiesen, statt jedem IPC-Handler die Vor-/Nach-Bedingungen einzeln aufzubürden.
// Sprint-3-Scope: running, completed, archived, interrupted, error + Resume zurück
// auf running. Sprint-5-Erweiterung: running ↔ idle via JSONL-State-Detection
// (Architektur 6.2). waiting bleibt im Schema, wird aber bewusst NICHT geschrieben —
// Permission-Prompt-Recognition ist Phase 2 (Architektur 8).
//
// Driver-Injection-Pattern wie Sprint-1-Migration und Sprint-2-PtyManager:
// die Klasse kennt nur SessionRepository, keine konkrete DB-Verbindung — Tests fahren
// mit InMemorySessionDriver, kein echtes SQLite nötig.

export type LifecycleReason =
  | 'pty-exit'         // PTY ist natürlich gestorben (claude beendet)
  | 'spawn-error'      // PTY-Spawn ist fehlgeschlagen
  | 'app-quit'         // App schließt, laufende Sessions als interrupted markieren
  | 'tab-close'        // User hat den Tab geschlossen (X) — archived
  | 'resume'           // Resume-Button: zurück auf running
  | 'crash-recovery'   // Startup-Reconciliation: orphane Live-Sessions auf interrupted
  | 'manual';          // Catch-all (Tests, manuelle Patches)

export type Clock = () => number;

// Erlaubte Übergänge: from → Set(to). Was nicht hier steht, wird abgelehnt.
// Schreibweise als 2D-Map, damit Truth-Table-Tests trivial darauf greifen können.
const ALLOWED: Record<SessionStatus, ReadonlySet<SessionStatus>> = {
  // Sprint-5: running ↔ idle via JSONL-Detection. waiting bleibt absichtlich raus
  // (Phase 2: Permission-Prompt-Recognition); idle bleibt der einzig „weichere"
  // Übergang, alles andere weiterhin Sprint-3-konform.
  running: new Set<SessionStatus>(['idle', 'completed', 'interrupted', 'error', 'archived']),
  completed: new Set<SessionStatus>(['running', 'archived']),
  interrupted: new Set<SessionStatus>(['running', 'archived']),
  error: new Set<SessionStatus>(['running', 'archived']),
  archived: new Set<SessionStatus>(),
  // waiting wird Sprint 5 NICHT geschrieben, aber als Source weiterhin akzeptiert,
  // falls eine externe Komponente (Tests, künftige Phase-2-Detection) ihn setzt.
  waiting: new Set<SessionStatus>(['running', 'completed', 'interrupted', 'error', 'archived']),
  idle: new Set<SessionStatus>(['running', 'completed', 'interrupted', 'error', 'archived']),
};

// Ist `to` ein gültiger Folge-Status von `from`? Reine Daten-Frage, keine Side-Effects.
export function isTransitionAllowed(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export class SessionLifecycle {
  private shuttingDown = false;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock = () => Date.now(),
    private readonly log?: Logger,
  ) {}

  // App-Quit-Phase: setzt das Flag, sodass ein gleichzeitiger pty:exit-Handler
  // die Sessions nicht mehr auf completed überschreibt (Sprint-2-Verhalten).
  markShuttingDown(): void {
    this.shuttingDown = true;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  // Hauptweg: validiert Übergang, schreibt Status + abhängige Felder (ended_at)
  // konsolidiert in *einem* Repo-Patch.
  transition(
    sessionId: string,
    to: SessionStatus,
    reason: LifecycleReason = 'manual',
  ): IpcResult<SessionRow> {
    const current = this.sessions.findById(sessionId);
    if (!current) {
      return err<SessionRow>(`Session ${sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
    }
    if (current.status === to) {
      // Idempotent: kein Statuswechsel, kein Patch — erspart Lärm in Tests + Logs.
      return ok(current);
    }
    if (!isTransitionAllowed(current.status, to)) {
      return err<SessionRow>(
        `Übergang ${current.status} → ${to} nicht erlaubt für Session ${sessionId}`,
        'LIFECYCLE_INVALID_TRANSITION',
      );
    }

    // Side-Effect-Tabelle: jeder Ziel-Status zieht ggf. Folgefelder nach.
    // ended_at wird beim Eintritt in einen Endzustand gesetzt, beim Resume genullt.
    const patch: Parameters<SessionRepository['update']>[1] = { status: to };
    if (to === 'running') {
      patch.ended_at = null;
    } else if (to === 'completed' || to === 'interrupted' || to === 'error' || to === 'archived') {
      // ended_at nicht überschreiben, falls schon gesetzt (z.B. Tab-Close auf bereits beendete Session).
      if (current.ended_at == null) {
        patch.ended_at = this.clock();
      }
    }

    const updated = this.sessions.update(sessionId, patch);
    if (!updated) {
      return err<SessionRow>(`Session ${sessionId} während Patch verschwunden`, 'SESSION_NOT_FOUND');
    }
    // Reason fürs Diagnose-Log: bei Bug-Reports nachvollziehen, *warum* eine
    // Session in einem bestimmten Status gelandet ist (PTY-Exit vs. App-Quit
    // vs. Crash-Recovery). Debug-Level, damit es im Default-Loglevel nicht rauscht.
    this.log?.debug(
      `[lifecycle] ${current.status}→${to} session=${sessionId.slice(0, 8)} reason=${reason}`,
    );
    return ok(updated);
  }
}
