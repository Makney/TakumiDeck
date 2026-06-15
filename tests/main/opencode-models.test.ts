import { describe, it, expect } from 'vitest';
import { listOpencodeModels } from '../../src/main/opencode/listModels';

// Season 39 (Opencode): listOpencodeModels uebersetzt jeden Pfad (deaktiviert /
// Binary fehlt / Aufruf failt / Erfolg) in ein OpencodeModelsResult und wirft
// nie. Der Runner ist injizierbar, damit kein echtes opencode noetig ist.
//
// process.execPath ist garantiert ein existierender absoluter Pfad — damit
// kommt `resolveExecutable` durch (Absolut-Pfad → existence-check), ohne dass
// wirklich node ausgefuehrt wird (der Runner ist gemockt).
const EXISTING_BINARY = process.execPath;

describe('listOpencodeModels', () => {
  it('liefert disabled, wenn die Engine ausgeschaltet ist (Runner ungerufen)', () => {
    let called = false;
    const result = listOpencodeModels({
      enabled: false,
      binaryPath: EXISTING_BINARY,
      runner: () => {
        called = true;
        return '';
      },
    });
    expect(result).toEqual({ available: false, models: [], reason: 'disabled' });
    expect(called).toBe(false);
  });

  it('liefert not-found, wenn die Binary nicht aufloesbar ist', () => {
    const result = listOpencodeModels({
      enabled: true,
      binaryPath: 'C:/definitiv/nicht/vorhanden/opencode-xyz.cmd',
      runner: () => 'anthropic/claude-sonnet-4-5',
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('not-found');
  });

  it('liefert die geparsten Modelle bei Erfolg', () => {
    const result = listOpencodeModels({
      enabled: true,
      binaryPath: EXISTING_BINARY,
      runner: (_bin, args) => {
        expect(args).toEqual(['models']);
        return 'anthropic/claude-sonnet-4-5\nopenai/gpt-5\n';
      },
    });
    expect(result).toEqual({
      available: true,
      models: ['anthropic/claude-sonnet-4-5', 'openai/gpt-5'],
    });
  });

  it('liefert error, wenn opencode keine Modelle meldet', () => {
    const result = listOpencodeModels({
      enabled: true,
      binaryPath: EXISTING_BINARY,
      runner: () => '\n  \n',
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('error');
  });

  it('faengt einen werfenden Runner ab und meldet error', () => {
    const result = listOpencodeModels({
      enabled: true,
      binaryPath: EXISTING_BINARY,
      runner: () => {
        throw new Error('spawn ENOENT');
      },
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('error');
    expect(result.error).toContain('ENOENT');
  });
});
