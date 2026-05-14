import { describe, it, expect } from 'vitest';
import {
  ProjectRepository,
  InMemoryProjectDriver,
} from '../../src/main/db/repos/projects';

// Phase-2 Season-11 — Counter ist jetzt dynamisch aus sessions.season_number
// abgeleitet (MAX+1). allocateSeasonNumber liest, schreibt aber nicht mehr —
// die "Verwendung" einer Nummer passiert erst beim Session-Insert (pty:create)
// bzw. UPDATE (assignSeasonNumber im SessionRepository). Damit zieht der
// Counter auch dann mit, wenn Seasons per Templates-Send statt neuer Feature-
// Session laufen — der Bug, der die Vorgaenger-Implementierung mit der
// projects.next_season_number-Spalte zerschossen hat.

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
    // next_season_number-Spalte wird seit Season-11 nicht mehr ausgelesen,
    // bleibt im Insert-Schema aber als Default 1 (Backwards-Compat).
    next_season_number: 1,
    created_at: 1,
  });
}

describe('ProjectRepository.allocateSeasonNumber', () => {
  it('returnt 1 bei leerem Projekt ohne Sessions', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    expect(repo.allocateSeasonNumber('proj')).toBe(1);
    // Mehrfach-Aufrufe ohne dazwischenliegende Schreibaktion bleiben bei 1 —
    // die Spalte projects.next_season_number wird NICHT mehr hochgezaehlt.
    expect(repo.allocateSeasonNumber('proj')).toBe(1);
    expect(driver.findById('proj')?.next_season_number).toBe(1);
  });

  it('returnt MAX(sessions.season_number)+1 fuer das Projekt', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    driver.seedSession({ id: 's1', cwd: '/x', project_id: 'proj', season_number: 1 });
    driver.seedSession({ id: 's2', cwd: '/x', project_id: 'proj', season_number: 2 });
    driver.seedSession({ id: 's3', cwd: '/x', project_id: 'proj', season_number: 5 });
    // MAX = 5, naechste Nummer = 6 — Luecken (3, 4) werden NICHT gefuellt.
    expect(repo.allocateSeasonNumber('proj')).toBe(6);
    expect(driver.findById('proj')?.next_season_number).toBe(6);
  });

  it('ignoriert Sessions ohne season_number (Bug/Custom/Resume) und Sessions anderer Projekte', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'a');
    seedProject(driver, 'b');
    // a: zwei Feature-Sessions + eine Bug-Session ohne Season-Nummer.
    driver.seedSession({ id: 'a1', cwd: '/x', project_id: 'a', season_number: 1 });
    driver.seedSession({ id: 'a2', cwd: '/x', project_id: 'a', season_number: 2 });
    driver.seedSession({ id: 'a-bug', cwd: '/x', project_id: 'a', season_number: null });
    // b: groessere Nummer, darf a nicht beeinflussen.
    driver.seedSession({ id: 'b1', cwd: '/y', project_id: 'b', season_number: 99 });
    expect(repo.allocateSeasonNumber('a')).toBe(3);
    expect(repo.allocateSeasonNumber('b')).toBe(100);
  });

  it('returnt null, wenn das Projekt nicht existiert', () => {
    const { repo } = makeRepo();
    expect(repo.allocateSeasonNumber('ghost')).toBeNull();
  });

  it('haelt den Counter konsistent, wenn der Renderer mehrfach liest ohne dass eine Nummer verbraucht wird (Modal-Open + Send)', () => {
    // Praxisszenario: User oeffnet das NewSessionModal (zeigt nextSeasonPreview),
    // schliesst es wieder, oeffnet es nochmal. Beide Reads sollen dieselbe
    // Nummer zeigen — und nicht versehentlich zwei verschiedene wie in der
    // alten Spalten-Implementierung.
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    driver.seedSession({ id: 's1', cwd: '/x', project_id: 'proj', season_number: 10 });
    const first = repo.allocateSeasonNumber('proj');
    const second = repo.allocateSeasonNumber('proj');
    const third = repo.allocateSeasonNumber('proj');
    expect(first).toBe(11);
    expect(second).toBe(11);
    expect(third).toBe(11);
  });
});

describe('ProjectRow.next_season_number (dynamisch ueber sessions)', () => {
  it('listAll/findById zeigen MAX+1 ueber sessions.season_number', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    driver.seedSession({ id: 's1', cwd: '/x', project_id: 'proj', season_number: 7 });
    expect(repo.getById('proj')?.next_season_number).toBe(8);
    expect(repo.listAll().find((p) => p.id === 'proj')?.next_season_number).toBe(8);
  });

  it('zeigt 1, wenn das Projekt noch keine Feature-Sessions hat', () => {
    const { repo, driver } = makeRepo();
    seedProject(driver, 'proj');
    // Bug-Session ohne season_number existiert, aber zaehlt nicht.
    driver.seedSession({ id: 'bug', cwd: '/x', project_id: 'proj', season_number: null });
    expect(repo.getById('proj')?.next_season_number).toBe(1);
  });
});
