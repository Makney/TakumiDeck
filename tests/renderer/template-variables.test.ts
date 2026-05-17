import { describe, it, expect } from 'vitest';
import type { ClaudeMdFrontmatter, ProjectRow, TemplateSchema } from '../../src/shared/types';
import {
  LEGACY_TEMPLATE_SCHEMA,
  buildResolverContext,
  collectServerAutoPaths,
  fillTemplateVariables,
  findVariablesInTemplate,
  resolveAutoPath,
  type ResolverContext,
} from '../../src/renderer/components/templateVariables';

// Phase-2 Season-23: Schema-aware Variable-Filling. Alte hartcodierte API
// ist weg; die Tests decken die drei zentralen Pfade ab:
//   - findVariablesInTemplate (Token-Discovery im Body, unveraendert)
//   - resolveAutoPath (Pfad-Walk auf Project / claude_md / server-Bundle)
//   - fillTemplateVariables (Auto + Input + literal-Fallback)
// Plus die Helper buildResolverContext und collectServerAutoPaths.

const PROJECT: ProjectRow = {
  id: 'p1',
  name: 'TanaLib',
  path: 'C:\\Projekte\\TanaLib',
  added_manually: 0,
  has_git: 1,
  next_season_number: 7,
  created_at: 1700000000000,
  session_count: 12,
};

const FRONTMATTER: ClaudeMdFrontmatter = {
  workbench: {
    project_name: 'TanaLib',
    current_phase_file: 'docs/roadmap/PHASE2.md',
    current_version: '0.1.4',
    trigger_phrases: {
      docs_update: 'wurde richtig implementiert',
      commit: 'commit',
      fix: 'fix it',
      release_artifacts: 'release artefakte',
      tag_push: 'tag und push',
    },
  },
};

function buildCtx(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return buildResolverContext({
    project: PROJECT,
    frontmatter: FRONTMATTER,
    date: new Date(2026, 4, 17),
    serverAutoVars: {},
    userInputs: {},
    ...overrides,
  } as Parameters<typeof buildResolverContext>[0]);
}

describe('findVariablesInTemplate', () => {
  it('liefert alle eindeutigen Tokens in Vorkommens-Reihenfolge', () => {
    const tpl = '{{BUG_TITEL}} → {{SYMPTOM}}\n\n{{BUG_TITEL}}\n{{ERWARTET}}';
    expect(findVariablesInTemplate(tpl)).toEqual([
      'BUG_TITEL',
      'SYMPTOM',
      'ERWARTET',
    ]);
  });

  it('matcht NUR Großbuchstaben + Underscore', () => {
    const tpl = '{{lowercase}} {{Mixed_Case}} {{1234}} {{NORMAL_TOKEN}}';
    expect(findVariablesInTemplate(tpl)).toEqual(['NORMAL_TOKEN']);
  });
});

describe('resolveAutoPath', () => {
  const ctx = buildCtx();

  it('today → YYYY-MM-DD aus ctx.date', () => {
    expect(resolveAutoPath('today', ctx)).toBe('2026-05-17');
  });

  it('project.name nutzt frontmatter.workbench.project_name', () => {
    expect(resolveAutoPath('project.name', ctx)).toBe('TanaLib');
  });

  it('project.next_season_number gibt Zahl als String', () => {
    expect(resolveAutoPath('project.next_season_number', ctx)).toBe('7');
  });

  it('claude_md.workbench.current_version liest verschachteltes Feld', () => {
    expect(resolveAutoPath('claude_md.workbench.current_version', ctx)).toBe('0.1.4');
  });

  it('claude_md.workbench.trigger_phrases.fix liest tiefere Pfade', () => {
    expect(resolveAutoPath('claude_md.workbench.trigger_phrases.fix', ctx)).toBe('fix it');
  });

  it('fehlendes Frontmatter-Feld → undefined (Token bleibt literal)', () => {
    const noVersionCtx = buildCtx({
      frontmatter: {
        workbench: {
          project_name: 'X',
          trigger_phrases: {
            docs_update: 'a',
            commit: 'b',
          },
        },
      },
    });
    expect(resolveAutoPath('claude_md.workbench.current_version', noVersionCtx)).toBeUndefined();
  });

  it('frontmatter komplett null → undefined statt Crash', () => {
    const nullCtx = buildCtx({ frontmatter: null });
    expect(resolveAutoPath('claude_md.workbench.current_version', nullCtx)).toBeUndefined();
  });

  it('server-Pfade kommen aus serverAutoVars-Map', () => {
    const ctxWithServer = buildCtx({
      serverAutoVars: { 'db.last_completed_feature_session': 'Phase 2 Season 5: Foo' },
    });
    expect(
      resolveAutoPath('db.last_completed_feature_session', ctxWithServer),
    ).toBe('Phase 2 Season 5: Foo');
  });

  it('server-Pfad fehlt im Bundle → undefined', () => {
    expect(resolveAutoPath('docs.tech_schulden_top_n', ctx)).toBeUndefined();
  });

  it('unbekannter Pfad → undefined', () => {
    expect(resolveAutoPath('something.weird', ctx)).toBeUndefined();
  });
});

describe('fillTemplateVariables', () => {
  it('Auto-Vars werden aus dem Schema aufgeloest', () => {
    const schema: TemplateSchema = {
      variables: { DATUM: { auto: 'today' }, PROJEKT_NAME: { auto: 'project.name' } },
    };
    const result = fillTemplateVariables(
      'Projekt: {{PROJEKT_NAME}} · Datum: {{DATUM}}',
      schema,
      buildCtx(),
    );
    expect(result.filled).toBe('Projekt: TanaLib · Datum: 2026-05-17');
    expect(result.missingRequired).toEqual([]);
  });

  it('Input-Var (Pflicht) ohne Wert → literal + missingRequired', () => {
    const schema: TemplateSchema = {
      variables: { SYMPTOM: { input: 'textarea', required: true } },
    };
    const result = fillTemplateVariables('Symptom: {{SYMPTOM}}', schema, buildCtx());
    expect(result.filled).toBe('Symptom: {{SYMPTOM}}');
    expect(result.missingRequired).toEqual(['SYMPTOM']);
  });

  it('Input-Var (Pflicht) whitespace-only zaehlt als leer', () => {
    const schema: TemplateSchema = {
      variables: { SYMPTOM: { input: 'text', required: true } },
    };
    const result = fillTemplateVariables(
      '{{SYMPTOM}}',
      schema,
      buildCtx({ userInputs: { SYMPTOM: '   ' } }),
    );
    expect(result.missingRequired).toEqual(['SYMPTOM']);
    expect(result.filled).toBe('{{SYMPTOM}}');
  });

  it('Input-Var (Optional) ohne Wert → leerer String, NICHT in missingRequired', () => {
    const schema: TemplateSchema = {
      variables: { HINWEISE: { input: 'textarea' } },
    };
    const result = fillTemplateVariables(
      'Header\n\n{{HINWEISE}}\n\nFooter',
      schema,
      buildCtx(),
    );
    expect(result.filled).toBe('Header\n\n\n\nFooter');
    expect(result.missingRequired).toEqual([]);
  });

  it('Input-Var mit Wert wird eingesetzt', () => {
    const schema: TemplateSchema = {
      variables: { BUG_TITEL: { input: 'text', required: true } },
    };
    const result = fillTemplateVariables(
      'Bug: {{BUG_TITEL}}',
      schema,
      buildCtx({ userInputs: { BUG_TITEL: 'Scanner ignoriert renamed files' } }),
    );
    expect(result.filled).toBe('Bug: Scanner ignoriert renamed files');
  });

  it('Auto-Var ohne aufloesbare Quelle → literal stehen lassen (kein leerer String)', () => {
    const schema: TemplateSchema = {
      variables: { CURRENT_VERSION: { auto: 'claude_md.workbench.current_version' } },
    };
    const noVersionCtx = buildCtx({
      frontmatter: {
        workbench: {
          project_name: 'X',
          trigger_phrases: { docs_update: 'a', commit: 'b' },
        },
      },
    });
    const result = fillTemplateVariables(
      'v{{CURRENT_VERSION}}',
      schema,
      noVersionCtx,
    );
    // Bewusst literal, damit der User die fehlende Quelle sieht statt einer
    // stummen Luecke wie "v".
    expect(result.filled).toBe('v{{CURRENT_VERSION}}');
  });

  it('Token ohne Schema-Eintrag bleibt literal (Kickoff-Tokens als Agent-Anweisung)', () => {
    const schema: TemplateSchema = { variables: {} };
    const result = fillTemplateVariables(
      '{{KURZBESCHREIBUNG}} → {{STACK}}',
      schema,
      buildCtx(),
    );
    expect(result.filled).toBe('{{KURZBESCHREIBUNG}} → {{STACK}}');
    expect(result.missingRequired).toEqual([]);
  });

  it('Doppelt vorkommende Pflicht-Variablen werden alle ersetzt, aber nur einmal in missingRequired', () => {
    const schema: TemplateSchema = {
      variables: { AUFGABE: { input: 'textarea', required: true } },
    };
    const result = fillTemplateVariables(
      '{{AUFGABE}} ... {{AUFGABE}} ... {{AUFGABE}}',
      schema,
      buildCtx(),
    );
    expect(result.filled).toBe('{{AUFGABE}} ... {{AUFGABE}} ... {{AUFGABE}}');
    expect(result.missingRequired).toEqual(['AUFGABE']);
  });
});

describe('collectServerAutoPaths', () => {
  it('liefert nur db.*/docs.*-Pfade aus dem Schema, die im Body verwendet werden', () => {
    const schema: TemplateSchema = {
      variables: {
        DATUM: { auto: 'today' },
        LETZTE_SEASON_NAME: { auto: 'db.last_completed_feature_session' },
        TECH_SCHULDEN_RELEVANT: { auto: 'docs.tech_schulden_top_n' },
        LETZTE_ENTSCHEIDUNGEN: { auto: 'docs.entscheidungen_top_n' },
      },
    };
    // Body verwendet nur LETZTE_SEASON_NAME — die anderen Server-Pfade
    // duerfen NICHT im resolve-auto-vars-Request landen.
    const paths = collectServerAutoPaths(schema, ['DATUM', 'LETZTE_SEASON_NAME']);
    expect(paths).toEqual(['db.last_completed_feature_session']);
  });

  it('leeres Array wenn nur today/project/claude_md-Pfade im Schema', () => {
    const schema: TemplateSchema = {
      variables: {
        DATUM: { auto: 'today' },
        CURRENT_VERSION: { auto: 'claude_md.workbench.current_version' },
      },
    };
    expect(collectServerAutoPaths(schema, ['DATUM', 'CURRENT_VERSION'])).toEqual([]);
  });
});

describe('LEGACY_TEMPLATE_SCHEMA', () => {
  it('bildet die alten Hardcoded-Listen ab (Bestands-Templates ohne Frontmatter)', () => {
    expect(LEGACY_TEMPLATE_SCHEMA.variables.FEATURE_NAME).toEqual({
      input: 'text',
      label: 'Feature',
      required: true,
    });
    expect(LEGACY_TEMPLATE_SCHEMA.variables.AUFGABE).toEqual({
      input: 'textarea',
      label: 'Aufgabe',
      required: true,
    });
    expect(LEGACY_TEMPLATE_SCHEMA.variables.PROJEKT_NAME).toEqual({
      auto: 'project.name',
    });
    expect(LEGACY_TEMPLATE_SCHEMA.variables.DATUM).toEqual({ auto: 'today' });
  });
});

describe('buildResolverContext', () => {
  it('faellt auf displayProjectName zurueck, wenn frontmatter.project_name fehlt', () => {
    const ctx = buildResolverContext({
      project: { ...PROJECT, name: 'fallback-name' },
      frontmatter: null,
      date: new Date(),
      serverAutoVars: {},
      userInputs: {},
    });
    // displayProjectName liefert den Project-Namen direkt.
    expect(ctx.projectDisplayName).toBe('fallback-name');
  });
});
