import { describe, it, expect } from 'vitest';
import {
  SessionRepository,
  InMemorySessionDriver,
} from '../../src/main/db/repos/sessions';

// Phase-2 Season-31: Verifiziert, dass terminal-Sessions die claude-spezifischen
// Metadaten-Spalten dauerhaft auf null halten. Skip-Gates #2 und #3 aus
// `src/main/ipc/pty.ts` rufen `SessionRepository.create` mit `model=null`,
// `claude_session_id=null` und `jsonl_path=null` — der Repo-Vertrag muss diese
// Werte korrekt durchreichen.

function makeRepo() {
  const driver = new InMemorySessionDriver();
  return { repo: new SessionRepository(driver), driver };
}

describe('SessionRepository.create — type=terminal', () => {
  it('schreibt current_model=null, wenn model=null uebergeben wurde', () => {
    const { repo } = makeRepo();
    const row = repo.create({
      id: 'term-1',
      project_id: 'proj-1',
      title: 'Quick-Shell',
      type: 'terminal',
      model: null,
      cwd: 'C:\\Projekte\\Foo',
      claude_session_id: null,
      jsonl_path: null,
    });
    expect(row.type).toBe('terminal');
    expect(row.current_model).toBeNull();
    expect(row.claude_session_id).toBeNull();
    expect(row.jsonl_path).toBeNull();
  });

  it('setzt season_number=null fuer terminal (kein Counter-Increment)', () => {
    // Der Spawn-Branch in pty.ts ruft `projects.allocateSeasonNumber` nur fuer
    // type='feature' — terminal kommt mit `season_number=null` ins Repo. Die
    // Row spiegelt das wider.
    const { repo } = makeRepo();
    const row = repo.create({
      project_id: 'proj-1',
      title: 'Shell',
      type: 'terminal',
      model: null,
      cwd: 'C:\\Projekte\\Foo',
    });
    expect(row.season_number).toBeNull();
  });

  it('claude-Sessions bleiben unveraendert: current_model wird gesetzt', () => {
    // Regression-Guard: die model=null-Erlaubnis im Repo darf den Standardpfad
    // (feature/bug/review/docs-sync/custom mit echtem Modell) nicht aufweichen.
    const { repo } = makeRepo();
    const row = repo.create({
      id: 'sess-claude',
      project_id: 'proj-1',
      title: 'Claude-Session',
      type: 'feature',
      model: 'claude-sonnet-4-6',
      cwd: 'C:\\Projekte\\Foo',
      claude_session_id: 'sess-claude',
      jsonl_path: '/home/u/.claude/projects/x/sess-claude.jsonl',
    });
    expect(row.current_model).toBe('claude-sonnet-4-6');
    expect(row.claude_session_id).toBe('sess-claude');
    expect(row.jsonl_path).toBe('/home/u/.claude/projects/x/sess-claude.jsonl');
  });
});
