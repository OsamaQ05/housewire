import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { ActivityMove } from '../src/features/story-rooms/activities/contracts';
import { CLOCKWORK_SOLUTION_MOVES, clockworkEndpoints, clockworkStateSchema, createClockworkState, isClockworkSolved, reduceClockworkState, simulateClockwork } from '../src/features/story-rooms/activities/clockwork';

describe('After Hours constructed clockwork machine', () => {
  it('assembles a real connected transmission using every owner', () => {
    let state = createClockworkState();
    for (const move of CLOCKWORK_SOLUTION_MOVES) {
      state = reduceClockworkState(state, move);
      expect(clockworkStateSchema.safeParse(state).success).toBe(true);
    }
    expect(isClockworkSolved(state)).toBe(true);
    expect(state.powered[8]).toBe(1);
    for (let control = 0; control < 4; control++) {
      const partial = CLOCKWORK_SOLUTION_MOVES.filter(move => move.control !== control && move.command !== 'run').reduce(reduceClockworkState, createClockworkState());
      expect(isClockworkSolved(reduceClockworkState(partial, { control: (control + 1) % 4, command: 'run' }))).toBe(false);
    }
  });
  it('accepts different routes and shuffled drive order instead of a stored answer', () => {
    const paths = [[0, 1, 2, 5, 8], [0, 1, 4, 5, 8], [0, 1, 4, 7, 8], [0, 3, 4, 5, 8], [0, 3, 4, 7, 8], [0, 3, 6, 7, 8]];
    for (const path of paths) for (const owners of [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2]]) {
      let state = createClockworkState();
      for (let step = 0; step < 4; step++) {
        const control = owners[step];
        const turn = path[step + 1] - path[step] === 1 ? 0 : 1;
        for (const move of [{ control, command: 'turn', value: turn }, { control, command: 'place', value: path[step] }, { control, command: 'belt', value: 0 }]) state = reduceClockworkState(state, move);
      }
      expect(reduceClockworkState(state, { control: 2, command: 'run' }).solved).toBe(true);
    }
  });
  it('animates actual disconnected and backwards states; free tests do not remove parts', () => {
    let state = reduceClockworkState(createClockworkState(), { control: 0, command: 'run' });
    expect(state.feedback).toBe('disconnected');
    expect(state.runs).toBe(1);
    state = CLOCKWORK_SOLUTION_MOVES.filter(move => move.command !== 'belt').reduce(reduceClockworkState, createClockworkState());
    expect(state.feedback).toBe('backwards');
    expect(state.powered[8]).toBe(-1);
    const before = state.parts;
    state = reduceClockworkState(state, { control: 1, command: 'run' });
    expect(state.parts).toBe(before);
    state = reduceClockworkState(state, { control: 0, command: 'belt', value: 1 });
    expect(reduceClockworkState(state, { control: 0, command: 'run' }).solved).toBe(true);
  });
  it('finds a mechanically conflicting loop', () => {
    const result = simulateClockwork([{ peg: 0, turn: 0, crossed: false }, { peg: 1, turn: 1, crossed: false }, { peg: 4, turn: 2, crossed: true }, { peg: 3, turn: 3, crossed: false }]);
    expect(result.jammed).toBe(true);
    expect(result.forward).toBe(false);
  });
  it('checks every crossed-belt combination of powered and unpowered four-drive loops', () => {
    for (const offset of [0, 1, 3, 4]) for (let mask = 0; mask < 16; mask++) {
      const pegs = [offset, offset + 1, offset + 4, offset + 3];
      const parts = pegs.map((peg, index) => ({ peg, turn: index, crossed: (mask & (1 << index)) !== 0 }));
      const odd = parts.filter(part => part.crossed).length % 2 === 1;
      const result = simulateClockwork(parts);
      expect(result.jammed).toBe(offset === 0 && odd);
      expect(result.forward).toBe(false);
    }
  });
  it('keeps random gameplay schema-valid, bounded and recoverable', () => {
    const move = fc.record({ control: fc.integer({ min: 0, max: 3 }), command: fc.constantFrom('place', 'turn', 'belt', 'remove', 'run'), value: fc.option(fc.integer({ min: -2, max: 11 }), { nil: undefined }) });
    fc.assert(fc.property(fc.array(move, { minLength: 10, maxLength: 160 }), moves => {
      let state = createClockworkState();
      for (const action of moves) {
        state = reduceClockworkState(state, action);
        expect(clockworkStateSchema.safeParse(state).success).toBe(true);
        expect(state.powered.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
      }
      if (state.solved) return;
      for (let control = 0; control < 4; control++) {
        state = reduceClockworkState(state, { control, command: 'remove' });
        state = reduceClockworkState(state, { control, command: 'turn', value: 0 });
        state = reduceClockworkState(state, { control, command: 'belt', value: control === 2 ? 1 : 0 });
      }
      expect(CLOCKWORK_SOLUTION_MOVES.reduce(reduceClockworkState, state).solved).toBe(true);
    }), { numRuns: 180, seed: 20260916 });
  });
  it('rejects invalid moves, off-board placement and overlapping frames', () => {
    const initial = createClockworkState();
    for (const move of [{ control: -1, command: 'place', value: 0 }, { control: 4, command: 'place', value: 0 }, { control: 0, command: 'place', value: 99 }, { control: 0, command: 'turn', value: 4 }, { control: 0, command: 'run', value: 1 }, { control: 0, command: 'belt', value: NaN }, { control: 0, command: 'fly' }]) expect(reduceClockworkState(initial, move)).toBe(initial);
    let state = reduceClockworkState(initial, { control: 0, command: 'place', value: 2 });
    expect(state.feedback).toBe('edge');
    expect(state.parts[0].peg).toBe(-1);
    state = reduceClockworkState(state, { control: 0, command: 'place', value: 0 });
    state = reduceClockworkState(state, { control: 1, command: 'place', value: 0 });
    expect(state.feedback).toBe('occupied');
    expect(state.parts[1].peg).toBe(-1);
  });
  it('can lift and reposition every part; every reachable layout stays recoverable', () => {
    let state = createClockworkState();
    for (let peg = 0; peg < 9; peg++) for (let turn = 0; turn < 4; turn++) for (let owner = 0; owner < 4; owner++) {
      const moves: ActivityMove[] = [{ control: owner, command: 'remove' }, { control: owner, command: 'turn', value: turn }, { control: owner, command: 'place', value: peg }, { control: owner, command: 'run' }];
      state = moves.reduce(reduceClockworkState, state);
      expect(clockworkStateSchema.safeParse(state).success).toBe(true);
      if (state.solved) state = createClockworkState();
    }
    for (let control = 0; control < 4; control++) state = reduceClockworkState(state, { control, command: 'remove' });
    expect(state.parts.every(part => part.peg === -1)).toBe(true);
    expect(CLOCKWORK_SOLUTION_MOVES.reduce(reduceClockworkState, { ...createClockworkState(), runs: state.runs }).solved).toBe(true);
  });
  it('latches success and rejects forged completion/snapshots', () => {
    const won = CLOCKWORK_SOLUTION_MOVES.reduce(reduceClockworkState, createClockworkState());
    expect(reduceClockworkState(won, { control: 0, command: 'remove' })).toBe(won);
    expect(reduceClockworkState(won, { control: 0, command: 'run' })).toBe(won);
    expect(clockworkStateSchema.safeParse({ ...createClockworkState(), solved: true }).success).toBe(false);
    expect(clockworkStateSchema.safeParse({ ...createClockworkState(), powered: [1, 1, 1, 1, 1, 1, 1, 1, 1] }).success).toBe(false);
    expect(clockworkStateSchema.safeParse({ ...createClockworkState(), parts: [{ peg: 2, turn: 0, crossed: false }, ...createClockworkState().parts.slice(1)] }).success).toBe(false);
    expect(clockworkEndpoints({ peg: 0, turn: 3, crossed: false })).toBeNull();
  });
});
