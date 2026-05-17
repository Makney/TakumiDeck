import { describe, it, expect } from 'vitest';
import {
  removeFromIdMap,
  removeFromIdSet,
} from '../../src/renderer/components/spawnTrackingState';

// Regression-Test fuer den UNIQUE-constraint-Bug aus v0.2.0:
// TabContainer hielt zwei lokale Tracking-Container (spawnedIds + initialPrompts),
// die beim handleClose NICHT geleert wurden. Resume via HistoryActionModal /
// HistoryPane (addTab mit gleicher sessionId) liess TerminalTab dann mit
// needsSpawn=true frisch mounten und ein zweites pty:create absetzen → der
// sessions.create-INSERT crashte am UNIQUE-Index sessions.id.
//
// Die Helper kapseln die immutability-konforme Set/Map-Mutation, damit der
// "beim Tab-Close MUSS der Eintrag weg"-Vertrag in einem Pure-Test verifizierbar
// bleibt. Bonus: bei No-op identische Referenz zurueck, damit React den
// State-Update als unveraendert erkennt und keinen Re-Render triggert.

describe('removeFromIdSet', () => {
  it('liefert eine neue Set ohne den gegebenen Eintrag, Original unveraendert', () => {
    const prev = new Set(['sess-A', 'sess-B', 'sess-C']);
    const next = removeFromIdSet(prev, 'sess-B');
    expect(next).not.toBe(prev);
    expect([...next].sort()).toEqual(['sess-A', 'sess-C']);
    expect(prev.has('sess-B')).toBe(true);
  });

  it('liefert dieselbe Set-Referenz, wenn der Eintrag nicht enthalten ist', () => {
    const prev = new Set(['sess-A']);
    const next = removeFromIdSet(prev, 'unbekannt');
    expect(next).toBe(prev);
  });

  it('kann den letzten Eintrag entfernen → leere neue Set', () => {
    const prev = new Set(['sess-A']);
    const next = removeFromIdSet(prev, 'sess-A');
    expect(next).not.toBe(prev);
    expect(next.size).toBe(0);
  });
});

describe('removeFromIdMap', () => {
  it('liefert eine neue Map ohne den gegebenen Key, Original unveraendert', () => {
    const prev = new Map<string, string>([
      ['sess-A', 'Prompt fuer A'],
      ['sess-B', 'Prompt fuer B'],
    ]);
    const next = removeFromIdMap(prev, 'sess-A');
    expect(next).not.toBe(prev);
    expect(next.has('sess-A')).toBe(false);
    expect(next.get('sess-B')).toBe('Prompt fuer B');
    expect(prev.has('sess-A')).toBe(true);
  });

  it('liefert dieselbe Map-Referenz, wenn der Key fehlt', () => {
    const prev = new Map([['sess-A', 'x']]);
    const next = removeFromIdMap(prev, 'missing');
    expect(next).toBe(prev);
  });

  it('funktioniert generisch ueber den Value-Typ', () => {
    const prev = new Map<string, number>([['sess-A', 1], ['sess-B', 2]]);
    const next = removeFromIdMap(prev, 'sess-A');
    expect(next.get('sess-B')).toBe(2);
  });
});

describe('Bugfix-Szenario: Tab-Close → Tab-Resume → kein doppelter Spawn', () => {
  // Simuliert die TabContainer-State-Sequenz aus dem Bug-Report:
  // 1. handleNewSession: spawnedIds bekommt die neue sessionId.
  // 2. handleClose: closeTab + Cleanup beider Tracking-Container.
  // 3. HistoryActionModal-Resume: addTab mit gleicher sessionId → TerminalTab
  //    mountet frisch. needsSpawn = spawnedIds.has(sessionId).
  // Erwartung: nach Schritt 2 ist spawnedIds.has(sessionId) === false, also
  // feuert TerminalTab kein zweites pty:create.
  it('Tab-Close raeumt die sessionId aus spawnedIds, damit Resume kein needsSpawn=true sieht', () => {
    const sessionId = 'sess-resume-target';
    // Schritt 1: NewSession registriert den Spawn-Bedarf.
    let spawnedIds = new Set<string>();
    spawnedIds = new Set([...spawnedIds, sessionId]);
    expect(spawnedIds.has(sessionId)).toBe(true);

    // Schritt 2: handleClose ruft den Cleanup.
    spawnedIds = removeFromIdSet(spawnedIds, sessionId);

    // Schritt 3: Resume → TerminalTab liest needsSpawn ueber das gleiche Set.
    const needsSpawn = spawnedIds.has(sessionId);
    expect(needsSpawn).toBe(false);
  });

  it('Tab-Close raeumt einen evtl. gespeicherten Initial-Prompt mit', () => {
    const sessionId = 'sess-docs-sync';
    let initialPrompts = new Map<string, string>([[sessionId, 'Lies die vier Doku-Files...']]);
    initialPrompts = removeFromIdMap(initialPrompts, sessionId);
    expect(initialPrompts.has(sessionId)).toBe(false);
  });
});
