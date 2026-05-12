import { describe, expect, it } from 'vitest';
import {
  joinPathsForPaste,
  quotePathIfNeeded,
} from '../../src/renderer/components/pathQuoting';

describe('quotePathIfNeeded', () => {
  it('lässt Pfade ohne Whitespace unverändert', () => {
    expect(quotePathIfNeeded('C:\\Users\\m\\screenshots\\img.png')).toBe(
      'C:\\Users\\m\\screenshots\\img.png',
    );
    expect(quotePathIfNeeded('/home/m/img.png')).toBe('/home/m/img.png');
  });

  it('umrahmt Pfade mit Leerzeichen in doppelte Anführungszeichen', () => {
    expect(quotePathIfNeeded('C:\\Users\\Max Mustermann\\img.png')).toBe(
      '"C:\\Users\\Max Mustermann\\img.png"',
    );
  });

  it('escapt eingebettete Doppelanführungszeichen defensiv', () => {
    // Windows verbietet " in Dateinamen, aber Cygwin/Mounts können es liefern.
    expect(quotePathIfNeeded('/tmp/odd "name".png')).toBe('"/tmp/odd \\"name\\".png"');
  });

  it('umrahmt auch bei Tab oder anderen Whitespace-Zeichen', () => {
    expect(quotePathIfNeeded('/tmp/with\ttab.png')).toBe('"/tmp/with\ttab.png"');
  });

  it('liefert leeren String unverändert', () => {
    expect(quotePathIfNeeded('')).toBe('');
  });
});

describe('joinPathsForPaste', () => {
  it('verbindet mehrere Pfade mit Leerzeichen', () => {
    expect(joinPathsForPaste(['/a/b.png', '/c/d.png'])).toBe('/a/b.png /c/d.png');
  });

  it('quotet pro-Pfad nur die mit Whitespace', () => {
    expect(joinPathsForPaste(['/a/b.png', '/c/has space.png'])).toBe(
      '/a/b.png "/c/has space.png"',
    );
  });

  it('leere Liste liefert leeren String', () => {
    expect(joinPathsForPaste([])).toBe('');
  });
});
