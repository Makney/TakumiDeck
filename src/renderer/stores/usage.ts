import { create } from 'zustand';
import type { UsageContextResult, UsageWindowResult } from '@shared/types';

// useUsageStore (Sprint 5).
//
// Vierter Domain-Store laut Architektur 2 (`useUsageStore`). Hält den letzten
// IPC-Stand der Plannutzung-Bars (window) und der Per-Session-Kontext-Bar (context).
// Live-Updates kommen über den `usage:update`-Push: 'global' triggert refreshAllBars,
// 'context' triggert refreshContext für die betroffene Session.
//
// Konvention: das Verbinden mit dem Push-Channel macht der Renderer-Bootstrap (App.tsx)
// einmalig mit ref-guard — der Store selbst kennt nur die Aktionen, nicht das IPC-Setup.

interface UsageStoreState {
  // Map<barId, UsageWindowResult>. Initial leer; Renderer rendert Skeleton-Bars,
  // bis die ersten IPC-Antworten reinkommen.
  bars: Record<string, UsageWindowResult>;
  // Map<sessionId, UsageContextResult>. Bekommen wir nur für Sessions, die der
  // Renderer aktiv abruft (= aktiver Tab) — kein Bulk-Load.
  contextBySession: Record<string, UsageContextResult>;
  loading: boolean;
  error: string | null;

  refreshBars: (barIds: string[]) => Promise<void>;
  refreshContext: (sessionId: string) => Promise<void>;
  // Beim Tab-Close aufgerufen: entfernt den Per-Session-Kontext-Eintrag, damit
  // contextBySession nicht über die App-Lebenszeit mit toten Sessions zuwächst.
  pruneContext: (sessionId: string) => void;
  reset: () => void;
}

// Per-Session-Seq-Guard für refreshContext: stale Antworten (Tab inzwischen
// geschlossen oder neuere Anfrage gewonnen) dürfen den Kontext nicht (wieder)
// schreiben. Analog zum gitStatus-Store. pruneContext löscht den Seq-Eintrag und
// invalidiert damit zugleich einen evtl. noch laufenden refreshContext.
const contextSeqBySession = new Map<string, number>();

export const useUsageStore = create<UsageStoreState>((set) => ({
  bars: {},
  contextBySession: {},
  loading: false,
  error: null,

  refreshBars: async (barIds: string[]) => {
    if (barIds.length === 0) {
      // Empty-Refresh räumt auch ein etwaiges altes error-Feld auf — sonst bliebe
      // ein Fehler aus einem vorherigen Refresh hängen, obwohl der Caller bewusst
      // mit leerer Liste resettet.
      set({ loading: false, error: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const results = await Promise.all(
        barIds.map(async (barId) => ({
          barId,
          result: await window.api.usage.window({ barId }),
        })),
      );
      const next: Record<string, UsageWindowResult> = {};
      let firstError: string | null = null;
      for (const { barId, result } of results) {
        if (result.ok) {
          next[barId] = result.data;
        } else if (!firstError) {
          firstError = `${barId}: ${result.error}`;
        }
      }
      set((s) => ({
        bars: { ...s.bars, ...next },
        loading: false,
        error: firstError,
      }));
    } catch (e) {
      // IPC selbst hat geworfen (statt das übliche Result-Envelope zu liefern).
      // Ohne dieses Catch bleibt loading=true hängen und die UI zeigt dauerhaft
      // den Skeleton-State, plus eine unhandled rejection im Renderer.
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  refreshContext: async (sessionId: string) => {
    // Seq vor dem Await ziehen; ein verspäteter Write (Tab schon geschlossen oder
    // neuere Anfrage gewonnen) wird danach als stale erkannt und verworfen.
    const mySeq = (contextSeqBySession.get(sessionId) ?? 0) + 1;
    contextSeqBySession.set(sessionId, mySeq);
    try {
      const result = await window.api.usage.context({ sessionId });
      if (contextSeqBySession.get(sessionId) !== mySeq) return; // stale — überholt oder gepruned
      if (result.ok) {
        set((s) => ({
          contextBySession: { ...s.contextBySession, [sessionId]: result.data },
        }));
      } else {
        // Fehler beim Per-Session-Lookup loggen wir in console — kein globales error-Feld
        // setzen, sonst überschreibt eine Session-Race den Bar-Fehler.
        console.warn(`[useUsageStore] refreshContext ${sessionId}: ${result.error}`);
      }
    } catch (e) {
      if (contextSeqBySession.get(sessionId) !== mySeq) return; // stale
      // IPC-Reject (statt Result-Envelope) — analog refreshBars: still loggen,
      // damit keine unhandled rejection im Renderer entsteht.
      console.warn(`[useUsageStore] refreshContext ${sessionId} threw:`, e);
    }
  },

  pruneContext: (sessionId: string) => {
    // Seq löschen invalidiert einen evtl. laufenden refreshContext (dessen Write
    // greift dann oben ins stale-return). Danach den Kontext-Eintrag entfernen.
    contextSeqBySession.delete(sessionId);
    set((s) => {
      if (!(sessionId in s.contextBySession)) return s;
      const { [sessionId]: _drop, ...rest } = s.contextBySession;
      return { contextBySession: rest };
    });
  },

  reset: () => {
    contextSeqBySession.clear();
    set({ bars: {}, contextBySession: {}, loading: false, error: null });
  },
}));
