import { describe, it, expect } from 'vitest';
import { ok, err, errFromUnknown } from '@shared/result';

describe('Result-Helper', () => {
  it('ok() liefert ok=true mit data', () => {
    const r = ok(42);
    expect(r).toEqual({ ok: true, data: 42 });
  });

  it('err() ohne Code lässt code-Feld weg', () => {
    const r = err('Boom');
    expect(r).toEqual({ ok: false, error: 'Boom' });
    expect('code' in r).toBe(false);
  });

  it('err() mit Code setzt das Feld', () => {
    const r = err('Boom', 'X1');
    expect(r).toEqual({ ok: false, error: 'Boom', code: 'X1' });
  });

  it('errFromUnknown() extrahiert Error.message', () => {
    const r = errFromUnknown(new Error('kaputt'), 'C1');
    expect(r).toEqual({ ok: false, error: 'kaputt', code: 'C1' });
  });

  it('errFromUnknown() stringifiziert Nicht-Errors', () => {
    const r = errFromUnknown('reiner string');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('reiner string');
  });
});
