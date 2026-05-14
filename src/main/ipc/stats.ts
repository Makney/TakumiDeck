import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import { StatsHeatmapInputSchema, StatsOverviewInputSchema } from '@shared/schemas';
import type { HeatmapRepository } from '../db/repos/heatmap';
import type { StatsRepository } from '../db/repos/stats';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

// IPC-Domain `stats` (Phase-2 Season-12 + Season-13).
//
// Liefert die acht Aggregat-Karten fuer die Stats-Pane (Season 12) und die
// GitHub-Style Aktivitaets-Heatmap (Season 13). Renderer ruft beide Channels
// parallel und merged sie im useStatsStore.

export function registerStatsIpc(deps: {
  stats: StatsRepository;
  heatmap: HeatmapRepository;
  log: Logger;
}): void {
  const { stats, heatmap, log } = deps;

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

  ipcMain.handle(Channels.StatsHeatmap, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = StatsHeatmapInputSchema.parse(payload);
      const result = heatmap.getHeatmap({
        projectId: input.projectId ?? null,
        weeks: input.weeks,
        now: input.asOf ? new Date(input.asOf) : undefined,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'STATS_HEATMAP');
    }
  });

  log.info('[ipc:stats] Channels registriert');
}
