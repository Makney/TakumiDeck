import type { SessionStatus } from '@shared/types';

// Phase-2 Season-32 — Aggregation der Tab-Status pro Projekt fuer die
// Sidebar-Marker. Pure Funktion ohne Store-Bezug, damit sie in den Tests
// als Black-Box geprueft werden kann.
//
// Mapping:
//   - running           → grueneR Badge (laeuft, alles gut)
//   - waiting           → oranger Badge ("wartet auf Input")
//   - permission-prompt → oranger Badge (zusammen mit waiting)
//   - interrupted       → gelber Badge (Resume-Kandidat)
//   - error             → gelber Badge (Resume-Kandidat)
// Andere Status (completed, archived, idle) zaehlen nicht — completed/archived
// wandert in den Verlauf, idle ist neutral (Claude wartet auf JSONL-Aktivitaet,
// aber das ist kein Aufmerksamkeits-Trigger fuer den User).

export interface ProjectStatusCounts {
  running: number;
  waiting: number;
  attention: number;
}

interface TabLike {
  projectId: string;
  status: SessionStatus;
}

export function aggregateProjectStatusCounts(
  tabs: ReadonlyArray<TabLike>,
): Map<string, ProjectStatusCounts> {
  const map = new Map<string, ProjectStatusCounts>();
  for (const tab of tabs) {
    const bucket = pickBucket(tab.status);
    if (!bucket) continue;
    const current = map.get(tab.projectId) ?? { running: 0, waiting: 0, attention: 0 };
    current[bucket] += 1;
    map.set(tab.projectId, current);
  }
  return map;
}

function pickBucket(status: SessionStatus): keyof ProjectStatusCounts | null {
  if (status === 'running') return 'running';
  if (status === 'waiting' || status === 'permission-prompt') return 'waiting';
  if (status === 'interrupted' || status === 'error') return 'attention';
  return null;
}

// Helper fuer den Renderer: aus den Counts den hoechstprioritaeren
// Aufmerksamkeits-Marker ableiten. Orange (waiting) schlaegt Gelb (attention) —
// "wartet jetzt auf Input" ist dringender als "Resume offen".
export type AttentionMarker =
  | { kind: 'waiting'; count: number }
  | { kind: 'attention'; count: number }
  | null;

export function pickAttentionMarker(counts: ProjectStatusCounts | undefined): AttentionMarker {
  if (!counts) return null;
  if (counts.waiting > 0) return { kind: 'waiting', count: counts.waiting };
  if (counts.attention > 0) return { kind: 'attention', count: counts.attention };
  return null;
}
