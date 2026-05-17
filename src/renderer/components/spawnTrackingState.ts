// Pure-Helper fuer das Spawn-Tracking-State-Management in TabContainer.
//
// Hintergrund (Bugfix v0.2.0): TabContainer haelt zwei lokale State-Container,
// die pro Tab-Lebensdauer befuellt werden:
//   - spawnedIds: Set<string> markiert Tabs, die ein frisches pty:create
//     brauchen (NewSessionModal-Pfad). Resume aus dem Verlauf darf das NICHT
//     setzen, weil die DB-Row schon existiert.
//   - initialPrompts: Map<string,string> haelt One-Shot-Prompts fuer Docs-
//     Sync-Sessions, bis TerminalTab sie nach dem Warmup gepastet hat.
//
// Beide wurden beim handleClose nicht aufgeraeumt → die Eintraege ueberlebten
// das Schliessen des Tabs. Hat der User die Session danach via HistoryAction-
// Modal oder HistoryPane resumed, kam der Tab mit derselben sessionId zurueck
// in den Store, TerminalTab mountete frisch und sah needsSpawn=true → zweites
// pty:create mit existierender id → "UNIQUE constraint failed: sessions.id".
//
// Helper sind immutability-konform: bei Treffer neue Container-Instanz mit dem
// Eintrag entfernt; bei No-op identische Referenz zurueck, damit React den
// State-Update als unveraendert erkennt und Re-Render skippt.

export function removeFromIdSet(set: Set<string>, id: string): Set<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}

export function removeFromIdMap<T>(map: Map<string, T>, id: string): Map<string, T> {
  if (!map.has(id)) return map;
  const next = new Map(map);
  next.delete(id);
  return next;
}
