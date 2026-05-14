import { describe, it, expect } from 'vitest';
import {
  ModelStatsRepository,
  InMemoryModelStatsDriver,
  type InMemoryModelStatsMessageLike,
} from '../../src/main/db/repos/model-stats';

// Phase-2 Season-14 — ModelStatsRepository-Aggregate.
//
// Tests laufen gegen den InMemory-Driver. Die SQL-Statements selbst sind
// trivial (GROUP BY model mit COUNT/SUM/COUNT DISTINCT), das Aggregat-
// Verhalten zwischen InMemory- und SQLite-Pfad ist identisch durch die
// gleiche Sort-Logik (tokens DESC, model ASC) und die NULL-Filter im
// WHERE/Driver.

const PROJ_A = 'project-a';
const PROJ_B = 'project-b';
const NOW = new Date(2026, 4, 14, 12, 0, 0);

function makeMsg(over: Partial<InMemoryModelStatsMessageLike>): InMemoryModelStatsMessageLike {
  return {
    project_id: PROJ_A,
    session_id: 'sess-1',
    ts: NOW.getTime(),
    tokens_in: 0,
    tokens_out: 0,
    model: 'claude-opus-4-7',
    ...over,
  };
}

describe('ModelStatsRepository.getModelsBreakdown', () => {
  it('leere DB liefert leere rows und tokens_total=0', () => {
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver([]));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.rows).toEqual([]);
    expect(out.tokens_total).toBe(0);
    expect(out.scope).toBe('project');
    expect(out.range).toBe('all');
  });

  it('gruppiert pro Modell mit Messages/Sessions/Tokens und tokens_share-Summe = 1', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ model: 'claude-opus-4-7', session_id: 's1', tokens_in: 100, tokens_out: 200 }),
      makeMsg({ model: 'claude-opus-4-7', session_id: 's1', tokens_in: 50, tokens_out: 50 }),
      makeMsg({ model: 'claude-opus-4-7', session_id: 's2', tokens_in: 50, tokens_out: 50 }),
      makeMsg({ model: 'claude-sonnet-4-6', session_id: 's3', tokens_in: 100, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]!.model).toBe('claude-opus-4-7');
    expect(out.rows[0]!.messages).toBe(3);
    expect(out.rows[0]!.sessions).toBe(2);
    expect(out.rows[0]!.tokens).toBe(500);
    expect(out.rows[1]!.model).toBe('claude-sonnet-4-6');
    expect(out.rows[1]!.sessions).toBe(1);
    expect(out.rows[1]!.tokens).toBe(100);

    const shareSum = out.rows.reduce((acc, r) => acc + r.tokens_share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
    expect(out.tokens_total).toBe(600);
  });

  it('Sortierung: tokens DESC, Tie-Break alphabetisch nach model', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ model: 'claude-sonnet-4-6', session_id: 's1', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ model: 'claude-haiku-4-5', session_id: 's2', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ model: 'claude-opus-4-7', session_id: 's3', tokens_in: 100, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    expect(out.rows.map((r) => r.model)).toEqual([
      'claude-haiku-4-5',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
    ]);
  });

  it('tokens_per_session = round(tokens / sessions)', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ session_id: 's1', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ session_id: 's2', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ session_id: 's3', tokens_in: 101, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    // 301 / 3 = 100.333..., round → 100
    expect(out.rows[0]!.tokens_per_session).toBe(100);
  });

  it('NULL-Modelle fliegen raus, kein Aggregat unter `(unbekannt)`', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ model: 'claude-opus-4-7', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ model: null, tokens_in: 999, tokens_out: 0 }),
      makeMsg({ model: null, tokens_in: 999, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.model).toBe('claude-opus-4-7');
    expect(out.tokens_total).toBe(100);
  });

  it('Scope global summiert ueber alle Projekte', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ project_id: PROJ_A, session_id: 's1', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ project_id: PROJ_B, session_id: 's2', tokens_in: 200, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: null, range: 'all', now: NOW });

    expect(out.scope).toBe('global');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.tokens).toBe(300);
  });

  it('Scope projektgebunden filtert messages eines anderen Projekts raus', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ project_id: PROJ_A, session_id: 's1', tokens_in: 100, tokens_out: 0 }),
      makeMsg({ project_id: PROJ_B, session_id: 's2', tokens_in: 999, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.tokens).toBe(100);
  });

  it('Range 30d schliesst Messages ausserhalb des Fensters aus', () => {
    const old = NOW.getTime() - 60 * 86_400_000;
    const recent = NOW.getTime() - 5 * 86_400_000;
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ ts: old, tokens_in: 999, tokens_out: 0 }),
      makeMsg({ ts: recent, tokens_in: 50, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: '30d', now: NOW });

    expect(out.tokens_total).toBe(50);
  });

  it('Range 7d engt das Fenster auf eine Woche ein', () => {
    const eight = NOW.getTime() - 8 * 86_400_000;
    const two = NOW.getTime() - 2 * 86_400_000;
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ ts: eight, tokens_in: 100, tokens_out: 0 }),
      makeMsg({ ts: two, tokens_in: 10, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: '7d', now: NOW });

    expect(out.tokens_total).toBe(10);
    expect(out.rows[0]!.messages).toBe(1);
  });

  it('Cross-Session-Aggregat: COUNT(DISTINCT session_id) statt COUNT(*)', () => {
    // Ein Modell, drei Messages, aber nur zwei unterschiedliche Sessions.
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ session_id: 's1', tokens_in: 1, tokens_out: 0 }),
      makeMsg({ session_id: 's1', tokens_in: 1, tokens_out: 0 }),
      makeMsg({ session_id: 's2', tokens_in: 1, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    expect(out.rows[0]!.messages).toBe(3);
    expect(out.rows[0]!.sessions).toBe(2);
  });

  it('tokens_share=0 bei Tokens-Total=0 (Messages ohne Token-Daten)', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ tokens_in: 0, tokens_out: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });

    expect(out.tokens_total).toBe(0);
    expect(out.rows[0]!.tokens_share).toBe(0);
    expect(out.rows[0]!.tokens_per_session).toBe(0);
  });

  it('echo: scope und range im Ergebnis', () => {
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver([]));
    const out = repo.getModelsBreakdown({ projectId: null, range: '7d', now: NOW });
    expect(out.scope).toBe('global');
    expect(out.range).toBe('7d');
    expect(out.generated_at).toBe(NOW.getTime());
  });

  // --- Phase-2 Season Flacsh: Cache-Hit-Rate ---------------------------

  it('cache_hit_rate = cache_read / tokens_in pro Modell', () => {
    // tokens_in = 300 (= input 100 + cache_creation 50 + cache_read 150);
    // Hit-Rate = 150/300 = 0.5
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({
        model: 'claude-opus-4-7',
        tokens_in: 300,
        tokens_out: 50,
        tokens_cache_creation: 50,
        tokens_cache_read: 150,
      }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.rows[0]!.cache_hit_rate).toBeCloseTo(0.5, 6);
    expect(out.rows[0]!.tokens_cache_read).toBe(150);
    expect(out.rows[0]!.tokens_cache_creation).toBe(50);
  });

  it('cache_hit_rate = null bei tokens_in=0', () => {
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({ tokens_in: 0, tokens_out: 0, tokens_cache_read: 0 }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.rows[0]!.cache_hit_rate).toBeNull();
  });

  it('cache_hit_rate_total ueber alle Modelle summiert', () => {
    // Opus: tokens_in=200, cache_read=80 → 40 %
    // Sonnet: tokens_in=100, cache_read=20 → 20 %
    // Total: cache_read=100, tokens_in=300 → 33.33 %
    const messages: InMemoryModelStatsMessageLike[] = [
      makeMsg({
        model: 'claude-opus-4-7',
        session_id: 's1',
        tokens_in: 200,
        tokens_out: 50,
        tokens_cache_read: 80,
      }),
      makeMsg({
        model: 'claude-sonnet-4-6',
        session_id: 's2',
        tokens_in: 100,
        tokens_out: 50,
        tokens_cache_read: 20,
      }),
    ];
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver(messages));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.cache_hit_rate_total).toBeCloseTo(100 / 300, 6);
  });

  it('cache_hit_rate_total = null bei leerem Aggregat', () => {
    const repo = new ModelStatsRepository(new InMemoryModelStatsDriver([]));
    const out = repo.getModelsBreakdown({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.cache_hit_rate_total).toBeNull();
  });
});
