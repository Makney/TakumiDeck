import { describe, it, expect } from 'vitest';
import {
  DOCS_SYNC_FILES,
  buildDocsSyncPrompt,
  computeFileSyncStatus,
  parseSummaryFrontmatter,
  type DocsSyncFileDescriptor,
} from '../../src/shared/docs-sync';

// Phase-2 Season-21: Pure-Logik-Tests fuer den Docs-Sync-Status und den
// Prompt-Builder. Drei Bloecke:
//   1. parseSummaryFrontmatter — Frontmatter-Parser-Edge-Cases.
//   2. computeFileSyncStatus  — Status-Entscheidung aus Hash + Frontmatter.
//   3. buildDocsSyncPrompt    — Prompt-Form bei verschiedenen Auswahlen.

const HOBBIT: DocsSyncFileDescriptor = DOCS_SYNC_FILES[0]!;

describe('parseSummaryFrontmatter', () => {
  it('liefert null, wenn das File keinen Frontmatter-Block hat', () => {
    expect(parseSummaryFrontmatter('# Nur ein Heading\nText.')).toBeNull();
    expect(parseSummaryFrontmatter('')).toBeNull();
  });

  it('liest source_hash + summarized_at aus einem flachen Block', () => {
    const md = [
      '---',
      'source: docs/CHANGELOG.md',
      'source_hash: abc123',
      'summarized_at: 2026-05-17T14:30:00Z',
      '---',
      '',
      '# Zusammenfassung',
    ].join('\n');
    const fm = parseSummaryFrontmatter(md);
    expect(fm).not.toBeNull();
    expect(fm!.source_hash).toBe('abc123');
    expect(fm!.summarized_at).toBe('2026-05-17T14:30:00Z');
  });

  it('strippt einfache und doppelte Anfuehrungszeichen vom Wert', () => {
    const md = [
      '---',
      'source_hash: "deadbeef"',
      "summarized_at: '2026-05-17'",
      '---',
    ].join('\n');
    const fm = parseSummaryFrontmatter(md);
    expect(fm!.source_hash).toBe('deadbeef');
    expect(fm!.summarized_at).toBe('2026-05-17');
  });

  it('liefert null fuer source_hash, wenn der Key fehlt', () => {
    const md = ['---', 'source: docs/foo.md', '---'].join('\n');
    const fm = parseSummaryFrontmatter(md);
    expect(fm).not.toBeNull();
    expect(fm!.source_hash).toBeNull();
    expect(fm!.summarized_at).toBeNull();
  });

  it('toleriert BOM am Datei-Anfang', () => {
    const md = '﻿---\nsource_hash: x\n---\n';
    const fm = parseSummaryFrontmatter(md);
    expect(fm!.source_hash).toBe('x');
  });

  it('ignoriert Frontmatter ohne schliessenden Marker', () => {
    const md = ['---', 'source_hash: x', 'kein-ende'].join('\n');
    expect(parseSummaryFrontmatter(md)).toBeNull();
  });
});

describe('computeFileSyncStatus', () => {
  it('missing-source, wenn das Original fehlt', () => {
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: null,
      summaryRaw: null,
    });
    expect(status.state).toBe('missing-source');
    expect(status.summarizedAt).toBeNull();
  });

  it('missing-summary, wenn Original existiert aber keine Summary-Datei', () => {
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: 'abc',
      summaryRaw: null,
    });
    expect(status.state).toBe('missing-summary');
    expect(status.summarizedAt).toBeNull();
  });

  it('stale, wenn Summary keinen Frontmatter hat', () => {
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: 'abc',
      summaryRaw: '# Summary ohne Frontmatter\n',
    });
    expect(status.state).toBe('stale');
    expect(status.summarizedAt).toBeNull();
  });

  it('stale, wenn source_hash im Frontmatter fehlt', () => {
    const summary = ['---', 'summarized_at: 2026-05-17', '---', ''].join('\n');
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: 'abc',
      summaryRaw: summary,
    });
    expect(status.state).toBe('stale');
    expect(status.summarizedAt).toBe('2026-05-17');
  });

  it('stale, wenn Hash der Original-Datei vom Frontmatter abweicht', () => {
    const summary = [
      '---',
      'source_hash: oldhash',
      'summarized_at: 2026-05-10',
      '---',
    ].join('\n');
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: 'newhash',
      summaryRaw: summary,
    });
    expect(status.state).toBe('stale');
    expect(status.summarizedAt).toBe('2026-05-10');
  });

  it('fresh, wenn Hash uebereinstimmt', () => {
    const summary = [
      '---',
      'source_hash: matching',
      'summarized_at: 2026-05-17',
      '---',
    ].join('\n');
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: 'matching',
      summaryRaw: summary,
    });
    expect(status.state).toBe('fresh');
    expect(status.summarizedAt).toBe('2026-05-17');
  });

  it('uebernimmt sourcePath + summaryPath aus dem Descriptor', () => {
    const status = computeFileSyncStatus({
      descriptor: HOBBIT,
      sourceHash: null,
      summaryRaw: null,
    });
    expect(status.sourcePath).toBe(HOBBIT.sourcePath);
    expect(status.summaryPath).toBe(HOBBIT.summaryPath);
    expect(status.name).toBe(HOBBIT.name);
  });
});

describe('buildDocsSyncPrompt', () => {
  it('liefert leeren String bei leerer Auswahl', () => {
    expect(buildDocsSyncPrompt([])).toBe('');
  });

  it('listet alle vier Files mit ihren Pfaden, wenn alle gewaehlt sind', () => {
    const prompt = buildDocsSyncPrompt(DOCS_SYNC_FILES);
    for (const f of DOCS_SYNC_FILES) {
      expect(prompt).toContain(f.sourcePath);
      expect(prompt).toContain(f.summaryPath);
    }
  });

  it('listet nur die ausgewaehlte Subset-Liste', () => {
    const subset = [DOCS_SYNC_FILES[0]!, DOCS_SYNC_FILES[2]!];
    const prompt = buildDocsSyncPrompt(subset);
    expect(prompt).toContain(DOCS_SYNC_FILES[0]!.sourcePath);
    expect(prompt).toContain(DOCS_SYNC_FILES[2]!.sourcePath);
    expect(prompt).not.toContain(DOCS_SYNC_FILES[1]!.sourcePath);
    expect(prompt).not.toContain(DOCS_SYNC_FILES[3]!.sourcePath);
  });

  it('erwaehnt das Frontmatter-Format und den source_hash-Hinweis', () => {
    const prompt = buildDocsSyncPrompt([HOBBIT]);
    expect(prompt).toContain('source_hash');
    expect(prompt).toContain('summarized_at');
    expect(prompt).toContain('sha256');
  });

  it('erwaehnt den Ziel-Ordner docs/SUMMARIES/', () => {
    const prompt = buildDocsSyncPrompt([HOBBIT]);
    expect(prompt).toContain('docs/SUMMARIES/');
  });
});

describe('DOCS_SYNC_FILES', () => {
  it('enthaelt genau die vier Roadmap-Files', () => {
    expect(DOCS_SYNC_FILES.map((f) => f.name)).toEqual([
      'CHANGELOG.md',
      'FEATURES.md',
      'TECH_SCHULDEN.md',
      'ENTSCHEIDUNGEN.md',
    ]);
  });

  it('hat fuer jedes Original einen Summary-Pfad unter docs/SUMMARIES/', () => {
    for (const f of DOCS_SYNC_FILES) {
      expect(f.summaryPath).toMatch(/^docs\/SUMMARIES\//);
    }
  });
});
