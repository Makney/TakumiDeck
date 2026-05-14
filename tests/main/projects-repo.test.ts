import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  ProjectRepository,
  InMemoryProjectDriver,
  isPathInsideProject,
  DEFAULT_PROJECT_ID,
} from '../../src/main/db/repos/projects';

function makeRepo() {
  const driver = new InMemoryProjectDriver();
  return { repo: new ProjectRepository(driver), driver };
}

describe('ProjectRepository.insert', () => {
  it('inserted ein neues Projekt und liefert die Row zurück', () => {
    const { repo } = makeRepo();
    const result = repo.insert({
      name: 'TakumiDeck',
      path: 'D:\\Projekte\\TakumiDeck',
      has_git: true,
      added_manually: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('TakumiDeck');
    expect(result.data.path).toBe('D:\\Projekte\\TakumiDeck');
    expect(result.data.has_git).toBe(1);
    expect(result.data.added_manually).toBe(0);
  });

  it('returnt PROJECT_PATH_DUPLICATE bei doppeltem Pfad', () => {
    const { repo } = makeRepo();
    const first = repo.insert({
      name: 'Foo',
      path: '/a',
      has_git: false,
      added_manually: false,
    });
    expect(first.ok).toBe(true);
    const second = repo.insert({
      name: 'FooBar',
      path: '/a',
      has_git: false,
      added_manually: true,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('PROJECT_PATH_DUPLICATE');
  });
});

describe('ProjectRepository.listAll', () => {
  it('sortiert echte Projekte alphabetisch und Default-Project ans Ende', () => {
    const { repo, driver } = makeRepo();
    // Default-Project wie in Sprint 2 manuell einfügen.
    driver.insert({
      id: DEFAULT_PROJECT_ID,
      name: '__default__',
      path: '/ws',
      added_manually: 0,
      has_git: 0,
      next_season_number: 1,
      created_at: 1,
    });
    repo.insert({ name: 'Zeta', path: '/ws/zeta', has_git: false, added_manually: false });
    repo.insert({ name: 'Alpha', path: '/ws/alpha', has_git: false, added_manually: false });
    repo.insert({ name: 'Beta', path: '/ws/beta', has_git: false, added_manually: false });
    const rows = repo.listAll();
    const names = rows.map((r) => r.name);
    expect(names).toEqual(['Alpha', 'Beta', 'Zeta', '__default__']);
  });
});

describe('ProjectRepository.getByPath / getById', () => {
  it('findet Projekte nach Pfad und ID', () => {
    const { repo } = makeRepo();
    const inserted = repo.insert({
      name: 'P',
      path: '/x',
      has_git: false,
      added_manually: false,
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(repo.getByPath('/x')?.id).toBe(inserted.data.id);
    expect(repo.getById(inserted.data.id)?.path).toBe('/x');
    expect(repo.getByPath('/y')).toBeNull();
    expect(repo.getById('ghost')).toBeNull();
  });
});

describe('ProjectRepository.session_count', () => {
  it('zählt Sessions pro Projekt korrekt aus dem Aggregat', () => {
    const { repo, driver } = makeRepo();
    const a = repo.insert({ name: 'A', path: '/a', has_git: false, added_manually: false });
    const b = repo.insert({ name: 'B', path: '/b', has_git: false, added_manually: false });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    driver.seedSession({ id: 's1', cwd: '/a', project_id: a.data.id });
    driver.seedSession({ id: 's2', cwd: '/a', project_id: a.data.id });
    driver.seedSession({ id: 's3', cwd: '/b', project_id: b.data.id });

    const projectsList = repo.listAll();
    const aRow = projectsList.find((p) => p.id === a.data.id);
    const bRow = projectsList.find((p) => p.id === b.data.id);
    expect(aRow?.session_count).toBe(2);
    expect(bRow?.session_count).toBe(1);
  });

  it('liefert 0 für ein Projekt ohne Sessions', () => {
    const { repo } = makeRepo();
    const a = repo.insert({ name: 'A', path: '/a', has_git: false, added_manually: false });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(repo.listAll()[0]?.session_count).toBe(0);
  });
});

describe('isPathInsideProject', () => {
  it('exakter Match', () => {
    expect(isPathInsideProject('/foo/bar', '/foo/bar')).toBe(true);
  });
  it('Sub-Path mit Trennzeichen', () => {
    const project = path.resolve('/foo');
    const cwd = path.resolve('/foo/sub');
    expect(isPathInsideProject(cwd, project)).toBe(true);
  });
  it('Präfix-Trick wird abgelehnt: /foo darf NICHT /foobar matchen', () => {
    const project = path.resolve('/foo');
    const cwd = path.resolve('/foobar');
    expect(isPathInsideProject(cwd, project)).toBe(false);
  });
  it('Nicht verwandte Pfade matchen nicht', () => {
    expect(isPathInsideProject('/a', '/b')).toBe(false);
  });
});

describe('ProjectRepository.remapSessionsByCwdPrefix', () => {
  it('hängt Sessions vom Default-Project auf das passende echte Projekt um', () => {
    const { repo, driver } = makeRepo();
    const wsRoot = path.resolve('/ws');
    const proj = path.resolve('/ws/proj');

    driver.insert({
      id: DEFAULT_PROJECT_ID,
      name: '__default__',
      path: wsRoot,
      added_manually: 0,
      has_git: 0,
      next_season_number: 1,
      created_at: 1,
    });
    const real = repo.insert({
      name: 'proj',
      path: proj,
      has_git: false,
      added_manually: false,
    });
    expect(real.ok).toBe(true);
    if (!real.ok) return;

    driver.seedSession({
      id: 'sess-inside',
      cwd: path.resolve('/ws/proj/src'),
      project_id: DEFAULT_PROJECT_ID,
    });
    driver.seedSession({
      id: 'sess-outside',
      cwd: path.resolve('/elsewhere'),
      project_id: DEFAULT_PROJECT_ID,
    });

    const moved = repo.remapSessionsByCwdPrefix(DEFAULT_PROJECT_ID, repo.listAll());
    expect(moved).toBe(1);
    expect(driver.sessions.get('sess-inside')?.project_id).toBe(real.data.id);
    expect(driver.sessions.get('sess-outside')?.project_id).toBe(DEFAULT_PROJECT_ID);
  });

  it('läuft sauber leer, wenn keine Sessions am Default hängen', () => {
    const { repo, driver } = makeRepo();
    driver.insert({
      id: DEFAULT_PROJECT_ID,
      name: '__default__',
      path: '/ws',
      added_manually: 0,
      has_git: 0,
      next_season_number: 1,
      created_at: 1,
    });
    const moved = repo.remapSessionsByCwdPrefix(DEFAULT_PROJECT_ID, repo.listAll());
    expect(moved).toBe(0);
  });

  it('bevorzugt das spezifischere (tiefere) Projekt nicht — erstes Match gewinnt', () => {
    // Edge-Case: zwei Projekte, eines liegt im anderen (Architektur 6.1 verbietet das
    // de-facto, weil der Scanner bei CLAUDE.md stoppt — aber nur via UI ist es theoretisch
    // möglich, ein Projekt manuell als Sub-Ordner zu adden). Die Repo-Schicht sollte
    // deterministisch das erste Match nehmen, ohne durchzudrehen.
    const { repo, driver } = makeRepo();
    driver.insert({
      id: DEFAULT_PROJECT_ID,
      name: '__default__',
      path: '/ws',
      added_manually: 0,
      has_git: 0,
      next_season_number: 1,
      created_at: 1,
    });
    repo.insert({ name: 'outer', path: path.resolve('/ws/outer'), has_git: false, added_manually: false });
    repo.insert({ name: 'inner', path: path.resolve('/ws/outer/inner'), has_git: false, added_manually: false });
    driver.seedSession({
      id: 's',
      cwd: path.resolve('/ws/outer/inner/src'),
      project_id: DEFAULT_PROJECT_ID,
    });
    const moved = repo.remapSessionsByCwdPrefix(DEFAULT_PROJECT_ID, repo.listAll());
    expect(moved).toBe(1);
    // Das neu zugewiesene project_id MUSS eins der beiden Projects sein, nicht der Default.
    const newProjectId = driver.sessions.get('s')?.project_id;
    expect(newProjectId).not.toBe(DEFAULT_PROJECT_ID);
  });
});

// Phase-2 Season-8: Projekt aus der Liste entfernen. Sessions werden auf den
// Default-Bucket umgehängt, die projects-Row anschließend gelöscht. Tests decken
// die Gegenrichtung zum Sprint-4-Remap und die Default-Bucket-Immutability ab.
describe('ProjectRepository.removeProject', () => {
  it('hängt Sessions auf den Default-Bucket um und löscht die projects-Row', () => {
    const { repo, driver } = makeRepo();
    driver.insert({
      id: DEFAULT_PROJECT_ID,
      name: '__default__',
      path: '/ws',
      added_manually: 0,
      has_git: 0,
      next_season_number: 1,
      created_at: 1,
    });
    const real = repo.insert({
      name: 'proj',
      path: '/ws/proj',
      has_git: false,
      added_manually: false,
    });
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    driver.seedSession({ id: 'a', cwd: '/ws/proj', project_id: real.data.id });
    driver.seedSession({ id: 'b', cwd: '/ws/proj/sub', project_id: real.data.id });

    const result = repo.removeProject(real.data.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sessionsRemapped).toBe(2);
    expect(repo.getById(real.data.id)).toBeNull();
    expect(driver.sessions.get('a')?.project_id).toBe(DEFAULT_PROJECT_ID);
    expect(driver.sessions.get('b')?.project_id).toBe(DEFAULT_PROJECT_ID);
  });

  it('lehnt das Default-Project ab (PROJECT_DEFAULT_IMMUTABLE)', () => {
    const { repo, driver } = makeRepo();
    driver.insert({
      id: DEFAULT_PROJECT_ID,
      name: '__default__',
      path: '/ws',
      added_manually: 0,
      has_git: 0,
      next_season_number: 1,
      created_at: 1,
    });
    const result = repo.removeProject(DEFAULT_PROJECT_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PROJECT_DEFAULT_IMMUTABLE');
    // Default-Project liegt nach dem Reject unverändert im Repo.
    expect(repo.getById(DEFAULT_PROJECT_ID)).not.toBeNull();
  });

  it('lehnt unbekannte Project-IDs ab (PROJECT_NOT_FOUND)', () => {
    const { repo } = makeRepo();
    const result = repo.removeProject('ghost-id');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PROJECT_NOT_FOUND');
  });

  it('läuft sauber durch, wenn das Projekt keine Sessions hat', () => {
    const { repo } = makeRepo();
    const real = repo.insert({
      name: 'leer',
      path: '/leer',
      has_git: false,
      added_manually: false,
    });
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    const result = repo.removeProject(real.data.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sessionsRemapped).toBe(0);
    expect(repo.getById(real.data.id)).toBeNull();
  });
});
