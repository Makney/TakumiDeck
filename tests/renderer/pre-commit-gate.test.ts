import { describe, it, expect } from 'vitest';
import { canSendCommitTrigger } from '../../src/renderer/components/preCommitGate';

// Phase-2 Season-29.5: Tests fuer das Send-Gate im PreCommitModal. Der Gate
// muss alle Phase-1-Bedingungen unveraendert erfuellen UND den neuen
// Sensitive-Confirm-Schritt addieren.

function baseInput() {
  return {
    hasGit: true,
    loading: false,
    loadError: null as string | null,
    hasActiveTerminal: true,
    changedFileCount: 3,
    sensitiveFileCount: 0,
    sensitiveConfirmed: false,
    sent: false,
  };
}

describe('canSendCommitTrigger', () => {
  it('Happy Path: alle Bedingungen erfuellt → true', () => {
    expect(canSendCommitTrigger(baseInput())).toBe(true);
  });

  it('blockt ohne Git-Repo', () => {
    expect(canSendCommitTrigger({ ...baseInput(), hasGit: false })).toBe(false);
  });

  it('blockt waehrend des git-status-Loadings', () => {
    expect(canSendCommitTrigger({ ...baseInput(), loading: true })).toBe(false);
  });

  it('blockt bei git-status-Fehler', () => {
    expect(
      canSendCommitTrigger({ ...baseInput(), loadError: 'ENOENT' }),
    ).toBe(false);
  });

  it('blockt ohne aktive Terminal-Session', () => {
    expect(
      canSendCommitTrigger({ ...baseInput(), hasActiveTerminal: false }),
    ).toBe(false);
  });

  it('blockt bei sauberem Working-Tree (changedFileCount=0)', () => {
    expect(
      canSendCommitTrigger({ ...baseInput(), changedFileCount: 0 }),
    ).toBe(false);
  });

  it('blockt nachdem schon gesendet wurde', () => {
    expect(canSendCommitTrigger({ ...baseInput(), sent: true })).toBe(false);
  });

  it('blockt bei sensitive Files ohne Confirm-Haekchen', () => {
    expect(
      canSendCommitTrigger({
        ...baseInput(),
        sensitiveFileCount: 2,
        sensitiveConfirmed: false,
      }),
    ).toBe(false);
  });

  it('entsperrt bei sensitive Files mit Confirm-Haekchen', () => {
    expect(
      canSendCommitTrigger({
        ...baseInput(),
        sensitiveFileCount: 2,
        sensitiveConfirmed: true,
      }),
    ).toBe(true);
  });

  it('sensitiveConfirmed ohne sensitive Files aendert nichts', () => {
    // Vorgenommenes Haekchen darf den Send-Gate nicht erst gegen ein
    // anderes Gate (sent/loading/...) entsperren.
    expect(
      canSendCommitTrigger({
        ...baseInput(),
        sensitiveFileCount: 0,
        sensitiveConfirmed: true,
        sent: true,
      }),
    ).toBe(false);
  });
});
