import { describe, it, expect } from 'vitest';
import {
  ProjectRepository,
  InMemoryProjectDriver,
} from '../../src/main/db/repos/projects';

// Sprint 6 (Q6 Variante B): Counter wird atomar im Main alloziert.
// Tests fahren gegen den InMemory-Driver — die SQL-Transaction-Variante in
// SqliteProjectDriver bleibt durch das Interface gedeckt, der eigentliche
// race-frei-Beweis kommt durch better-sqlite3's synchrone Transaction-API.

function makeRepo() {
  const driver = new InMemoryProjectDriver();
  return { repo: new ProjectRepository(driver), driver };
}

function seedProject(driver: InMemoryProjectDriver, id: string) {
  driver.insert({
    id,
    name: id,
    path: `/${id}`,
    added_manually: 0,
    has_git: 0,
    next_season_number: 1,
    created_at: 1,
  });
}

describe('ProjectRepository.allocateSeasonNumber', () => {
  it('liefert beim ersten Allocate die Default-Nummer 1 und incrementiert auf 2', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    const first = repo.allocateSeasonNumber('proj');
    expect(first).toBe(1);
    expect(driver.findById('proj')?.next_season_number).toBe(2);
  });

  it('vergibt aufeinanderfolgende Nummern bei mehreren Calls', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    expect(repo.allocateSeasonNumber('proj')).toBe(1);
    expect(repo.allocateSeasonNumber('proj')).toBe(2);
    expect(repo.allocateSeasonNumber('proj')).toBe(3);
    expect(driver.findById('proj')?.next_season_number).toBe(4);
  });

  it('returnt null, wenn das Projekt nicht existiert', () => {
    const { repo } = makeRepo();
    expect(repo.allocateSeasonNumber('ghost')).toBeNull();
  });

  it('hält die Counter pro Projekt getrennt', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'a');
    seedProject(driver, 'b');
    expect(repo.allocateSeasonNumber('a')).toBe(1);
    expect(repo.allocateSeasonNumber('a')).toBe(2);
    expect(repo.allocateSeasonNumber('b')).toBe(1);
    expect(driver.findById('a')?.next_season_number).toBe(3);
    expect(driver.findById('b')?.next_season_number).toBe(2);
  });

  it('akzeptiert Lücken: ein nicht-konsumiertes Allocate (z.B. bei Spawn-Fehler) bleibt verbraucht', () => {
    // Architektur 6.6: "Lücken bei Abbruch akzeptiert". Die Repo-Schicht selbst
    // hat keinen Rollback — sie soll ihn bewusst NICHT haben, damit ein Spawn-Fehler
    // nicht durch komplizierten Rollback-Code kompensiert werden muss.
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    const allocated = repo.allocateSeasonNumber('proj');
    expect(allocated).toBe(1);
    // Caller ruft sessions.create() nie auf (z.B. PTY-Spawn fehlgeschlagen).
    // Beim nächsten Versuch bekommt die Session Nummer 2 — Nummer 1 fehlt in der
    // DB. Verlauf-Panel zeigt einfach #2, #3, ... ohne #1.
    expect(repo.allocateSeasonNumber('proj')).toBe(2);
  });
});
