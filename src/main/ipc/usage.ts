import { ipcMain, type WebContents } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  UsageWindowInputSchema,
  UsageContextInputSchema,
} from '@shared/schemas';
import type { UsageHeatmapResult, UsageUpdateEvent } from '@shared/types';
import type { UsageRepository } from '../db/repos/usage';
import type { MessageRepository } from '../db/repos/messages';
import type { SessionRepository } from '../db/repos/sessions';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { resolveWindow, resolveContext } from '../usage/resolver';
import { assertFromMainWindow } from './sender-guard';

// IPC-Domain `usage` (Sprint 5).
//
// usage:window  — eine limit_bar berechnen (5h, weekly_all, weekly_design, ...).
//                 Renderer ruft pro Bar einmal; bei usage:update-Push ruft er nach.
// usage:context — Per-Session-Kontext-Bar.
// usage:heatmap — Phase-2-Stub.
//
// Bereich-4-Review (W-4): der usage:update-Push aus dem JSONL-Watcher läuft
// jetzt über `createUsagePusher()` statt direkt aus main.ts — damit bleibt
// jeder Channel-Verkehr (handle + send) im ipc/-Layer (Architektur 3).

export function registerUsageIpc(deps: {
  usage: UsageRepository;
  messages: MessageRepository;
  sessions: SessionRepository;
  settings: SettingsStore;
  log: Logger;
}): void {
  const { usage, messages, sessions, settings, log } = deps;

  ipcMain.handle(Channels.UsageWindow, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = UsageWindowInputSchema.parse(payload);
      const cfg = settings.read();
      const bar = cfg.limit_bars.find((b) => b.id === input.barId);
      if (!bar) {
        return err(`Bar ${input.barId} ist in settings.limit_bars nicht definiert`, 'USAGE_BAR_UNKNOWN');
      }
      const result = resolveWindow(bar, {
        usage,
        messages,
        settings: cfg,
        now: input.asOf ? () => input.asOf as number : undefined,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'USAGE_WINDOW');
    }
  });

  ipcMain.handle(Channels.UsageContext, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = UsageContextInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      const result = resolveContext(input.sessionId, {
        messages,
        settings: settings.read(),
        sessionModel: session.current_model,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'USAGE_CONTEXT');
    }
  });

  ipcMain.handle(Channels.UsageHeatmap, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    // Sprint-5-Stub: der Channel ist reserviert, aber Heatmap kommt erst mit Phase 2
    // (Architektur 8 listet das explizit unter Phase-2-Erweiterungen).
    const result: UsageHeatmapResult = {
      stub: true,
      message: 'Heatmap kommt mit Phase 2 (siehe Architektur Kapitel 8)',
    };
    return ok(result);
  });

  log.info('[ipc:usage] Channels registriert');
}

// Bereich-4-Review (W-4): Push-Channel `usage:update` (Watcher → Renderer) lebt
// im ipc/-Layer statt in main.ts. Aufruf: createUsagePusher(getWebContents)
// liefert eine Funktion, die der JsonlWatcher als `push`-Callback bekommt.
export function createUsagePusher(
  getWebContents: () => WebContents | null,
): (event: UsageUpdateEvent) => void {
  return (event) => {
    getWebContents()?.send(Channels.UsageUpdate, event);
  };
}
