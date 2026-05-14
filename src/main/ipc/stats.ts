import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import {
  StatsHeatmapInputSchema,
  StatsModelsInputSchema,
  StatsOverviewInputSchema,
} from '@shared/schemas';
import type { HeatmapRepository } from '../db/repos/heatmap';
import type { ModelStatsRepository } from '../db/repos/model-stats';
import type { StatsRepository } from '../db/repos/stats';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

// IPC-Domain `stats` (Phase-2 Season-12 + Season-13 + Season-14).
//
// Liefert die acht Aggregat-Karten fuer die Stats-Pane (Season 12), die
// GitHub-Style Aktivitaets-Heatmap (Season 13) und die Per-Modell-
// Aufschluesselung (Season 14). Renderer ruft die drei Channels separat —
// jeder Tab pullt nur seinen Endpoint, damit der Cards-Tick die schwerere
// GROUP-BY-Models-Query nicht mit ausloest.

export function registerStatsIpc(deps: {
  stats: StatsRepository;
  heatmap: HeatmapRepository;
  models: ModelStatsRepository;
  log: Logger;
}): void {
  const { stats, heatmap, models, log } = deps;

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

  ipcMain.handle(Channels.StatsModels, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = StatsModelsInputSchema.parse(payload);
      const result = models.getModelsBreakdown({
        projectId: input.projectId ?? null,
        range: input.range,
        now: input.asOf ? new Date(input.asOf) : undefined,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'STATS_MODELS');
    }
  });

  log.info('[ipc:stats] Channels registriert');
}
