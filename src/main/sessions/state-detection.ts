import type { SessionStatus } from '@shared/types';

// State-Detection (Sprint 5, Architektur 6.2).
//
// Pure-Logik-Util für die reduzierte State-Detection: vergleicht den letzten
// JSONL-Event-Timestamp einer Session mit der aktuellen Zeit und entscheidet,
// ob die Session als `running` (= aktiv) oder `idle` (= inaktiv) gilt. Sidebar-
// Status-Dot konsumiert diese Klassifikation.
//
// Architektur-Spec ist „letzte Zeile <3 s alt = running". Wir machen den Schwell-
// Wert konfigurierbar, damit Tests deterministisch arbeiten — der Production-Pfad
// ruft die Funktion ohne Override und greift den Default 3000 ms.
//
// Bewusst NICHT hier:
// - waiting/Permission-Prompt-Recognition (Phase 2). Architektur 8 listet das
//   explizit als „nach MVP-Stabilisierung" — Sprint 5 schreibt die SessionStatus-
//   Werte `running`/`idle` (plus die alten Sprint-3-Werte, die State-Machine bleibt
//   ansonsten unverändert).
// - Hybrid-Datenquellen (PTY-Stdout + JSONL). Variant-A entschieden: rein last-
//   timestamp-basiert.

export interface DetectStateInput {
  lastEventAt: number | null;
  now: number;
  // Default 3 s laut Architektur 6.2 — Tests können das überschreiben.
  idleThresholdMs?: number;
}

// Reine Klassifikation: eine Session ist `running`, wenn die letzte Zeile in der
// JSONL jünger als idleThresholdMs ist. Edge-Cases:
//   - lastEventAt = null → keine Events, also idle.
//   - lastEventAt > now → Clock-Skew (NTP-Drift, falsch geschriebene timestamp-Strings).
//     Wir treten defensiv zurück und melden idle, statt eine „aus der Zukunft kommende"
//     Session als running zu zeigen.
export function detectActivityState(input: DetectStateInput): 'running' | 'idle' {
  const threshold = input.idleThresholdMs ?? 3000;
  if (input.lastEventAt === null) return 'idle';
  if (input.lastEventAt > input.now) return 'idle'; // Clock-Skew abfangen
  const ageMs = input.now - input.lastEventAt;
  return ageMs < threshold ? 'running' : 'idle';
}

// Convenience-Wrapper: nimmt den persistierten DB-Status der Session als „letzte
// Wahrheit" bei beendeten Sessions (completed/archived/interrupted/error) und ruft
// nur für Sessions mit aktivem Lifecycle (`running` oder `idle`) die Activity-Detection.
//
// Damit bleibt der Detection-Pfad agnostisch zur Lifecycle-State-Machine: das Schreiben
// des neuen Status (running ↔ idle) macht weiterhin SessionLifecycle.transition().
export function classifySessionState(
  currentStatus: SessionStatus,
  detection: DetectStateInput,
): SessionStatus {
  if (currentStatus !== 'running' && currentStatus !== 'idle') {
    return currentStatus;
  }
  return detectActivityState(detection);
}
