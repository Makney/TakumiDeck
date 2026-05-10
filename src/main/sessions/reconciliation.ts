// Crash-Recovery: orphane running/idle-Sessions beim App-Start auf 'interrupted'
// patchen. Sprint 8 (TECH_SCHULDEN „Crash-Recovery für orphane running-Sessions").
//
// Variante C aus Sprint-3-Briefing: Reconciliation-Pass beim nächsten App-Start.
// Bei Hard-Crash (Strom weg, Task-Manager-Kill, OOM) bleibt der before-quit-Handler
// nicht durchlaufen, also stehen Sessions in der DB mit status='running'/'idle'
// und ended_at=null. Sprint-6-Verlauf-Panel würde sie sonst fälschlich als „läuft"
// anzeigen, obwohl der claude-Prozess längst tot ist.
//
// V4-C: ended_at = MAX(messages.ts) WHERE session_id, Fallback now() — der letzte
// claude-Antwort-Timestamp ist die genaueste verfügbare Approximation des
// Crash-Zeitpunkts. Sessions ohne Messages bekommen now() (Sprint-Briefing).
//
// Driver-Injection-Pattern: kein direkter SQLite-Zugriff. Lifecycle und Repos
// sind injiziert, sodass Tests mit InMemory-Drivern laufen können.

import type { SessionRepository } from '../db/repos/sessions';
import type { MessageRepository } from '../db/repos/messages';
import type { SessionLifecycle } from './lifecycle';
import type { SessionRow } from '@shared/types';

export interface ReconciliationLog {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

export interface ReconciliationResult {
  // Wieviele Sessions wurden geprüft (running + idle).
  inspected: number;
  // Wieviele tatsächlich auf interrupted gepatcht wurden (= ended_at war null).
  reconciled: number;
  // IDs der gepatchten Sessions — Tests prüfen direkt darauf.
  reconciledIds: string[];
  // Sessions, deren Lifecycle-Transition fehlgeschlagen ist (würde nur passieren,
  // wenn der State-Machine-Übergang sich Sprint-übergreifend ändert).
  failed: string[];
}

export interface ReconciliationDeps {
  sessions: SessionRepository;
  messages: MessageRepository;
  lifecycle: SessionLifecycle;
  log: ReconciliationLog;
  // Test-Hook für deterministische Fallback-Werte ohne echten Date.now().
  clock?: () => number;
}

export function reconcileCrashedSessions(deps: ReconciliationDeps): ReconciliationResult {
  const { sessions, messages, lifecycle, log } = deps;
  const clock = deps.clock ?? Date.now;

  // Beide live-Status durchgehen: running + idle. Beide bedeuten „der claude-Prozess
  // läuft noch" — beide können beim Hard-Crash zurückbleiben (Sprint-5-Erweiterung
  // hat idle als zweiten Live-Status eingeführt; before-quit deckt seitdem beide ab).
  const candidates: SessionRow[] = [
    ...sessions.listByStatus('running'),
    ...sessions.listByStatus('idle'),
  ];

  const result: ReconciliationResult = {
    inspected: candidates.length,
    reconciled: 0,
    reconciledIds: [],
    failed: [],
  };

  for (const session of candidates) {
    // Defensive: wer schon ended_at hat, ist kein Crash-Kandidat (Daten-Inkonsistenz,
    // aber nichts, was wir hier reparieren müssen — das before-quit-Handling hatte
    // teilweise greifen können).
    if (session.ended_at != null) continue;

    // Lifecycle-Transition: validiert running/idle → interrupted (beides erlaubt seit
    // Sprint 5) und setzt ended_at = clock(). Im Erfolgsfall korrigieren wir ended_at
    // anschließend auf den letzten messages.ts-Stand — der genauere Wert.
    const transition = lifecycle.transition(session.id, 'interrupted', 'app-quit');
    if (!transition.ok) {
      log.warn(
        `[reconciliation] Lifecycle-Transition fehlgeschlagen sessionId=${session.id}: ${transition.error}`,
      );
      result.failed.push(session.id);
      continue;
    }

    // V4-C: ended_at auf den genauesten verfügbaren Wert korrigieren.
    // MAX(messages.ts) liefert den Timestamp der letzten claude-Antwort vor Crash;
    // null = die Session hatte nie eine Antwort (= now() bleibt korrekt).
    const lastMessageTs = messages.lastTimestampForSession(session.id);
    if (lastMessageTs !== null) {
      const patched = sessions.update(session.id, { ended_at: lastMessageTs });
      if (!patched) {
        log.warn(
          `[reconciliation] ended_at-Korrektur fehlgeschlagen sessionId=${session.id} (Session verschwunden?)`,
        );
      }
    }

    result.reconciled += 1;
    result.reconciledIds.push(session.id);
    log.info(
      `[reconciliation] sessionId=${session.id} status=${session.status}→interrupted ended_at=${
        lastMessageTs ?? clock()
      } (${lastMessageTs !== null ? 'last-message' : 'fallback-now'})`,
    );
  }

  if (result.inspected > 0) {
    log.info(
      `[reconciliation] Pass abgeschlossen: ${result.reconciled}/${result.inspected} Sessions auf interrupted gepatcht (${result.failed.length} Fehler)`,
    );
  }
  return result;
}
