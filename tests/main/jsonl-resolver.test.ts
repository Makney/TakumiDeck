import { describe, it, expect } from 'vitest';
import { resolveJsonlToSession } from '../../src/main/jsonl/watcher';
import type { SessionRow, SessionStatus } from '@shared/types';

// Phase-2 Season-8: Resolver-Fix fuer den JSONL-Watcher.
//
// Bisher loeste der Watcher Events nur ueber den encoded-cwd der Eltern-Ordners
// auf — bei mehreren parallelen Sessions im selben Projekt-Pfad gewann die
// juengste, was die Per-Session-Kontext-Bar bei mehreren offenen Seasons auf
// die falsche Session schickte. Der neue Resolver matcht primaer ueber die
// claude-eigene Session-UUID aus dem JSONL-Filename und faellt nur dann auf
// den cwd-Match zurueck, wenn fuer die UUID keine Session bekannt ist.

const baseSession: Omit<SessionRow, 'id' | 'claude_session_id' | 'started_at' | 'status' | 'cwd'> = {
  project_id: 'proj-1',
  title: 'Test',
  type: 'feature',
  season_number: null,
  current_model: 'claude-sonnet-4-6',
  worktree_branch: null,
  notes_md: '',
  ended_at: null,
  custom_type_label: null,
};

function makeSession(overrides: Partial<SessionRow>): SessionRow {
  return {
    ...baseSession,
    id: 'sess',
    claude_session_id: null,
    started_at: 1000,
    status: 'running',
    cwd: 'C:\\Test',
    ...overrides,
  };
}

interface FakeDeps {
  byUuid: Map<string, SessionRow>;
  byStatus: Map<SessionStatus, SessionRow[]>;
}

function makeDeps(byUuid: SessionRow[], byStatus: Record<string, SessionRow[]>): FakeDeps {
  const uuidMap = new Map<string, SessionRow>();
  for (const s of byUuid) {
    if (s.claude_session_id) uuidMap.set(s.claude_session_id, s);
  }
  return {
    byUuid: uuidMap,
    byStatus: new Map(Object.entries(byStatus) as [SessionStatus, SessionRow[]][]),
  };
}

function callResolver(filePath: string, deps: FakeDeps) {
  return resolveJsonlToSession(filePath, {
    findByClaudeSessionId: (uuid) => deps.byUuid.get(uuid) ?? null,
    listByStatus: (status) => deps.byStatus.get(status) ?? [],
  });
}

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const JSONL_DIR_A = 'C:\\Users\\x\\.claude\\projects\\D--Projekte-TakumiDeck';

describe('resolveJsonlToSession', () => {
  it('matcht eine Session ueber die UUID im JSONL-Filename', () => {
    const sessionA = makeSession({
      id: 'sess-a',
      claude_session_id: UUID_A,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 1000,
    });
    const deps = makeDeps([sessionA], { running: [sessionA] });
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_A}.jsonl`, deps);
    expect(result?.id).toBe('sess-a');
  });

  it('UUID-Match gewinnt gegen die juengste cwd-Match-Session (Kern-Bug-Fix)', () => {
    // Zwei Sessions im selben cwd, beide running — vor dem Fix gewann immer
    // die juengste (started_at=2000). Mit dem Fix muss die UUID-Zuordnung
    // greifen, auch wenn die UUID-Session aelter ist.
    const sessionOldUuid = makeSession({
      id: 'sess-old-uuid',
      claude_session_id: UUID_A,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 1000,
    });
    const sessionYoungNoUuid = makeSession({
      id: 'sess-young-no-uuid',
      claude_session_id: null,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 2000,
    });
    const deps = makeDeps([sessionOldUuid], {
      running: [sessionOldUuid, sessionYoungNoUuid],
    });
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_A}.jsonl`, deps);
    expect(result?.id).toBe('sess-old-uuid');
  });

  it('UUID-Match ist status-agnostisch (resumed completed-Sessions werden weiter zugeordnet)', () => {
    const sessionCompleted = makeSession({
      id: 'sess-completed',
      claude_session_id: UUID_A,
      status: 'completed',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 1000,
    });
    const deps = makeDeps([sessionCompleted], { running: [], idle: [] });
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_A}.jsonl`, deps);
    expect(result?.id).toBe('sess-completed');
  });

  it('faellt auf den cwd-Match zurueck, wenn die UUID keiner Session zugeordnet ist', () => {
    const sessionExternal = makeSession({
      id: 'sess-external',
      claude_session_id: null,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 1000,
    });
    const deps = makeDeps([], { running: [sessionExternal] });
    // UUID_B existiert in keiner Session → Fallback
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_B}.jsonl`, deps);
    expect(result?.id).toBe('sess-external');
  });

  it('cwd-Fallback bevorzugt weiterhin die juengste Session bei Mehrfach-Treffer', () => {
    const older = makeSession({
      id: 'sess-older',
      claude_session_id: null,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 1000,
    });
    const younger = makeSession({
      id: 'sess-younger',
      claude_session_id: null,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 2000,
    });
    const deps = makeDeps([], { running: [older, younger] });
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_B}.jsonl`, deps);
    expect(result?.id).toBe('sess-younger');
  });

  it('cwd-Fallback ignoriert Sessions in einem anderen cwd', () => {
    const otherCwd = makeSession({
      id: 'sess-other',
      claude_session_id: null,
      status: 'running',
      cwd: 'D:\\AnderesProjekt',
      started_at: 5000,
    });
    const deps = makeDeps([], { running: [otherCwd] });
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_B}.jsonl`, deps);
    expect(result).toBeNull();
  });

  it('returnt null, wenn weder UUID-Match noch cwd-Kandidaten existieren', () => {
    const deps = makeDeps([], { running: [], idle: [] });
    const result = callResolver(`${JSONL_DIR_A}\\${UUID_B}.jsonl`, deps);
    expect(result).toBeNull();
  });

  it('JSONL-Filename ohne UUID-Form: nur cwd-Fallback greift', () => {
    const sessionFallback = makeSession({
      id: 'sess-fb',
      claude_session_id: null,
      status: 'running',
      cwd: 'D:\\Projekte\\TakumiDeck',
      started_at: 1000,
    });
    const deps = makeDeps([], { running: [sessionFallback] });
    const result = callResolver(`${JSONL_DIR_A}\\notes.jsonl`, deps);
    expect(result?.id).toBe('sess-fb');
  });
});
