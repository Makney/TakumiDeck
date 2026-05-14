import { describe, it, expect } from 'vitest';
import {
  StatsRepository,
  InMemoryStatsDriver,
  computeRangeStartTs,
  type InMemoryMessageLike,
  type InMemorySessionLike,
} from '../../src/main/db/repos/stats';

// Phase-2 Season-12 — StatsRepository-Aggregate.
//
// Tests laufen gegen den InMemoryStatsDriver, weil die SQL-Statements selbst
// trivial sind (COUNT/SUM/GROUP BY) und der Driver-Stack im Bestand bereits
// das gleiche Pattern testet (siehe usage-aggregation.test.ts, messages-
// model.test.ts).

const PROJ_A = 'project-a';
const PROJ_B = 'project-b';
const NOW = new Date(2026, 4, 14, 12, 0, 0); // 2026-05-14 12:00 lokal

function makeMsg(over: Partial<InMemoryMessageLike>): InMemoryMessageLike {
  return {
    project_id: PROJ_A,
    ts: NOW.getTime(),
    tokens_in: 0,
    tokens_out: 0,
    model: null,
    ...over,
  };
}

function makeSess(over: Partial<InMemorySessionLike>): InMemorySessionLike {
  return {
    project_id: PROJ_A,
    started_at: NOW.getTime(),
    ...over,
  };
}

function day(date: string, hour = 12): number {
  // YYYY-MM-DD lokal-Zeit-Mittag -> epoch-ms. Lokale Zeit, damit die SQL-
  // Aequivalenz im InMemory-Driver (localDayFromMs) konsistent bleibt.
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, 0, 0).getTime();
}

describe('StatsRepository.getOverview', () => {
  it('leere DB liefert Null-Defaults und scope/range im Echo', () => {
    const repo = new StatsRepository(new InMemoryStatsDriver([], []));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.sessions_total).toBe(0);
    expect(out.messages_total).toBe(0);
    expect(out.tokens_total).toBe(0);
    expect(out.active_days).toBe(0);
    expect(out.current_streak_days).toBe(0);
    expect(out.longest_streak_days).toBe(0);
    expect(out.peak_hour).toBeNull();
    expect(out.favorite_model).toBeNull();
    expect(out.scope).toBe('project');
    expect(out.range).toBe('all');
  });

  it('Sitzungen/Nachrichten/Tokens-Aggregat pro Projekt', () => {
    const sessions: InMemorySessionLike[] = [
      makeSess({ project_id: PROJ_A }),
      makeSess({ project_id: PROJ_A }),
      makeSess({ project_id: PROJ_B }),
    ];
    const messages: InMemoryMessageLike[] = [
      makeMsg({ project_id: PROJ_A, tokens_in: 100, tokens_out: 200 }),
      makeMsg({ project_id: PROJ_A, tokens_in: 50, tokens_out: 25 }),
      makeMsg({ project_id: PROJ_B, tokens_in: 999, tokens_out: 999 }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver(sessions, messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.sessions_total).toBe(2);
    expect(out.messages_total).toBe(2);
    expect(out.tokens_total).toBe(375); // 100+200+50+25
  });

  it('Scope global summiert alle Projekte', () => {
    const sessions: InMemorySessionLike[] = [
      makeSess({ project_id: PROJ_A }),
      makeSess({ project_id: PROJ_B }),
    ];
    const messages: InMemoryMessageLike[] = [
      makeMsg({ project_id: PROJ_A, tokens_in: 100, tokens_out: 0 }),
      makeMsg({ project_id: PROJ_B, tokens_in: 50, tokens_out: 0 }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver(sessions, messages));
    const out = repo.getOverview({ projectId: null, range: 'all', now: NOW });
    expect(out.scope).toBe('global');
    expect(out.sessions_total).toBe(2);
    expect(out.messages_total).toBe(2);
    expect(out.tokens_total).toBe(150);
  });

  it('Range 30d schliesst Sessions/Messages ausserhalb des Fensters aus', () => {
    const old = NOW.getTime() - 60 * 86_400_000;
    const recent = NOW.getTime() - 5 * 86_400_000;
    const sessions: InMemorySessionLike[] = [
      makeSess({ started_at: old }),
      makeSess({ started_at: recent }),
    ];
    const messages: InMemoryMessageLike[] = [
      makeMsg({ ts: old, tokens_in: 1000, tokens_out: 0 }),
      makeMsg({ ts: recent, tokens_in: 50, tokens_out: 0 }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver(sessions, messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: '30d', now: NOW });
    expect(out.sessions_total).toBe(1);
    expect(out.messages_total).toBe(1);
    expect(out.tokens_total).toBe(50);
  });

  it('Range 7d nimmt nur die letzte Woche', () => {
    const eightDays = NOW.getTime() - 8 * 86_400_000;
    const twoDays = NOW.getTime() - 2 * 86_400_000;
    const messages: InMemoryMessageLike[] = [
      makeMsg({ ts: eightDays, tokens_in: 1, tokens_out: 0 }),
      makeMsg({ ts: twoDays, tokens_in: 1, tokens_out: 0 }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: '7d', now: NOW });
    expect(out.messages_total).toBe(1);
  });

  it('Aktive Tage zaehlt distinct Local-Days', () => {
    const messages: InMemoryMessageLike[] = [
      makeMsg({ ts: day('2026-05-10', 10) }),
      makeMsg({ ts: day('2026-05-10', 23) }), // gleicher Tag, anderer Hour
      makeMsg({ ts: day('2026-05-12', 8) }),
      makeMsg({ ts: day('2026-05-14', 12) }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.active_days).toBe(3);
  });

  it('Current Streak: letzter Tag heute -> Streak zaehlt rueckwaerts bis Luecke', () => {
    const messages: InMemoryMessageLike[] = [
      makeMsg({ ts: day('2026-05-12') }),
      makeMsg({ ts: day('2026-05-13') }),
      makeMsg({ ts: day('2026-05-14') }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.current_streak_days).toBe(3);
    expect(out.longest_streak_days).toBe(3);
  });

  it('Current Streak: letzter Tag vor 2 Tagen -> 0, longest erhalten', () => {
    const messages: InMemoryMessageLike[] = [
      makeMsg({ ts: day('2026-05-10') }),
      makeMsg({ ts: day('2026-05-11') }),
      makeMsg({ ts: day('2026-05-12') }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.current_streak_days).toBe(0);
    expect(out.longest_streak_days).toBe(3);
  });

  it('Spitzenstunde: hoechster Hour-Count, Tie-Break = kleinere Stunde', () => {
    const messages: InMemoryMessageLike[] = [
      makeMsg({ ts: day('2026-05-14', 9) }),
      makeMsg({ ts: day('2026-05-14', 9) }),
      makeMsg({ ts: day('2026-05-14', 9) }),
      makeMsg({ ts: day('2026-05-13', 14) }),
      makeMsg({ ts: day('2026-05-13', 14) }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.peak_hour).toBe(9);
    expect(out.peak_hour_count).toBe(3);
  });

  it('Lieblingsmodell: Top-1 nach count, NULL-Modelle ignoriert', () => {
    const messages: InMemoryMessageLike[] = [
      makeMsg({ model: 'claude-opus-4-7' }),
      makeMsg({ model: 'claude-opus-4-7' }),
      makeMsg({ model: 'claude-sonnet-4-6' }),
      makeMsg({ model: null }),
      makeMsg({ model: null }),
      makeMsg({ model: null }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.favorite_model).toBe('claude-opus-4-7');
    expect(out.favorite_model_count).toBe(2);
  });

  it('Lieblingsmodell: alle NULL -> null', () => {
    const messages: InMemoryMessageLike[] = [
      makeMsg({ model: null }),
      makeMsg({ model: null }),
    ];
    const repo = new StatsRepository(new InMemoryStatsDriver([], messages));
    const out = repo.getOverview({ projectId: PROJ_A, range: 'all', now: NOW });
    expect(out.favorite_model).toBeNull();
    expect(out.favorite_model_count).toBe(0);
  });
});

describe('computeRangeStartTs', () => {
  it('all -> null', () => {
    expect(computeRangeStartTs('all', NOW)).toBeNull();
  });
  it('30d -> NOW - 30 Tage', () => {
    expect(computeRangeStartTs('30d', NOW)).toBe(NOW.getTime() - 30 * 86_400_000);
  });
  it('7d -> NOW - 7 Tage', () => {
    expect(computeRangeStartTs('7d', NOW)).toBe(NOW.getTime() - 7 * 86_400_000);
  });
});
