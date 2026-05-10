import { describe, it, expect } from 'vitest';
import { encodeCwd, encodedCwdFromJsonlPath } from '../../src/main/jsonl/cwd-encoding';

// claude-code-Encoded-cwd-Konvention (Sprint 5).
// Realbeispiele aus ~/.claude/projects:
//   `D:\Projekte\TakumiDeck`               → `D--Projekte-TakumiDeck`
//   `C:\Users\makne\Desktop\TanaLib`       → `C--Users-makne-Desktop-TanaLib`

describe('encodeCwd', () => {
  it('encoded Windows-Pfade über Doppelpunkt + Backslash', () => {
    expect(encodeCwd('D:\\Projekte\\TakumiDeck')).toBe('D--Projekte-TakumiDeck');
    expect(encodeCwd('C:\\Users\\makne\\Desktop\\TanaLib')).toBe(
      'C--Users-makne-Desktop-TanaLib',
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
    const filePath = 'C:\\Users\\makne\\.claude\\projects\\D--Projekte-TakumiDeck\\abc.jsonl';
    expect(encodedCwdFromJsonlPath(filePath)).toBe('D--Projekte-TakumiDeck');
  });

  it('funktioniert mit Forward-Slashes', () => {
    expect(
      encodedCwdFromJsonlPath('/home/u/.claude/projects/-home-foo-bar/abc.jsonl'),
    ).toBe('-home-foo-bar');
  });
});
