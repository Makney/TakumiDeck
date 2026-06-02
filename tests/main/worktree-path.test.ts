import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  sanitizeBranchForPath,
  worktreeContainerDir,
  resolveWorktreePath,
} from '../../src/main/git/worktreePath';
import { sanitizeBranchName } from '../../src/shared/worktree';

// Season 37 (Worktree-Support): Pure-Helper fuer die Worktree-Pfad-Ableitung.

describe('sanitizeBranchForPath', () => {
  it('laesst saubere Branch-Namen unveraendert', () => {
    expect(sanitizeBranchForPath('experiment')).toBe('experiment');
    expect(sanitizeBranchForPath('fix-123')).toBe('fix-123');
    expect(sanitizeBranchForPath('v1.2.3')).toBe('v1.2.3');
  });

  it('ersetzt Slashes und Sonderzeichen durch Bindestriche', () => {
    expect(sanitizeBranchForPath('feature/foo')).toBe('feature-foo');
    expect(sanitizeBranchForPath('feat/bar/baz')).toBe('feat-bar-baz');
    expect(sanitizeBranchForPath('user@host:thing')).toBe('user-host-thing');
  });

  it('kollabiert Mehrfach-Trenner und trimt Raender', () => {
    expect(sanitizeBranchForPath('a//b')).toBe('a-b');
    expect(sanitizeBranchForPath('/leading/trailing/')).toBe('leading-trailing');
    expect(sanitizeBranchForPath('  spaced  name ')).toBe('spaced-name');
  });

  it('faellt bei leerem Slug auf "worktree" zurueck', () => {
    expect(sanitizeBranchForPath('///')).toBe('worktree');
    expect(sanitizeBranchForPath('@@@')).toBe('worktree');
  });
});

describe('sanitizeBranchName', () => {
  it('macht aus freiem Text mit Leerzeichen einen gueltigen Git-Ref', () => {
    // Der konkrete Crash-Fall aus dem Bug-Report.
    expect(sanitizeBranchName('Zeilenabstand Rand einstellbar')).toBe(
      'Zeilenabstand-Rand-einstellbar',
    );
  });

  it('erhaelt hierarchische Slashes', () => {
    expect(sanitizeBranchName('feature/foo')).toBe('feature/foo');
  });

  it('entfernt git-ungueltige Sonderzeichen', () => {
    expect(sanitizeBranchName('fix: a~b^c?d')).toBe('fix-a-b-c-d');
  });

  it('trimt fuehrende/abschliessende Trenner und kollabiert Mehrfache', () => {
    expect(sanitizeBranchName('  /a//b--c..d/  ')).toBe('a/b-c.d');
  });

  it('faellt bei leerem Ergebnis auf "worktree" zurueck', () => {
    expect(sanitizeBranchName('   ')).toBe('worktree');
    expect(sanitizeBranchName('~^:')).toBe('worktree');
  });
});

describe('worktreeContainerDir', () => {
  it('legt den Container als Sibling neben das Projekt', () => {
    const projectPath = path.join('D:', 'Projekte', 'TakumiDeck');
    expect(worktreeContainerDir(projectPath)).toBe(
      path.join('D:', 'Projekte', 'TakumiDeck-worktrees'),
    );
  });
});

describe('resolveWorktreePath', () => {
  it('kombiniert Container + slugifizierten Branch', () => {
    const projectPath = path.join('D:', 'Projekte', 'TakumiDeck');
    expect(resolveWorktreePath(projectPath, 'feature/foo')).toBe(
      path.join('D:', 'Projekte', 'TakumiDeck-worktrees', 'feature-foo'),
    );
  });

  it('liegt garantiert AUSSERHALB des Projekt-Verzeichnisses', () => {
    const projectPath = path.join('D:', 'Projekte', 'TakumiDeck');
    const wt = resolveWorktreePath(projectPath, 'x');
    const rel = path.relative(projectPath, wt);
    // Der Worktree darf nicht innerhalb des Projekt-Roots liegen.
    expect(rel.startsWith('..')).toBe(true);
  });
});
