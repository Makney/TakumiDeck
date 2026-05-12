import { describe, expect, it } from 'vitest';
import {
  buildScreenshotFilename,
  mimeToExtension,
} from '../../src/main/fs/screenshotSave';

describe('mimeToExtension', () => {
  it('mappt die vier whitelisted MIME-Typen auf File-Extensions', () => {
    expect(mimeToExtension('image/png')).toBe('png');
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
    expect(mimeToExtension('image/gif')).toBe('gif');
    expect(mimeToExtension('image/webp')).toBe('webp');
  });

  it('wirft bei einem nicht-whitelisted MIME-Typ', () => {
    expect(() => mimeToExtension('image/svg+xml')).toThrow(/Unbekannter/);
    expect(() => mimeToExtension('text/plain')).toThrow(/Unbekannter/);
  });
});

describe('buildScreenshotFilename', () => {
  it('formt den Dateinamen mit UTC-Komponenten zu screenshot-YYYY-MM-DD-HH-MM-SS-mmm.<ext>', () => {
    // 2026-05-12 14:07:23.045 UTC
    const date = new Date(Date.UTC(2026, 4, 12, 14, 7, 23, 45));
    expect(buildScreenshotFilename(date, 'image/png')).toBe(
      'screenshot-2026-05-12-14-07-23-045.png',
    );
  });

  it('paddet ein-stellige Werte auf zwei Stellen und Millisekunden auf drei', () => {
    // 2026-01-02 03:04:05.006 UTC — alle Komponenten in Pad-Pflicht
    const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6));
    expect(buildScreenshotFilename(date, 'image/jpeg')).toBe(
      'screenshot-2026-01-02-03-04-05-006.jpg',
    );
  });

  it('liefert pro MIME-Typ die passende Extension', () => {
    const date = new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0));
    expect(buildScreenshotFilename(date, 'image/webp')).toMatch(/\.webp$/);
    expect(buildScreenshotFilename(date, 'image/gif')).toMatch(/\.gif$/);
  });

  it('liefert lexikographisch sortierbare Filenames für Pre-/Post-Zeitstempel', () => {
    const earlier = new Date(Date.UTC(2026, 4, 12, 14, 7, 23, 45));
    const later = new Date(Date.UTC(2026, 4, 12, 14, 7, 23, 46));
    const a = buildScreenshotFilename(earlier, 'image/png');
    const b = buildScreenshotFilename(later, 'image/png');
    expect([b, a].sort()).toEqual([a, b]);
  });
});
