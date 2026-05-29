// Phase-2 Season-34 (Variante D): Abruf der bei Anthropic verfuegbaren Modelle.
//
// Fragt den offiziellen `GET /v1/models`-Endpoint ab und liefert die Liste der
// Modelle (ID + Anzeigename). Der Endpoint verlangt einen API-Key via
// `x-api-key`; Abo-/OAuth-User haben den i.d.R. nicht gesetzt — in dem Fall
// kommt `available=false` zurueck (kein Fehler, sondern ein Hinweis-Zustand,
// den die UI in „bitte manuell pflegen" uebersetzt).
//
// Die `fetch`-Implementierung und der API-Key sind injizierbar, damit das Modul
// ohne echtes Netzwerk testbar ist. Antwort-Parsing liegt als Pure-Helper in
// src/shared/models.ts (`parseAnthropicModelsResponse`).

import { parseAnthropicModelsResponse } from '@shared/models';
import type { ModelFetchResult } from '@shared/types';

const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models?limit=100';
const ANTHROPIC_VERSION = '2023-06-01';

export interface FetchAvailableModelsDeps {
  // Roh aus process.env.ANTHROPIC_API_KEY — leer/undefined ⇒ available=false.
  apiKey: string | undefined;
  // Optional injizierbar fuer Tests; default ist das globale fetch (Node 24).
  fetchImpl?: typeof fetch;
}

export async function fetchAvailableModels(
  deps: FetchAvailableModelsDeps,
): Promise<ModelFetchResult> {
  const key = deps.apiKey?.trim();
  if (!key) {
    return { available: false, reason: 'no-api-key' };
  }

  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(ANTHROPIC_MODELS_URL, {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
  });

  if (!res.ok) {
    // Haeufige Faelle in User-freundliche Meldungen uebersetzen; der IPC-Handler
    // faengt das `throw` und verpackt es als IpcResult.ok=false.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'API-Key wurde abgelehnt (HTTP ' + res.status + '). Stimmt ANTHROPIC_API_KEY?',
      );
    }
    throw new Error('Anthropic-API antwortete mit HTTP ' + res.status + '.');
  }

  const json: unknown = await res.json();
  const models = parseAnthropicModelsResponse(json);
  return { available: true, models };
}
