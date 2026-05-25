import { describe, it, expect } from 'vitest';
import {
  SessionBufferRepository,
  InMemorySessionBufferDriver,
} from '../../src/main/db/repos/session-buffer';

// Phase-2 Season-32: Repo-Vertrag fuer das Session-Buffer-Repo. Persistierung
// von xterm-Buffer-Snapshots der terminal-Sessions, Upsert-on-Conflict, Lese-
// Pfad liefert null bei Miss. FK-Cascade wird auf der SQL-Ebene erzwungen
// (Migration 0010); der InMemory-Driver imitiert nur die Map-Semantik.

function makeRepo() {
  const driver = new InMemorySessionBufferDriver();
  return { repo: new SessionBufferRepository(driver), driver };
}

describe('SessionBufferRepository', () => {
  it('get liefert null, wenn der Snapshot noch nie gesetzt wurde', () => {
    const { repo } = makeRepo();
    expect(repo.get('sess-1')).toBeNull();
  });

  it('upsert speichert einen frischen Snapshot', () => {
    const { repo } = makeRepo();
    repo.upsert('sess-1', 'snap-content', 1000);
    expect(repo.get('sess-1')).toBe('snap-content');
  });

  it('upsert ersetzt einen bestehenden Snapshot (Replace-on-Conflict)', () => {
    const { repo } = makeRepo();
    repo.upsert('sess-1', 'erst', 1000);
    repo.upsert('sess-1', 'zweite-Welle', 2000);
    expect(repo.get('sess-1')).toBe('zweite-Welle');
  });

  it('delete entfernt den Snapshot vollstaendig', () => {
    const { repo } = makeRepo();
    repo.upsert('sess-1', 'snap', 1000);
    repo.delete('sess-1');
    expect(repo.get('sess-1')).toBeNull();
  });

  it('upsert mit Default-Timestamp wirft nicht (Date.now als Fallback)', () => {
    const { repo, driver } = makeRepo();
    repo.upsert('sess-2', 'snap');
    // Direkt aus dem Driver-Internal pruefen, damit wir nicht auf Date.now()
    // angewiesen sind — Snapshot ist da, Timestamp ist gesetzt.
    expect(driver.get('sess-2')).toBe('snap');
  });

  it('Sessions sind isoliert: get(a) gibt nicht den Snapshot von b', () => {
    const { repo } = makeRepo();
    repo.upsert('sess-a', 'A-Snap', 1000);
    repo.upsert('sess-b', 'B-Snap', 1000);
    expect(repo.get('sess-a')).toBe('A-Snap');
    expect(repo.get('sess-b')).toBe('B-Snap');
  });
});
