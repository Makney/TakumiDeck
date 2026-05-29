import { describe, it, expect, vi } from 'vitest';
import { fetchAvailableModels } from '../../src/main/models/fetchAvailableModels';

// Phase-2 Season-34 (Variante D): Abruf der verfuegbaren Modelle gegen die
// Anthropic Models-API. `fetch` ist injizierbar — kein echtes Netzwerk im Test.
// Antwort-Parsing selbst ist in tests/shared/models.test.ts abgedeckt; hier
// geht es um die drei Ausgaenge (kein Key / Erfolg / HTTP-Fehler) und die
// korrekten Request-Header.

// Minimaler Response-Stub, der nur die von fetchAvailableModels genutzten
// Felder traegt.
function makeResponse(init: { ok: boolean; status?: number; json?: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.json ?? {},
  } as unknown as Response;
}

describe('fetchAvailableModels', () => {
  it('liefert available=false ohne API-Key (Abo-/OAuth-Pfad), ohne fetch zu rufen', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchAvailableModels({ apiKey: undefined, fetchImpl });
    expect(result).toEqual({ available: false, reason: 'no-api-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('behandelt leeren/whitespace-Key wie keinen Key', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchAvailableModels({ apiKey: '   ', fetchImpl });
    expect(result).toEqual({ available: false, reason: 'no-api-key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('parst die Modelle bei Erfolg und sendet x-api-key + anthropic-version', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return makeResponse({
        ok: true,
        json: {
          data: [
            { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' },
            { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
          ],
        },
      });
    }) as unknown as typeof fetch;

    const result = await fetchAvailableModels({ apiKey: 'sk-test-123', fetchImpl });

    expect(result).toEqual({
      available: true,
      models: [
        { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
        { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
      ],
    });

    expect(capturedUrl).toContain('/v1/models');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-123');
    expect(headers['anthropic-version']).toBeTruthy();
  });

  it('wirft bei abgelehntem Key (401) mit klarer Meldung', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 401 }));
    await expect(
      fetchAvailableModels({ apiKey: 'sk-bad', fetchImpl }),
    ).rejects.toThrow(/abgelehnt|401/);
  });

  it('wirft bei sonstigem HTTP-Fehler (z.B. 500)', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 500 }));
    await expect(
      fetchAvailableModels({ apiKey: 'sk-test', fetchImpl }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
