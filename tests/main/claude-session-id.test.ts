import { describe, it, expect } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
  type SessionInsert,
} from '../../src/main/db/repos/sessions';
import { parseJsonlSegment } from '../../src/main/jsonl/parser';
import { claudeUuidFromJsonlPath } from '../../src/main/jsonl/cwd-encoding';

// Sprint-6-Hotfix: Resume-Bug-Fix (Variante C — beide Pfade kombiniert).
// Tests decken:
// 1. setClaudeSessionId-Idempotenz im Repo (überschreibt nicht).
// 2. Spawn-Pfad: claude_session_id wird beim create gleich auf id gesetzt.
// 3. JSONL-Parser: extrahiert sessionId aus claude-codes JSONL-Format.

function makeRepo() {
  const driver = new InMemorySessionDriver();
  return { repo: new SessionRepository(driver), driver };
}

const baseInsert: Omit<SessionInsert, 'id' | 'claude_session_id'> = {
  project_id: 'proj-1',
  title: 'Test',
  type: 'feature',
  season_number: null,
  status: 'completed',
  current_model: 'claude-sonnet-4-6',
  worktree_branch: null,
  notes_md: '',
  cwd: 'C:\\test',
  started_at: 1000,
  ended_at: 2000,
};

describe('SessionRepository.setClaudeSessionId', () => {
  it('setzt die UUID, wenn die Spalte aktuell null ist', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseInsert, id: 'sess-1', claude_session_id: null });
    const updated = repo.setClaudeSessionId('sess-1', 'claude-uuid-abc');
    expect(updated).toBe(true);
    expect(driver.findById('sess-1')?.claude_session_id).toBe('claude-uuid-abc');
  });

  it('überschreibt NICHT, wenn die UUID schon gesetzt ist (Idempotenz)', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseInsert, id: 'sess-2', claude_session_id: 'first-uuid' });
    const updated = repo.setClaudeSessionId('sess-2', 'second-uuid');
    expect(updated).toBe(false);
    expect(driver.findById('sess-2')?.claude_session_id).toBe('first-uuid');
  });

  it('returnt false, wenn die Session nicht existiert', () => {
    const { repo } = makeRepo();
    expect(repo.setClaudeSessionId('ghost', 'x')).toBe(false);
  });

  it('zweiter Call mit gleicher UUID ist No-op (kein Re-Update)', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseInsert, id: 'sess-3', claude_session_id: null });
    expect(repo.setClaudeSessionId('sess-3', 'X')).toBe(true);
    expect(repo.setClaudeSessionId('sess-3', 'X')).toBe(false);
    expect(driver.findById('sess-3')?.claude_session_id).toBe('X');
  });
});

describe('SessionRepository.create — Hotfix: claude_session_id beim Spawn', () => {
  it('setzt claude_session_id auf den explizit übergebenen Wert (Spawn mit --session-id)', () => {
    const { repo } = makeRepo();
    const row = repo.create({
      id: 'fixed-id',
      project_id: 'proj-1',
      title: 'Test',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\t',
      claude_session_id: 'fixed-id',
    });
    expect(row.claude_session_id).toBe('fixed-id');
    expect(row.id).toBe('fixed-id');
  });

  it('claude_session_id ist null, wenn nicht übergeben (Legacy-Pfad-Kompatibilität)', () => {
    const { repo } = makeRepo();
    const row = repo.create({
      project_id: 'proj-1',
      title: 'Test',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\t',
    });
    expect(row.claude_session_id).toBeNull();
  });
});

describe('SessionRepository.listMissingClaudeSessionId', () => {
  it('liefert nur Sessions mit claude_session_id IS NULL, status-agnostisch', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseInsert, id: 'a', claude_session_id: null, status: 'running' });
    driver.insert({ ...baseInsert, id: 'b', claude_session_id: null, status: 'completed' });
    driver.insert({ ...baseInsert, id: 'c', claude_session_id: 'already-set', status: 'completed' });
    driver.insert({ ...baseInsert, id: 'd', claude_session_id: null, status: 'archived' });
    const result = repo.listMissingClaudeSessionId();
    expect(result.map((r) => r.id).sort()).toEqual(['a', 'b', 'd']);
  });

  it('returnt leeres Array, wenn alle Sessions eine UUID haben', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseInsert, id: 'a', claude_session_id: 'x' });
    driver.insert({ ...baseInsert, id: 'b', claude_session_id: 'y' });
    expect(repo.listMissingClaudeSessionId()).toEqual([]);
  });
});

describe('claudeUuidFromJsonlPath', () => {
  it('extrahiert die UUID aus Standard-claude-code-Filenames', () => {
    expect(
      claudeUuidFromJsonlPath(
        '/home/u/.claude/projects/foo/086750f4-c60d-4761-aa40-83fc0d618b80.jsonl',
      ),
    ).toBe('086750f4-c60d-4761-aa40-83fc0d618b80');
  });

  it('Windows-Pfade ebenfalls', () => {
    expect(
      claudeUuidFromJsonlPath(
        'C:\\Users\\x\\.claude\\projects\\D--P\\11111111-2222-3333-4444-555555555555.jsonl',
      ),
    ).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('returnt null bei nicht-UUID-Filename', () => {
    expect(claudeUuidFromJsonlPath('/foo/notes.jsonl')).toBeNull();
    expect(claudeUuidFromJsonlPath('/foo/123.jsonl')).toBeNull();
    expect(claudeUuidFromJsonlPath('/foo/uuid-without-dashes.jsonl')).toBeNull();
  });

  it('case-insensitive bei .jsonl-Suffix', () => {
    expect(
      claudeUuidFromJsonlPath('/foo/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE.JSONL'),
    ).toBe('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
  });
});

describe('parseJsonlSegment — sessionId-Extraktion', () => {
  it('zieht sessionId aus dem Top-Level der JSONL-Zeile', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-10T10:00:00.000Z',
      sessionId: 'claude-internal-uuid',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100 },
      },
    });
    const result = parseJsonlSegment(line + '\n');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.sessionId).toBe('claude-internal-uuid');
  });

  it('sessionId ist null, wenn das Feld in der Zeile fehlt', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-10T10:00:00.000Z',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100 },
      },
    });
    const result = parseJsonlSegment(line + '\n');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.sessionId).toBeNull();
  });
});
