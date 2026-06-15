import { describe, it, expect } from 'vitest';
import { parseOpencodeModels, formatOpencodeModelLabel } from '../../src/shared/opencode';

// Season 39 (Opencode): Pure-Parser fuer die `opencode models`-Ausgabe.

describe('parseOpencodeModels', () => {
  it('parst eine Liste von provider/model-Zeilen', () => {
    const stdout = [
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5',
      'lmstudio/qwen/qwen3-coder-30b',
    ].join('\n');
    expect(parseOpencodeModels(stdout)).toEqual([
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-5',
      'lmstudio/qwen/qwen3-coder-30b',
    ]);
  });

  it('ignoriert Leerzeilen und trimmt Whitespace am Rand', () => {
    const stdout = '\n  anthropic/claude-opus-4-1  \n\n  openai/gpt-5\n';
    expect(parseOpencodeModels(stdout)).toEqual([
      'anthropic/claude-opus-4-1',
      'openai/gpt-5',
    ]);
  });

  it('ueberspringt Zeilen ohne Provider-Slash (Banner/Hinweise)', () => {
    const stdout = ['opencode 1.16.2', 'anthropic/claude-sonnet-4-5'].join('\n');
    expect(parseOpencodeModels(stdout)).toEqual(['anthropic/claude-sonnet-4-5']);
  });

  it('ueberspringt Zeilen mit Whitespace in der Mitte (Tabellen-Ausgabe)', () => {
    const stdout = ['Provider   Model', 'anthropic/claude-sonnet-4-5'].join('\n');
    expect(parseOpencodeModels(stdout)).toEqual(['anthropic/claude-sonnet-4-5']);
  });

  it('entfernt ANSI-Faerbung', () => {
    const stdout = '[32manthropic/claude-sonnet-4-5[0m';
    expect(parseOpencodeModels(stdout)).toEqual(['anthropic/claude-sonnet-4-5']);
  });

  it('dedupliziert bei Beibehaltung der Reihenfolge', () => {
    const stdout = ['openai/gpt-5', 'anthropic/claude-opus-4-1', 'openai/gpt-5'].join('\n');
    expect(parseOpencodeModels(stdout)).toEqual([
      'openai/gpt-5',
      'anthropic/claude-opus-4-1',
    ]);
  });

  it('liefert eine leere Liste fuer leeren stdout', () => {
    expect(parseOpencodeModels('')).toEqual([]);
    expect(parseOpencodeModels('\n\n')).toEqual([]);
  });
});

describe('formatOpencodeModelLabel', () => {
  it('zeigt die volle provider/model-ID', () => {
    expect(formatOpencodeModelLabel('anthropic/claude-sonnet-4-5')).toBe(
      'anthropic/claude-sonnet-4-5',
    );
  });
});
