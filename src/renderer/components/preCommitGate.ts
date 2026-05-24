// Pure-Logik: Entscheidet, ob der Commit-Trigger-Send-Button im PreCommitModal
// aktiviert ist (Phase-2 Season-29.5).
//
// Phase 1 hatte nur eine Soft-Warnung ueber sensitive Files (.env, *.key etc.).
// Roadmap-Wunsch: harte Bremse, bis der User die Liste explizit bestaetigt.
// Wir bauen das als zusaetzliche Bedingung in canSend ein — alle bisherigen
// Gates (kein Git, kein Terminal, kein Diff, schon gesendet) bleiben unveraendert.

export interface PreCommitGateInput {
  hasGit: boolean;
  loading: boolean;
  loadError: string | null;
  hasActiveTerminal: boolean;
  changedFileCount: number;
  sensitiveFileCount: number;
  // Confirm-Checkbox: erst gesetzt, wenn der User die sensitive-Liste
  // explizit abgenickt hat. Bei sensitiveFileCount === 0 ignoriert.
  sensitiveConfirmed: boolean;
  // Send wurde bereits ausgeloest (Auto-Close-Timer laeuft).
  sent: boolean;
}

export function canSendCommitTrigger(input: PreCommitGateInput): boolean {
  if (!input.hasGit) return false;
  if (input.loading) return false;
  if (input.loadError !== null) return false;
  if (!input.hasActiveTerminal) return false;
  if (input.changedFileCount === 0) return false;
  if (input.sent) return false;
  if (input.sensitiveFileCount > 0 && !input.sensitiveConfirmed) return false;
  return true;
}
