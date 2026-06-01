// Docs-Sync (Season 21) + On-Demand-Kontext-Praeambel (Season 22).

// Phase-2 Season-21 — Docs-Sync. Status-IPC fuer das NewSessionModal mit
// Typ „Docs-Sync". Re-Export der pure-Helper-Typen aus shared/docs-sync.ts,
// damit Preload-Bridge + Renderer denselben Vertrag sehen wie das Modul,
// das die Logik haelt.
import type {
  DocsSyncFileDescriptor as _DocsSyncFileDescriptor,
  DocsSyncFileState as _DocsSyncFileState,
  DocsSyncFileStatus as _DocsSyncFileStatus,
  DocsSyncStatusResult as _DocsSyncStatusResult,
} from '../docs-sync';

export type DocsSyncFileDescriptor = _DocsSyncFileDescriptor;
export type DocsSyncFileState = _DocsSyncFileState;
export type DocsSyncFileStatus = _DocsSyncFileStatus;
export type DocsSyncStatusResult = _DocsSyncStatusResult;

export interface DocsSyncStatusInput {
  projectId: string;
}

// Phase-2 Season-22 — On-Demand-Kontext-Praeambel. Pro Datei dasselbe
// Status-Shape wie bei Docs-Sync, plus optional der Summary-Body ohne
// Frontmatter. Body ist nur gesetzt, wenn die Summary geladen werden
// konnte (state in {fresh, stale}); bei missing-summary/missing-source
// ist er null. Renderer entscheidet anhand des Status, ob er die Datei
// pre-checked anbietet und den Body in die Praeambel uebernimmt.
export interface DocsOnDemandStatusInput {
  projectId: string;
}

export interface DocsOnDemandFileStatus extends DocsSyncFileStatus {
  summaryBody: string | null;
}

export interface DocsOnDemandStatusResult {
  files: DocsOnDemandFileStatus[];
  generatedAt: number;
}
