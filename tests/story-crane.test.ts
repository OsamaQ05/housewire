import { describe, expect, it } from 'vitest';
import { craneStateSchema, createCraneState, isCraneSolved, reduceCraneState } from '../src/features/story-rooms/activities/crane';
import type { ActivityMove } from '../src/features/story-rooms/activities/contracts';

export const CRANE_SOLUTION: ActivityMove[] = [
  { control: 0, command: 'travel', value: 1 },
  { control: 1, command: 'hoist', value: 0 },
  { control: 3, command: 'grip' },
  { control: 1, command: 'hoist', value: 2 },
  { control: 2, command: 'bridge', value: 1 },
  { control: 0, command: 'travel', value: 5 },
  { control: 2, command: 'bridge', value: 0 },
  { control: 1, command: 'hoist', value: 0 },
  { control: 3, command: 'grip' },
];

describe('After Hours shared crane', () => {
  it('needs all four mechanisms and physically delivers a parcel', () => {
    let state = createCraneState();
    for (const move of CRANE_SOLUTION) {
      state = reduceCraneState(state, move);
      expect(craneStateSchema.safeParse(state).success).toBe(true);
    }
    expect(isCraneSolved(state)).toBe(true);
    for (let control = 0; control < 4; control++) {
      const partial = CRANE_SOLUTION.filter(move => move.control !== control).reduce(reduceCraneState, createCraneState());
      expect(isCraneSolved(partial)).toBe(false);
    }
  });
  it('rejects invalid commands, positions and cross-control verbs', () => {
    const initial = createCraneState();
    for (const move of [{ control: 1, command: 'travel', value: 5 }, { control: 0, command: 'travel', value: 99 }, { control: 3, command: 'grip', value: 1 }, { control: 2, command: 'bridge', value: NaN }]) expect(reduceCraneState(initial, move)).toBe(initial);
  });
  it('shows collisions without teleporting through the closed crossing', () => {
    const state = reduceCraneState(createCraneState(), { control: 0, command: 'travel', value: 5 });
    expect(state.x).toBe(0);
    expect(state.feedback).toBe('closed-gate');
  });
  it('will not scrape a parcel along the bench or drop it in midair', () => {
    let state = CRANE_SOLUTION.slice(0, 3).reduce(reduceCraneState, createCraneState());
    state = reduceCraneState(state, { control: 0, command: 'travel', value: 2 });
    expect(state.feedback).toBe('lift-first');
    state = reduceCraneState(state, { control: 1, command: 'hoist', value: 2 });
    state = reduceCraneState(state, { control: 3, command: 'grip' });
    expect(state.feedback).toBe('lower-first');
    expect(state.carrying).toBe(true);
  });
  it('supports either safe clearance height instead of one magic configuration', () => {
    const highRoute = CRANE_SOLUTION.map(move => move.command === 'hoist' && move.value === 2 ? { ...move, value: 3 } : move);
    expect(isCraneSolved(highRoute.reduce(reduceCraneState, createCraneState()))).toBe(true);
  });
  it('schema rejects impossible completion and floating parcel state', () => {
    expect(craneStateSchema.safeParse({ ...createCraneState(), delivered: true }).success).toBe(false);
    expect(craneStateSchema.safeParse({ ...createCraneState(), carrying: true }).success).toBe(false);
  });
});
