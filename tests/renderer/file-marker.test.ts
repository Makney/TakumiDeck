import { describe, it, expect } from 'vitest';
import { pickFileMarker } from '../../src/renderer/components/fileMarker';

// Phase-2 Season-29.5: Marker-Wahl fuer den Datei-Browser. Editor-Dirty
// schlaegt Git-Status; Git-Status wird auf M/A/D/R/C/U abgebildet.

describe('pickFileMarker', () => {
  it('liefert null fuer sauberen, unveraenderten File', () => {
    expect(pickFileMarker(false, null)).toBeNull();
    expect(pickFileMarker(false, 'unchanged')).toBeNull();
  });

  it('dirty (Editor-Tab) schlaegt Git-Status', () => {
    const marker = pickFileMarker(true, 'added');
    expect(marker).not.toBeNull();
    expect(marker!.label).toBe('M');
    expect(marker!.kind).toBe('dirty');
    expect(marker!.title).toMatch(/Editor/i);
  });

  it('dirty wirkt auch ohne Git-Status', () => {
    const marker = pickFileMarker(true, null);
    expect(marker).not.toBeNull();
    expect(marker!.kind).toBe('dirty');
  });

  it('Git modified → M dirty', () => {
    const marker = pickFileMarker(false, 'modified');
    expect(marker).not.toBeNull();
    expect(marker!.label).toBe('M');
    expect(marker!.kind).toBe('dirty');
    expect(marker!.title).toMatch(/Working-Tree/i);
  });

  it('Git added → A added', () => {
    const marker = pickFileMarker(false, 'added');
    expect(marker!.label).toBe('A');
    expect(marker!.kind).toBe('added');
  });

  it('Git untracked → A added (untracked-Variante)', () => {
    const marker = pickFileMarker(false, 'untracked');
    expect(marker!.label).toBe('A');
    expect(marker!.kind).toBe('added');
    expect(marker!.title).toMatch(/untracked/i);
  });

  it('Git deleted → D deleted', () => {
    const marker = pickFileMarker(false, 'deleted');
    expect(marker!.label).toBe('D');
    expect(marker!.kind).toBe('deleted');
  });

  it('Git renamed → R info', () => {
    const marker = pickFileMarker(false, 'renamed');
    expect(marker!.label).toBe('R');
    expect(marker!.kind).toBe('info');
  });

  it('Git copied → C info', () => {
    const marker = pickFileMarker(false, 'copied');
    expect(marker!.label).toBe('C');
    expect(marker!.kind).toBe('info');
  });

  it('Git unmerged → U info', () => {
    const marker = pickFileMarker(false, 'unmerged');
    expect(marker!.label).toBe('U');
    expect(marker!.kind).toBe('info');
  });
});
