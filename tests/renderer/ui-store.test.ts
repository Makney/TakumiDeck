import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../../src/renderer/stores/ui';

// Reset des Stores zwischen Tests — Zustand teilt eine globale Instanz.
beforeEach(() => {
  useUiStore.setState({ activeProjectId: null });
});

describe('useUiStore', () => {
  it('initial activeProjectId=null', () => {
    expect(useUiStore.getState().activeProjectId).toBeNull();
  });

  it('setActiveProject persistiert eine ID', () => {
    useUiStore.getState().setActiveProject('proj-1');
    expect(useUiStore.getState().activeProjectId).toBe('proj-1');
  });

  it('setActiveProject(null) räumt auf', () => {
    useUiStore.getState().setActiveProject('proj-1');
    useUiStore.getState().setActiveProject(null);
    expect(useUiStore.getState().activeProjectId).toBeNull();
  });
});
