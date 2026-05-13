import { describe, it, expect } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';
import type { SessionStatus, SessionType } from '../../src/shared/types';

// Sprint 6: Verlauf-Panel-Filter-Logik. Tests gegen InMemory-Driver — der
// SQL-Driver baut dieselbe Filter-Klausel als WHERE-Bedingung in einer
// vorbereiteten Statement, abgedeckt durch das Driver-Interface.

function makeRepo() {
  const driver = new InMemorySessionDriver();
  return { repo: new SessionRepository(driver), driver };
}

interface SeedInput {
  id: string;
  projectId: string;
  title: string;
  type: SessionType;
  status: SessionStatus;
  startedAt: number;
  seasonNumber?: number | null;
  notesMd?: string;
  endedAt?: number | null;
}

function seed(driver: InMemorySessionDriver, input: SeedInput) {
  driver.insert({
    id: input.id,
    project_id: input.projectId,
    title: input.title,
    type: input.type,
    season_number: input.seasonNumber ?? null,
    status: input.status,
    current_model: 'claude-sonnet-4-6',
    worktree_branch: null,
    notes_md: input.notesMd ?? '',
    cwd: 'C:\\test',
    started_at: input.startedAt,
    ended_at: input.endedAt ?? null,
    // Sprint-6-Hotfix: Tests setzen das Feld auf null — listHistory liest es nicht,
    // also reicht der Default. Spezifische Tests für claude_session_id stehen in
    // tests/main/claude-session-id.test.ts.
    claude_session_id: null,
    // Phase-2 Season-5: custom_type_label nur fuer 'custom'-Sessions relevant;
    // bestehende Filter-Tests fahren mit null.
    custom_type_label: null,
  });
}

describe('SessionRepository.listHistoryForProject', () => {
  it('liefert nur Sessions des angegebenen Projekts', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'a1', projectId: 'p1', title: 'A', type: 'feature', status: 'completed', startedAt: 1000 });
    seed(driver, { id: 'a2', projectId: 'p2', title: 'B', type: 'feature', status: 'completed', startedAt: 2000 });
    const result = repo.listHistoryForProject({ projectId: 'p1' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a1');
  });

  it('sortiert jüngste zuerst (started_at DESC)', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'old', projectId: 'p1', title: 'Old', type: 'feature', status: 'completed', startedAt: 1000 });
    seed(driver, { id: 'new', projectId: 'p1', title: 'New', type: 'feature', status: 'completed', startedAt: 5000 });
    seed(driver, { id: 'mid', projectId: 'p1', title: 'Mid', type: 'feature', status: 'completed', startedAt: 3000 });
    const result = repo.listHistoryForProject({ projectId: 'p1' });
    expect(result.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('Typ-Filter: nur passende type-Werte', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'f1', projectId: 'p1', title: 'F', type: 'feature', status: 'completed', startedAt: 1000 });
    seed(driver, { id: 'b1', projectId: 'p1', title: 'B', type: 'bug', status: 'completed', startedAt: 2000 });
    seed(driver, { id: 'r1', projectId: 'p1', title: 'R', type: 'review', status: 'completed', startedAt: 3000 });
    const onlyBugs = repo.listHistoryForProject({ projectId: 'p1', types: ['bug'] });
    expect(onlyBugs.map((r) => r.id)).toEqual(['b1']);
    const featureAndReview = repo.listHistoryForProject({
      projectId: 'p1',
      types: ['feature', 'review'],
    });
    expect(featureAndReview.map((r) => r.id).sort()).toEqual(['f1', 'r1']);
  });

  it('leere Typ-Liste = kein Filter', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 's1', projectId: 'p1', title: 'A', type: 'feature', status: 'completed', startedAt: 1000 });
    seed(driver, { id: 's2', projectId: 'p1', title: 'B', type: 'bug', status: 'completed', startedAt: 2000 });
    const result = repo.listHistoryForProject({ projectId: 'p1', types: [] });
    expect(result).toHaveLength(2);
  });

  it('Status-Filter wirkt unabhängig', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'ok', projectId: 'p1', title: 'OK', type: 'feature', status: 'completed', startedAt: 1 });
    seed(driver, { id: 'er', projectId: 'p1', title: 'ER', type: 'feature', status: 'error', startedAt: 2 });
    const onlyError = repo.listHistoryForProject({ projectId: 'p1', statuses: ['error'] });
    expect(onlyError.map((r) => r.id)).toEqual(['er']);
  });

  it('Volltext-Filter: case-insensitive, Substring im Titel', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'x1', projectId: 'p1', title: 'Sprint-3 Tabs', type: 'feature', status: 'completed', startedAt: 1 });
    seed(driver, { id: 'x2', projectId: 'p1', title: 'Token-Dashboard', type: 'feature', status: 'completed', startedAt: 2 });
    seed(driver, { id: 'x3', projectId: 'p1', title: 'Sprint-5 dashboard', type: 'feature', status: 'completed', startedAt: 3 });
    const dashboardHits = repo.listHistoryForProject({ projectId: 'p1', query: 'dashboard' });
    expect(dashboardHits.map((r) => r.id).sort()).toEqual(['x2', 'x3']);
  });

  it('leere Query = kein Filter', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'a', projectId: 'p1', title: 'A', type: 'feature', status: 'completed', startedAt: 1 });
    expect(
      repo.listHistoryForProject({ projectId: 'p1', query: '   ' }),
    ).toHaveLength(1);
  });

  it('kombiniert alle Filter UND-verknüpft', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'match', projectId: 'p1', title: 'Sprint Bug', type: 'bug', status: 'completed', startedAt: 1 });
    seed(driver, { id: 'wrong-type', projectId: 'p1', title: 'Sprint Bug', type: 'feature', status: 'completed', startedAt: 2 });
    seed(driver, { id: 'wrong-status', projectId: 'p1', title: 'Sprint Bug', type: 'bug', status: 'running', startedAt: 3 });
    seed(driver, { id: 'wrong-query', projectId: 'p1', title: 'Andere', type: 'bug', status: 'completed', startedAt: 4 });
    const result = repo.listHistoryForProject({
      projectId: 'p1',
      types: ['bug'],
      statuses: ['completed'],
      query: 'sprint',
    });
    expect(result.map((r) => r.id)).toEqual(['match']);
  });

  it('Token-Stats: 0/0/0 wenn keine Messages, sonst aus seedMessageStats', () => {
    const { repo, driver } = makeRepo();
    seed(driver, { id: 'sa', projectId: 'p1', title: 'A', type: 'feature', status: 'completed', startedAt: 1 });
    seed(driver, { id: 'sb', projectId: 'p1', title: 'B', type: 'feature', status: 'completed', startedAt: 2 });
    driver.seedMessageStats('sb', { tokens_in: 1234, tokens_out: 567, message_count: 8 });
    const result = repo.listHistoryForProject({ projectId: 'p1' });
    const a = result.find((r) => r.id === 'sa');
    const b = result.find((r) => r.id === 'sb');
    expect(a?.tokens_in).toBe(0);
    expect(a?.tokens_out).toBe(0);
    expect(a?.message_count).toBe(0);
    expect(b?.tokens_in).toBe(1234);
    expect(b?.tokens_out).toBe(567);
    expect(b?.message_count).toBe(8);
  });

  it('liefert season_number und notes_md durch', () => {
    const { repo, driver } = makeRepo();
    seed(driver, {
      id: 's',
      projectId: 'p1',
      title: 'Mit Season',
      type: 'feature',
      status: 'completed',
      startedAt: 1,
      seasonNumber: 7,
      notesMd: 'Erste Notiz\nZweite Zeile',
    });
    const result = repo.listHistoryForProject({ projectId: 'p1' });
    expect(result[0]?.season_number).toBe(7);
    expect(result[0]?.notes_md).toBe('Erste Notiz\nZweite Zeile');
  });
});
