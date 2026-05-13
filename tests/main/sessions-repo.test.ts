import { describe, it, expect } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';

function makeRepo() {
  const driver = new InMemorySessionDriver();
  return { repo: new SessionRepository(driver), driver };
}

const baseInput = {
  project_id: 'proj-1',
  title: 'Test-Session',
  type: 'feature' as const,
  model: 'claude-sonnet-4-6',
  cwd: 'C:\\Test',
};

describe('SessionRepository.create', () => {
  it('generiert UUID, wenn keine id mitgegeben wurde', () => {
    const { repo } = makeRepo();
    const row = repo.create(baseInput);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('verwendet die übergebene id 1:1', () => {
    const { repo } = makeRepo();
    const row = repo.create({ ...baseInput, id: 'fixed-id' });
    expect(row.id).toBe('fixed-id');
  });

  it('setzt Sprint-2-Defaults: status=running, season_number=null, notes_md leer', () => {
    const { repo } = makeRepo();
    const row = repo.create(baseInput);
    expect(row.status).toBe('running');
    expect(row.season_number).toBeNull();
    expect(row.notes_md).toBe('');
    expect(row.ended_at).toBeNull();
    expect(row.worktree_branch).toBeNull();
    expect(row.current_model).toBe(baseInput.model);
    expect(row.started_at).toBeGreaterThan(0);
  });

  it('persistiert die Row, sodass findById sie zurückliefert', () => {
    const { repo } = makeRepo();
    const created = repo.create({ ...baseInput, id: 'sess-1' });
    const found = repo.findById('sess-1');
    expect(found).toEqual(created);
  });
});

describe('SessionRepository.update', () => {
  it('updated erlaubte Felder und liefert die neue Row zurück', () => {
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 'sess-2' });
    const updated = repo.update('sess-2', {
      notes_md: 'Erste Notiz',
      status: 'completed',
      ended_at: 1234,
    });
    expect(updated?.notes_md).toBe('Erste Notiz');
    expect(updated?.status).toBe('completed');
    expect(updated?.ended_at).toBe(1234);
  });

  it('returnt null, wenn die Session nicht existiert', () => {
    const { repo } = makeRepo();
    expect(repo.update('ghost', { notes_md: 'x' })).toBeNull();
  });

  it('ignoriert nicht-whitelisted Felder', () => {
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 'sess-3' });
    // id und project_id stehen nicht auf der Patchable-Whitelist und müssen ignoriert werden,
    // damit nicht versehentlich FKs / Identitäten modifiziert werden. Wir casten den Patch
    // bewusst auf `never`, weil die Whitelist ja gerade testet, dass die Repo-Schicht
    // robust gegen Schlüssel ist, die das TypeScript-Typsystem schon nicht zulassen würde.
    const malicious = {
      id: 'gehackt',
      project_id: 'gehackt-proj',
      notes_md: 'Notiz',
    } as unknown as Parameters<typeof repo.update>[1];
    const updated = repo.update('sess-3', malicious);
    expect(updated?.id).toBe('sess-3');
    expect(updated?.project_id).toBe('proj-1');
    expect(updated?.notes_md).toBe('Notiz');
  });

  it('leerer Patch ist No-op und gibt aktuelle Row zurück', () => {
    const { repo } = makeRepo();
    const original = repo.create({ ...baseInput, id: 'sess-4' });
    const result = repo.update('sess-4', {});
    expect(result).toEqual(original);
  });

  it('undefined-Werte im Patch werden ignoriert', () => {
    const { repo } = makeRepo();
    repo.create({ ...baseInput, id: 'sess-5' });
    repo.update('sess-5', { notes_md: 'erste' });
    const updated = repo.update('sess-5', {
      notes_md: undefined,
      status: 'completed',
    });
    expect(updated?.notes_md).toBe('erste');
    expect(updated?.status).toBe('completed');
  });
});

describe('SessionRepository.findLastCompletedFeatureSession', () => {
  it('liefert die juengste completed Feature-Session des Projekts', () => {
    const { repo, driver } = makeRepo();
    const older = repo.create({
      ...baseInput,
      id: 'older',
      title: 'Phase 2 Season 1: Erste Season',
      season_number: 1,
    });
    repo.create({
      ...baseInput,
      id: 'newer',
      title: 'Phase 2 Season 2: Spaeter aber zeitlich davor',
      season_number: 2,
    });
    // Beide auf completed setzen, mit gestaffeltem started_at.
    driver.patch('older', { status: 'completed' });
    driver.patch('newer', { status: 'completed' });
    // Manuell den started_at-Wert manipulieren, damit "newer" wirklich juenger ist
    // als "older" (ohne realen Timing-Abstand).
    const rowOlder = repo.findById('older')!;
    const rowNewer = repo.findById('newer')!;
    driver['rows'].set('older', { ...rowOlder, started_at: 100 });
    driver['rows'].set('newer', { ...rowNewer, started_at: 200 });

    const result = repo.findLastCompletedFeatureSession('proj-1');
    expect(result?.id).toBe('newer');
    // Sanity-Check: aelterer Eintrag existiert weiterhin und ist NICHT der Treffer.
    expect(repo.findById(older.id)).not.toBeNull();
  });

  it('ignoriert Sessions anderer Projekte', () => {
    const { repo, driver } = makeRepo();
    repo.create({
      ...baseInput,
      id: 'fremd',
      project_id: 'other-proj',
      title: 'Fremde Feature-Session',
    });
    driver.patch('fremd', { status: 'completed' });
    expect(repo.findLastCompletedFeatureSession('proj-1')).toBeNull();
  });

  it('ignoriert non-feature-Typen (bug/review/docs-sync)', () => {
    const { repo, driver } = makeRepo();
    repo.create({ ...baseInput, id: 'bug', type: 'bug' });
    driver.patch('bug', { status: 'completed' });
    expect(repo.findLastCompletedFeatureSession('proj-1')).toBeNull();
  });

  it('ignoriert nicht-completed Status (running/interrupted/archived)', () => {
    const { repo, driver } = makeRepo();
    repo.create({ ...baseInput, id: 'lauft' });
    repo.create({ ...baseInput, id: 'abbruch' });
    driver.patch('abbruch', { status: 'interrupted' });
    expect(repo.findLastCompletedFeatureSession('proj-1')).toBeNull();
  });

  it('liefert null, wenn das Projekt keine Sessions hat', () => {
    const { repo } = makeRepo();
    expect(repo.findLastCompletedFeatureSession('proj-1')).toBeNull();
  });
});
