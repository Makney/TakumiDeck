import { describe, it, expect } from 'vitest';
import {
  buildAutoVariables,
  fillTemplateVariables,
  findVariablesInTemplate,
} from '../../src/renderer/components/templateVariables';

describe('findVariablesInTemplate', () => {
  it('liefert alle eindeutigen Tokens in Vorkommens-Reihenfolge', () => {
    const tpl = '{{FEATURE_NAME}} → {{AUFGABE}}\n\n{{FEATURE_NAME}}\n{{HINWEISE}}';
    expect(findVariablesInTemplate(tpl)).toEqual([
      'FEATURE_NAME',
      'AUFGABE',
      'HINWEISE',
    ]);
  });

  it('matcht NUR Großbuchstaben + Underscore (Architektur-Spec)', () => {
    const tpl = '{{lowercase}} {{Mixed_Case}} {{1234}} {{NORMAL_TOKEN}}';
    expect(findVariablesInTemplate(tpl)).toEqual(['NORMAL_TOKEN']);
  });

  it('liefert leeres Array, wenn keine Tokens vorhanden', () => {
    expect(findVariablesInTemplate('Plain text without templates')).toEqual([]);
  });
});

describe('fillTemplateVariables', () => {
  it('ersetzt bekannte Variablen 1:1', () => {
    const tpl = 'Season #{{NEXT_SEASON_NR}} – {{FEATURE_NAME}}';
    const result = fillTemplateVariables(tpl, {
      NEXT_SEASON_NR: '6',
      FEATURE_NAME: 'Templates',
    });
    expect(result.filled).toBe('Season #6 – Templates');
    expect(result.missingRequired).toEqual([]);
    expect(result.unknownTokens).toEqual([]);
  });

  it('Pflichtfeld ohne Wert → bleibt als Platzhalter UND landet in missingRequired', () => {
    const tpl = '{{FEATURE_NAME}} - {{AUFGABE}}';
    const result = fillTemplateVariables(tpl, { FEATURE_NAME: 'OK' });
    expect(result.filled).toBe('OK - {{AUFGABE}}');
    expect(result.missingRequired).toEqual(['AUFGABE']);
  });

  it('Pflichtfeld mit Whitespace-only zählt als leer', () => {
    const result = fillTemplateVariables('{{FEATURE_NAME}}', { FEATURE_NAME: '   ' });
    expect(result.missingRequired).toEqual(['FEATURE_NAME']);
    expect(result.filled).toBe('{{FEATURE_NAME}}');
  });

  it('Optional ohne Wert → leerer String eingesetzt, NICHT in missingRequired', () => {
    const tpl = 'Header\n\n{{HINWEISE}}\n\nFooter';
    const result = fillTemplateVariables(tpl, {});
    expect(result.filled).toBe('Header\n\n\n\nFooter');
    expect(result.missingRequired).toEqual([]);
  });

  it('Auto-Variable mit leerem Wert wird als leerer String eingesetzt', () => {
    const tpl = 'Phase: {{CURRENT_PHASE_FILE}}';
    const result = fillTemplateVariables(tpl, { CURRENT_PHASE_FILE: '' });
    expect(result.filled).toBe('Phase: ');
  });

  it('Unbekannte Tokens bleiben als Platzhalter und landen in unknownTokens', () => {
    const tpl = '{{FEATURE_NAME}} {{UNBEKANNT}} {{TYPO}}';
    const result = fillTemplateVariables(tpl, { FEATURE_NAME: 'X' });
    expect(result.filled).toBe('X {{UNBEKANNT}} {{TYPO}}');
    expect(result.unknownTokens).toEqual(['UNBEKANNT', 'TYPO']);
    expect(result.missingRequired).toEqual([]);
  });

  it('Doppelt vorkommende Variablen werden alle ersetzt, aber nur einmal in missingRequired gelistet', () => {
    const tpl = '{{AUFGABE}} ... {{AUFGABE}} ... {{AUFGABE}}';
    const result = fillTemplateVariables(tpl, {});
    expect(result.filled).toBe('{{AUFGABE}} ... {{AUFGABE}} ... {{AUFGABE}}');
    expect(result.missingRequired).toEqual(['AUFGABE']);
  });
});

describe('buildAutoVariables', () => {
  it('formatiert Datum als YYYY-MM-DD', () => {
    const result = buildAutoVariables({
      projectName: 'X',
      nextSeasonNumber: 1,
      currentPhaseFile: null,
      date: new Date(2026, 4, 10), // 10. Mai 2026 (Monat ist 0-basiert)
    });
    expect(result.DATUM).toBe('2026-05-10');
  });

  it('NEXT_SEASON_NR = "" wenn null (z.B. Bug-Session ohne Counter)', () => {
    const result = buildAutoVariables({
      projectName: 'X',
      nextSeasonNumber: null,
      currentPhaseFile: 'docs/PHASE1.md',
      date: new Date(),
    });
    expect(result.NEXT_SEASON_NR).toBe('');
    expect(result.CURRENT_PHASE_FILE).toBe('docs/PHASE1.md');
  });

  it('CURRENT_PHASE_FILE = "" wenn null', () => {
    const result = buildAutoVariables({
      projectName: 'X',
      nextSeasonNumber: 5,
      currentPhaseFile: null,
      date: new Date(),
    });
    expect(result.CURRENT_PHASE_FILE).toBe('');
  });

  it('Phase-2-Season-4-Variablen sind "" ohne serverAutoVars', () => {
    const result = buildAutoVariables({
      projectName: 'X',
      nextSeasonNumber: 1,
      currentPhaseFile: null,
      date: new Date(),
    });
    expect(result.LETZTE_SEASON_NAME).toBe('');
    expect(result.TECH_SCHULDEN_RELEVANT).toBe('');
    expect(result.LETZTE_ENTSCHEIDUNGEN).toBe('');
  });

  it('Phase-2-Season-4-Variablen werden aus serverAutoVars uebernommen', () => {
    const result = buildAutoVariables({
      projectName: 'X',
      nextSeasonNumber: 1,
      currentPhaseFile: null,
      date: new Date(),
      serverAutoVars: {
        letzte_season_name: 'Phase 2 Season 3: Trigger-Phrasen',
        tech_schulden_relevant: '- Schuld A\n  Bereich: x',
        letzte_entscheidungen: '- Entscheidung A',
      },
    });
    expect(result.LETZTE_SEASON_NAME).toBe('Phase 2 Season 3: Trigger-Phrasen');
    expect(result.TECH_SCHULDEN_RELEVANT).toBe('- Schuld A\n  Bereich: x');
    expect(result.LETZTE_ENTSCHEIDUNGEN).toBe('- Entscheidung A');
  });
});
