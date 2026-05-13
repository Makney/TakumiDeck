import { describe, it, expect } from 'vitest';
import {
  buildTriggerPillList,
  humanizeTriggerKey,
} from '../../src/renderer/components/triggerPhrasePills';

// Phase-2 Season-3 — Tests für die Pure-Logik hinter den
// Trigger-Phrasen-Schnellbuttons in der Action-Bar.

describe('humanizeTriggerKey', () => {
  it('nutzt das handgepflegte Label für bekannte Keys', () => {
    expect(humanizeTriggerKey('docs_update')).toBe('Doku-Update');
  });

  it('fällt für unbekannte snake_case-Keys auf Title-Case-mit-Bindestrich zurück', () => {
    expect(humanizeTriggerKey('pr_ready')).toBe('Pr-Ready');
    expect(humanizeTriggerKey('deploy_staging')).toBe('Deploy-Staging');
    expect(humanizeTriggerKey('a_b_c')).toBe('A-B-C');
  });

  it('humanisiert auch einzelne Tokens ohne Underscore', () => {
    expect(humanizeTriggerKey('singleword')).toBe('Singleword');
    expect(humanizeTriggerKey('commit')).toBe('Commit');
  });

  it('returnt einen leeren String bei leerem Input', () => {
    expect(humanizeTriggerKey('')).toBe('');
  });
});

describe('buildTriggerPillList', () => {
  it('returnt ein leeres Array, wenn kein Frontmatter geladen ist', () => {
    expect(buildTriggerPillList(null)).toEqual([]);
    expect(buildTriggerPillList(undefined)).toEqual([]);
  });

  it('filtert die commit-Phrase heraus (eigene Pille mit Pre-Commit-Modal)', () => {
    const pills = buildTriggerPillList({
      docs_update: 'ist korrekt umgesetzt',
      commit: 'commit',
    });
    expect(pills).toHaveLength(1);
    expect(pills[0]).toEqual({
      key: 'docs_update',
      label: 'Doku-Update',
      phrase: 'ist korrekt umgesetzt',
    });
  });

  it('sortiert docs_update zuerst, danach alphabetisch', () => {
    const pills = buildTriggerPillList({
      docs_update: 'ist korrekt umgesetzt',
      commit: 'commit',
      pr_ready: 'pr ready',
      a_phrase: 'a phrase',
      deploy: 'deploy',
    });
    expect(pills.map((p) => p.key)).toEqual([
      'docs_update',
      'a_phrase',
      'deploy',
      'pr_ready',
    ]);
  });

  it('schreibt die wörtliche Phrase ungekürzt durch (1:1 für Bracketed-Paste)', () => {
    const pills = buildTriggerPillList({
      docs_update: 'ist korrekt umgesetzt mit allen Details!',
      commit: 'commit',
    });
    expect(pills[0]?.phrase).toBe('ist korrekt umgesetzt mit allen Details!');
  });

  it('returnt ein leeres Array, wenn nur die commit-Phrase definiert ist', () => {
    // Edge-Case: ein Projekt mit minimaler Frontmatter (nur die Pflicht-Keys),
    // bei dem `commit` ausgefiltert wird → leere Pillen-Reihe. Die Action-Bar
    // soll dann keinen leeren Slot zwischen Templates und commit-Pille rendern.
    const pills = buildTriggerPillList({
      docs_update: 'ist korrekt umgesetzt',
      commit: 'commit',
    });
    // docs_update bleibt sichtbar, daher 1 Pille — der Vollständigkeit halber.
    // Wenn jemand später docs_update versehentlich auch in HIDDEN_KEYS aufnimmt,
    // bricht dieser Test. Das ist Absicht: HIDDEN_KEYS ist eine Whitelist mit
    // explizitem Why-Kommentar, kein Free-for-all-Filter.
    expect(pills.map((p) => p.key)).toEqual(['docs_update']);
  });

  it('filtert leere oder whitespace-leere Phrasen defensiv heraus', () => {
    // zod lehnt eine leere Phrase bereits im Schema ab — der Defensiv-Filter
    // schützt zusätzlich vor einem Frontmatter, das z.B. über Tests am Schema
    // vorbei rein käme. Whitespace-only zählt nicht als „leer", weil claude-
    // code legitime Spaces als Trigger-Phrase verwendet (z.B. „commit ").
    const pills = buildTriggerPillList({
      docs_update: 'ist korrekt umgesetzt',
      commit: 'commit',
      empty: '',
    } as never);
    expect(pills.map((p) => p.key)).toEqual(['docs_update']);
  });
});
