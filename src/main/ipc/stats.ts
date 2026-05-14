import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import { StatsOverviewInputSchema } from '@shared/schemas';
import type { StatsRepository } from '../db/repos/stats';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

// IPC-Domain `stats` (Phase-2 Season-12).
//
// Liefert die acht Aggregat-Karten fuer die Stats-Pane. Renderer ruft beim
// Projekt-Wechsel, beim Scope/Range-Toggle und nach jedem usage:update-Push
// (debounced) — der Main aggregiert direkt aus messages + sessions.

export function registerStatsIpc(deps: {
  stats: StatsRepository;
  log: Logger;
}): void {
  const { stats, log } = deps;

  ipcMain.handle(Channels.StatsOverview, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = StatsOverviewInputSchema.parse(payload);
      const result = stats.getOverview({
        projectId: input.projectId ?? null,
        range: input.range,
        now: input.asOf ? new Date(input.asOf) : undefined,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'STATS_OVERVIEW');
    }
  });

  log.info('[ipc:stats] Channels registriert');
}
