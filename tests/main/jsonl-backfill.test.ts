import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import {
  runJsonlPathBackfill,
  type BackfillFsDriver,
  BACKFILL_FLAG_KEY,
  BACKFILL_FLAG_VALUE,
} from '../../src/main/jsonl/backfill';
import {
  SessionRepository,
  InMemorySessionDriver,
  type SessionInsert,
} from '../../src/main/db/repos/sessions';
import {
  MetaKvRepository,
  InMemoryMetaKvDriver,
} from '../../src/main/db/repos/meta-kv';
import { encodeCwd, expectedJsonlPath } from '../../src/main/jsonl/cwd-encoding';
import type { Logger } from '../../src/main/logger';

// Phase-2 Season-15 — Boot-One-Shot-Backfill fuer resume-tote Multi-Session-
// Bestaende.
//
// Tests fahren mit InMemorySessionDriver + InMemoryMetaKvDriver + Fake-Fs;
// kein Real-FS-Zugriff. Wir validieren:
// - Idempotenz via Flag (skipped=true, wenn der Flag-Wert schon "done" steht)
// - leerer Backfill setzt das Flag trotzdem (damit der Pass nicht jeden Boot
//   neu laeuft, wenn keine resume-toten Sessions da sind)
// - Pair-Up im Single-cwd-Fall mit mtime + started_at-Sort
// - Pair-Up im Multi-cwd-Fall
// - mehr Sessions als Files: ueberzaehlige bleiben resume-tot
// - mehr Files als Sessions: ueberzaehlige Files bleiben ohne Anker
// - Files ohne UUID-Stem fliegen raus
// - readdir-ENOENT-Fall (cwd nie aus claude bedient) ist no-op

const CLAUDE_ROOT = path.normalize('C:\\Users\\u\\.claude\\projects');

const baseInsert: Omit<SessionInsert, 'id' | 'cwd' | 'started_at' | 'claude_session_id'> = {
  project_id: 'proj-1',
  title: 'Test',
  type: 'feature',
  season_number: null,
  status: 'completed',
  current_model: 'claude-sonnet-4-6',
  worktree_branch: null,
  notes_md: '',
  ended_at: null,
  custom_type_label: null,
  jsonl_path: null,
};

function makeRepos() {
  const sessionDriver = new InMemorySessionDriver();
  const metaDriver = new InMemoryMetaKvDriver();
  return {
    sessions: new SessionRepository(sessionDriver),
    sessionDriver,
    meta: new MetaKvRepository(metaDriver),
    metaDriver,
  };
}

function makeFakeFs(
  filesByFolder: Record<string, Array<{ filePath: string; mtimeMs: number }>>,
): BackfillFsDriver {
  return {
    async listJsonlFilesWithMtime(folder) {
      return filesByFolder[folder] ?? [];
    },
  };
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

describe('runJsonlPathBackfill', () => {
  let env: ReturnType<typeof makeRepos>;
  let log: Logger;

  beforeEach(() => {
    env = makeRepos();
    log = makeLogger();
  });

  it('skipped=true, wenn der Flag schon auf "done" steht (Idempotenz)', async () => {
    env.meta.set(BACKFILL_FLAG_KEY, BACKFILL_FLAG_VALUE);
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'a',
      cwd: 'D:\\X',
      claude_session_id: null,
      started_at: 1000,
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs: makeFakeFs({}),
      log,
    });
    expect(report.skipped).toBe(true);
    // Session bleibt unverbunden
    expect(env.sessionDriver.findById('a')?.claude_session_id).toBeNull();
  });

  it('leerer Bestand: Flag wird gesetzt, damit der Pass nicht jeden Boot laeuft', async () => {
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs: makeFakeFs({}),
      log,
    });
    expect(report.skipped).toBe(false);
    expect(report.pairsLinked).toBe(0);
    expect(env.meta.get(BACKFILL_FLAG_KEY)).toBe(BACKFILL_FLAG_VALUE);
  });

  it('Pair-Up im Single-cwd-Fall: zwei Sessions ↔ zwei Files (mtime + started_at)', async () => {
    const cwd = 'D:\\Projekte\\X';
    const folder = path.join(CLAUDE_ROOT, encodeCwd(cwd));
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'sess-younger',
      cwd,
      claude_session_id: null,
      started_at: 2000,
    });
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'sess-older',
      cwd,
      claude_session_id: null,
      started_at: 1000,
    });
    const UUID_OLDER = '11111111-2222-3333-4444-555555555555';
    const UUID_YOUNGER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const fs = makeFakeFs({
      [folder]: [
        // Reverse-Order absichtlich: der Pass muss intern nach mtime sortieren.
        { filePath: path.join(folder, `${UUID_YOUNGER}.jsonl`), mtimeMs: 2000 },
        { filePath: path.join(folder, `${UUID_OLDER}.jsonl`), mtimeMs: 1000 },
      ],
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs,
      log,
    });
    expect(report.pairsLinked).toBe(2);
    expect(report.cwdsScanned).toBe(1);
    // sess-older ↔ aelteste JSONL (UUID_OLDER), sess-younger ↔ juengste
    expect(env.sessionDriver.findById('sess-older')?.claude_session_id).toBe(UUID_OLDER);
    expect(env.sessionDriver.findById('sess-younger')?.claude_session_id).toBe(UUID_YOUNGER);
    expect(env.sessionDriver.findById('sess-older')?.jsonl_path).toBe(
      expectedJsonlPath(CLAUDE_ROOT, cwd, UUID_OLDER),
    );
  });

  it('mehr Sessions als Files: ueberzaehlige Sessions bleiben resume-tot', async () => {
    const cwd = 'D:\\Y';
    const folder = path.join(CLAUDE_ROOT, encodeCwd(cwd));
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'a',
      cwd,
      claude_session_id: null,
      started_at: 1000,
    });
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'b',
      cwd,
      claude_session_id: null,
      started_at: 2000,
    });
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'c',
      cwd,
      claude_session_id: null,
      started_at: 3000,
    });
    const UUID = '11111111-2222-3333-4444-555555555555';
    const fs = makeFakeFs({
      [folder]: [{ filePath: path.join(folder, `${UUID}.jsonl`), mtimeMs: 100 }],
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs,
      log,
    });
    expect(report.pairsLinked).toBe(1);
    // 'a' ist die aelteste Session → bekommt die einzige UUID.
    expect(env.sessionDriver.findById('a')?.claude_session_id).toBe(UUID);
    expect(env.sessionDriver.findById('b')?.claude_session_id).toBeNull();
    expect(env.sessionDriver.findById('c')?.claude_session_id).toBeNull();
  });

  it('mehr Files als Sessions: ueberzaehlige Files bleiben ohne Anker', async () => {
    const cwd = 'D:\\Z';
    const folder = path.join(CLAUDE_ROOT, encodeCwd(cwd));
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'only-one',
      cwd,
      claude_session_id: null,
      started_at: 1000,
    });
    const U1 = '11111111-2222-3333-4444-555555555555';
    const U2 = '22222222-2222-3333-4444-555555555555';
    const U3 = '33333333-2222-3333-4444-555555555555';
    const fs = makeFakeFs({
      [folder]: [
        { filePath: path.join(folder, `${U1}.jsonl`), mtimeMs: 100 },
        { filePath: path.join(folder, `${U2}.jsonl`), mtimeMs: 200 },
        { filePath: path.join(folder, `${U3}.jsonl`), mtimeMs: 300 },
      ],
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs,
      log,
    });
    expect(report.pairsLinked).toBe(1);
    expect(env.sessionDriver.findById('only-one')?.claude_session_id).toBe(U1);
  });

  it('Files ohne UUID-Stem werden ignoriert', async () => {
    const cwd = 'D:\\W';
    const folder = path.join(CLAUDE_ROOT, encodeCwd(cwd));
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'sess',
      cwd,
      claude_session_id: null,
      started_at: 1000,
    });
    const UUID = '11111111-2222-3333-4444-555555555555';
    const fs = makeFakeFs({
      [folder]: [
        // notes.jsonl matcht das UUID-Pattern NICHT → ignoriert.
        { filePath: path.join(folder, `notes.jsonl`), mtimeMs: 50 },
        { filePath: path.join(folder, `${UUID}.jsonl`), mtimeMs: 100 },
      ],
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs,
      log,
    });
    expect(report.pairsLinked).toBe(1);
    expect(env.sessionDriver.findById('sess')?.claude_session_id).toBe(UUID);
  });

  it('Multi-cwd: jeder Bucket wird unabhaengig gepaart', async () => {
    const cwdA = 'D:\\A';
    const cwdB = 'D:\\B';
    const folderA = path.join(CLAUDE_ROOT, encodeCwd(cwdA));
    const folderB = path.join(CLAUDE_ROOT, encodeCwd(cwdB));
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'a1',
      cwd: cwdA,
      claude_session_id: null,
      started_at: 1000,
    });
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'b1',
      cwd: cwdB,
      claude_session_id: null,
      started_at: 1000,
    });
    const UA = '11111111-1111-1111-1111-111111111111';
    const UB = '22222222-2222-2222-2222-222222222222';
    const fs = makeFakeFs({
      [folderA]: [{ filePath: path.join(folderA, `${UA}.jsonl`), mtimeMs: 50 }],
      [folderB]: [{ filePath: path.join(folderB, `${UB}.jsonl`), mtimeMs: 60 }],
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs,
      log,
    });
    expect(report.cwdsScanned).toBe(2);
    expect(report.pairsLinked).toBe(2);
    expect(env.sessionDriver.findById('a1')?.claude_session_id).toBe(UA);
    expect(env.sessionDriver.findById('b1')?.claude_session_id).toBe(UB);
  });

  it('cwd ohne JSONL-Folder (Fake-Fs returnt leeres Array): keine Aenderung, kein Throw', async () => {
    const cwd = 'D:\\NeverClaude';
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'sess',
      cwd,
      claude_session_id: null,
      started_at: 1000,
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs: makeFakeFs({}),
      log,
    });
    expect(report.pairsLinked).toBe(0);
    expect(env.sessionDriver.findById('sess')?.claude_session_id).toBeNull();
    expect(env.meta.get(BACKFILL_FLAG_KEY)).toBe(BACKFILL_FLAG_VALUE);
  });

  it('Sessions mit claude_session_id schon gesetzt werden NICHT angefasst', async () => {
    const cwd = 'D:\\Q';
    const folder = path.join(CLAUDE_ROOT, encodeCwd(cwd));
    env.sessionDriver.insert({
      ...baseInsert,
      id: 'already-bound',
      cwd,
      claude_session_id: 'existing-uuid',
      started_at: 1000,
    });
    const UUID = '11111111-2222-3333-4444-555555555555';
    const fs = makeFakeFs({
      [folder]: [{ filePath: path.join(folder, `${UUID}.jsonl`), mtimeMs: 100 }],
    });
    const report = await runJsonlPathBackfill({
      sessions: env.sessions,
      meta: env.meta,
      claudeProjectsRoot: CLAUDE_ROOT,
      fs,
      log,
    });
    // Kein Pair — die Session ist nicht in listMissingClaudeSessionId().
    expect(report.pairsLinked).toBe(0);
    expect(env.sessionDriver.findById('already-bound')?.claude_session_id).toBe(
      'existing-uuid',
    );
  });
});
