import { describe, it, expect } from 'vitest';
import {
  aggregateProjectStatusCounts,
  pickAttentionMarker,
} from '../../src/renderer/components/projectStatusCounts';
import type { SessionStatus } from '../../src/shared/types';

// Phase-2 Season-32: Aggregation der Tab-Status pro Projekt fuer die
// Sidebar-Marker. running/waiting/attention sind drei separate Buckets,
// permission-prompt wird in waiting kanalisiert, interrupted/error in attention.

function tab(projectId: string, status: SessionStatus) {
  return { projectId, status };
}

describe('aggregateProjectStatusCounts', () => {
  it('zaehlt running pro Projekt', () => {
    const result = aggregateProjectStatusCounts([
      tab('A', 'running'),
      tab('A', 'running'),
      tab('B', 'running'),
    ]);
    expect(result.get('A')).toEqual({ running: 2, waiting: 0, attention: 0 });
    expect(result.get('B')).toEqual({ running: 1, waiting: 0, attention: 0 });
  });

  it('mappt waiting und permission-prompt beide auf den waiting-Bucket', () => {
    const result = aggregateProjectStatusCounts([
      tab('A', 'waiting'),
      tab('A', 'permission-prompt'),
    ]);
    expect(result.get('A')).toEqual({ running: 0, waiting: 2, attention: 0 });
  });

  it('mappt interrupted und error beide auf den attention-Bucket', () => {
    const result = aggregateProjectStatusCounts([
      tab('A', 'interrupted'),
      tab('A', 'error'),
    ]);
    expect(result.get('A')).toEqual({ running: 0, waiting: 0, attention: 2 });
  });

  it('ignoriert completed, archived und idle (keine Marker-Trigger)', () => {
    const result = aggregateProjectStatusCounts([
      tab('A', 'completed'),
      tab('A', 'archived'),
      tab('A', 'idle'),
    ]);
    expect(result.get('A')).toBeUndefined();
  });

  it('kombiniert alle drei Buckets im selben Projekt', () => {
    const result = aggregateProjectStatusCounts([
      tab('A', 'running'),
      tab('A', 'waiting'),
      tab('A', 'interrupted'),
      tab('A', 'permission-prompt'),
      tab('A', 'error'),
    ]);
    expect(result.get('A')).toEqual({ running: 1, waiting: 2, attention: 2 });
  });
});

describe('pickAttentionMarker', () => {
  it('liefert null fuer undefined Counts', () => {
    expect(pickAttentionMarker(undefined)).toBeNull();
  });

  it('liefert null wenn nur running > 0', () => {
    expect(pickAttentionMarker({ running: 3, waiting: 0, attention: 0 })).toBeNull();
  });

  it('liefert waiting-Marker wenn waiting > 0 (auch wenn attention auch > 0)', () => {
    // Prioritaet: orange (waiting auf Input jetzt) schlaegt gelb (Resume offen).
    expect(pickAttentionMarker({ running: 0, waiting: 1, attention: 2 })).toEqual({
      kind: 'waiting',
      count: 1,
    });
  });

  it('liefert attention-Marker wenn nur attention > 0', () => {
    expect(pickAttentionMarker({ running: 1, waiting: 0, attention: 3 })).toEqual({
      kind: 'attention',
      count: 3,
    });
  });
});
