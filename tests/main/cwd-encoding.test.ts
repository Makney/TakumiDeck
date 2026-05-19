import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  encodeCwd,
  encodedCwdFromJsonlPath,
  expectedJsonlPath,
} from '../../src/main/jsonl/cwd-encoding';

// claude-code-Encoded-cwd-Konvention (Sprint 5).
// Realbeispiele aus ~/.claude/projects:
//   `D:\Projekte\TakumiDeck`               → `D--Projekte-TakumiDeck`
//   `C:\Users\u\Desktop\TanaLib`           → `C--Users-u-Desktop-TanaLib`

describe('encodeCwd', () => {
  it('encoded Windows-Pfade über Doppelpunkt + Backslash', () => {
    expect(encodeCwd('D:\\Projekte\\TakumiDeck')).toBe('D--Projekte-TakumiDeck');
    expect(encodeCwd('C:\\Users\\u\\Desktop\\TanaLib')).toBe(
      'C--Users-u-Desktop-TanaLib',
    );
  });

  it('encoded gemischte Trenner (Windows-Pfad mit Forward-Slashes)', () => {
    expect(encodeCwd('D:/Projekte/TakumiDeck')).toBe('D--Projekte-TakumiDeck');
  });

  it('encoded Posix-Pfade', () => {
    expect(encodeCwd('/home/foo/bar')).toBe('-home-foo-bar');
  });
});

describe('encodedCwdFromJsonlPath', () => {
  it('extrahiert den Eltern-Ordner-Namen', () => {
    const filePath = 'C:\\Users\\u\\.claude\\projects\\D--Projekte-TakumiDeck\\abc.jsonl';
    expect(encodedCwdFromJsonlPath(filePath)).toBe('D--Projekte-TakumiDeck');
  });

  it('funktioniert mit Forward-Slashes', () => {
    expect(
      encodedCwdFromJsonlPath('/home/u/.claude/projects/-home-foo-bar/abc.jsonl'),
    ).toBe('-home-foo-bar');
  });
});

describe('expectedJsonlPath — Phase-2 Season-15', () => {
  it('baut den deterministischen claude-Code-Pfad zusammen', () => {
    const result = expectedJsonlPath(
      'C:\\Users\\u\\.claude\\projects',
      'D:\\Projekte\\TakumiDeck',
      '11111111-2222-3333-4444-555555555555',
    );
    expect(result).toBe(
      path.normalize(
        'C:\\Users\\u\\.claude\\projects\\D--Projekte-TakumiDeck\\11111111-2222-3333-4444-555555555555.jsonl',
      ),
    );
  });

  it('toleriert Trailing-Slash am Projects-Root', () => {
    const a = expectedJsonlPath('/home/u/.claude/projects', '/work/proj', 'aaa');
    const b = expectedJsonlPath('/home/u/.claude/projects/', '/work/proj', 'aaa');
    expect(a).toBe(b);
  });

  it('reicht die UUID 1:1 als Stem durch — kein Lowercasing', () => {
    const result = expectedJsonlPath(
      '/home/u/.claude/projects',
      '/work/proj',
      'ABCDEFAB-CDEF-1234-5678-DEADBEEFCAFE',
    );
    expect(result.endsWith('ABCDEFAB-CDEF-1234-5678-DEADBEEFCAFE.jsonl')).toBe(true);
  });
});
