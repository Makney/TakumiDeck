import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_MODEL_OPTIONS,
  buildModelOptions,
  diffNewModels,
  parseAnthropicModelsResponse,
  validateNewCustomModel,
} from '../../src/shared/models';
import type { CustomModel, FetchedModel } from '../../src/shared/types';

// Phase-2 Season-34: gemeinsamer Modell-Helper fuer SettingsModal +
// NewSessionModal. Built-ins + Custom werden vereinigt; ID-Konflikt zwischen
// Custom und Built-in laesst das Custom-Label den Built-in-Eintrag uebernehmen.

describe('buildModelOptions', () => {
  it('liefert die fuenf Built-ins in fester Reihenfolge bei leerer Custom-Liste', () => {
    const out = buildModelOptions([]);
    expect(out.map((m) => m.id)).toEqual(BUILT_IN_MODEL_OPTIONS.map((m) => m.id));
    expect(out.every((m) => m.isCustom === false)).toBe(true);
  });

  it('haengt Custom-Eintraege nach den Built-ins an mit isCustom=true', () => {
    const customs: CustomModel[] = [
      { id: 'claude-future-1', label: 'Future 1' },
      { id: 'claude-future-2', label: 'Future 2' },
    ];
    const out = buildModelOptions(customs);
    expect(out).toHaveLength(BUILT_IN_MODEL_OPTIONS.length + 2);
    const lastTwo = out.slice(-2);
    expect(lastTwo).toEqual([
      { id: 'claude-future-1', label: 'Future 1', isCustom: true },
      { id: 'claude-future-2', label: 'Future 2', isCustom: true },
    ]);
  });

  it('uebernimmt Custom-Label fuer Built-in-ID-Kollision (Override)', () => {
    const customs: CustomModel[] = [
      { id: 'claude-sonnet-4-6', label: 'Mein Sonnet' },
    ];
    const out = buildModelOptions(customs);
    const sonnet = out.find((m) => m.id === 'claude-sonnet-4-6');
    expect(sonnet?.label).toBe('Mein Sonnet');
    // Bleibt als Built-in markiert — Override betrifft nur das Label.
    expect(sonnet?.isCustom).toBe(false);
    // Keine Duplikat-Zeile am Ende.
    expect(out.filter((m) => m.id === 'claude-sonnet-4-6')).toHaveLength(1);
  });

  it('skipped leere oder doppelte Custom-IDs (Defense-in-Depth)', () => {
    const customs: CustomModel[] = [
      { id: '', label: 'Leer' },
      { id: '   ', label: 'Whitespace' },
      { id: 'claude-new', label: 'Neu' },
      { id: 'claude-new', label: 'Duplikat' },
    ];
    const out = buildModelOptions(customs);
    const customIds = out.filter((m) => m.isCustom).map((m) => m.id);
    expect(customIds).toEqual(['claude-new']);
  });

  it('faellt fuer Custom mit leerem Label auf die ID zurueck', () => {
    const customs: CustomModel[] = [{ id: 'claude-x', label: '   ' }];
    const out = buildModelOptions(customs);
    expect(out.find((m) => m.id === 'claude-x')?.label).toBe('claude-x');
  });
});

describe('validateNewCustomModel', () => {
  const baseExisting = BUILT_IN_MODEL_OPTIONS.map((m) => m.id);

  it('akzeptiert valide neue Eingabe', () => {
    const result = validateNewCustomModel({
      id: 'claude-future',
      label: 'Future',
      existingIds: baseExisting,
    });
    expect(result).toBeNull();
  });

  it('lehnt leere ID ab', () => {
    expect(
      validateNewCustomModel({
        id: '   ',
        label: 'X',
        existingIds: [],
      }),
    ).toBe('empty_id');
  });

  it('lehnt leeren Anzeigenamen ab', () => {
    expect(
      validateNewCustomModel({
        id: 'claude-x',
        label: '   ',
        existingIds: [],
      }),
    ).toBe('empty_label');
  });

  it('lehnt Duplikat gegen Built-in ab', () => {
    expect(
      validateNewCustomModel({
        id: 'claude-sonnet-4-6',
        label: 'Dup',
        existingIds: baseExisting,
      }),
    ).toBe('duplicate_id');
  });

  it('lehnt Duplikat gegen bestehendes Custom ab', () => {
    expect(
      validateNewCustomModel({
        id: 'claude-future',
        label: 'Dup',
        existingIds: [...baseExisting, 'claude-future'],
      }),
    ).toBe('duplicate_id');
  });
});

// Phase-2 Season-34 (Variante D): Auto-Refresh gegen die Anthropic Models-API.

describe('parseAnthropicModelsResponse', () => {
  it('parst das Standard-Shape { data: [...] } zu id + displayName', () => {
    const json = {
      data: [
        { type: 'model', id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', created_at: 'x' },
        { type: 'model', id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
      ],
      has_more: false,
    };
    expect(parseAnthropicModelsResponse(json)).toEqual([
      { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
      { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
    ]);
  });

  it('faellt auf die ID zurueck, wenn display_name fehlt oder leer ist', () => {
    const json = {
      data: [
        { id: 'claude-x' },
        { id: 'claude-y', display_name: '   ' },
      ],
    };
    expect(parseAnthropicModelsResponse(json)).toEqual([
      { id: 'claude-x', displayName: 'claude-x' },
      { id: 'claude-y', displayName: 'claude-y' },
    ]);
  });

  it('ueberspringt Eintraege ohne String-ID und Duplikate', () => {
    const json = {
      data: [
        { id: 'claude-a', display_name: 'A' },
        { id: 42, display_name: 'Zahl' },
        { display_name: 'kein id' },
        null,
        'string-statt-objekt',
        { id: 'claude-a', display_name: 'A-Dup' },
      ],
    };
    expect(parseAnthropicModelsResponse(json)).toEqual([
      { id: 'claude-a', displayName: 'A' },
    ]);
  });

  it('liefert [] bei Muell-Input (kein Objekt / kein data-Array)', () => {
    expect(parseAnthropicModelsResponse(null)).toEqual([]);
    expect(parseAnthropicModelsResponse('nope')).toEqual([]);
    expect(parseAnthropicModelsResponse({ data: 'nope' })).toEqual([]);
    expect(parseAnthropicModelsResponse({})).toEqual([]);
  });
});

describe('diffNewModels', () => {
  const fetched: FetchedModel[] = [
    { id: 'claude-opus-4-8', displayName: 'Opus 4.8' },
    { id: 'claude-future-9', displayName: 'Future 9' },
    { id: 'claude-custom-1', displayName: 'Mein Custom' },
  ];

  it('filtert Built-in- und Custom-IDs heraus, behaelt echte Neuzugaenge', () => {
    const known = [...BUILT_IN_MODEL_OPTIONS.map((m) => m.id), 'claude-custom-1'];
    expect(diffNewModels(fetched, known)).toEqual([
      { id: 'claude-future-9', displayName: 'Future 9' },
    ]);
  });

  it('liefert alle, wenn nichts bekannt ist', () => {
    expect(diffNewModels(fetched, [])).toEqual(fetched);
  });

  it('ignoriert leere/whitespace-IDs in der Bekannt-Menge', () => {
    expect(diffNewModels(fetched, ['', '   '])).toEqual(fetched);
  });
});
