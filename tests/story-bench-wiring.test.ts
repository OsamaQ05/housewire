import { describe, expect, it } from 'vitest';
import { BENCH_WIRING_SOLUTION_MOVES, BENCH_WIRING_SOLUTION_PATHS, benchWiringStateSchema, createBenchWiringState, inspectWiring, isBenchWiringSolved, reduceBenchWiringState, WIRING_STARTS } from '../src/features/story-rooms/activities/bench-wiring';
import type { ActivityMove } from '../src/features/story-rooms/activities/contracts';

const lay = (control: number, cells: readonly number[]): ActivityMove[] => cells.map(value => ({ control, command: 'place', value }));

describe('Wire the workshop: cooperative cable routes, not four pegs around a hot plate', () => {
  it('starts with four sockets and requires every cable to reach its building', () => {
    const initial = createBenchWiringState();
    expect(inspectWiring(initial.paths)).toMatchObject({ valid: true, safe: false, connectedCount: 0 });
    for (let absent = 0; absent < 4; absent++) {
      const partial = BENCH_WIRING_SOLUTION_MOVES.filter(move => move.control !== absent || move.command === 'test').reduce(reduceBenchWiringState, initial);
      expect(isBenchWiringSolved(partial)).toBe(false);
      expect(inspectWiring(partial.paths).connectedCount).toBe(3);
    }
  });

  it('accepts genuinely different street routes, then latches tested power', () => {
    const alternative = [[0, 6, 12, 18, 19], [13, 7, 1, 2, 3, 4, 10], [9, 15, 21, 27, 28, 34, 35], [5, 11, 17, 16, 22]];
    for (const paths of [BENCH_WIRING_SOLUTION_PATHS, alternative]) {
      expect(inspectWiring(paths).safe).toBe(true);
      const moves = paths.flatMap((path, control) => lay(control, path.slice(1)));
      const connected = moves.reduce(reduceBenchWiringState, createBenchWiringState());
      expect(isBenchWiringSolved(connected)).toBe(false);
      const solved = reduceBenchWiringState(connected, { control: 0, command: 'test' });
      expect(isBenchWiringSolved(solved)).toBe(true);
      expect(benchWiringStateSchema.safeParse(solved).success).toBe(true);
      expect(reduceBenchWiringState(solved, { control: 0, command: 'reset' })).toBe(solved);
    }
  });

  it('makes shared street space matter and lets teammates recover without restarting', () => {
    let state = lay(0, [1, 7, 6, 12, 18, 19]).reduce(reduceBenchWiringState, createBenchWiringState());
    const occupied = reduceBenchWiringState(state, { control: 1, command: 'place', value: 7 });
    expect(occupied.feedback).toBe('occupied');
    expect(occupied.paths[1]).toEqual([13]);
    state = reduceBenchWiringState(occupied, { control: 0, command: 'place', value: 0 });
    expect(state.paths[0]).toEqual([0]);
    state = BENCH_WIRING_SOLUTION_MOVES.reduce(reduceBenchWiringState, state);
    expect(isBenchWiringSolved(state)).toBe(true);
  });

  it('rewinds only the owner’s route, with one-step undo and full reel-in', () => {
    const state = [...lay(0, [6, 12, 18]), ...lay(1, [7, 1])].reduce(reduceBenchWiringState, createBenchWiringState());
    const undo = reduceBenchWiringState(state, { control: 0, command: 'undo' });
    expect(undo.paths[0]).toEqual([0, 6, 12]);
    expect(undo.paths[1]).toEqual(state.paths[1]);
    const rewind = reduceBenchWiringState(state, { control: 0, command: 'place', value: 6 });
    expect(rewind.paths[0]).toEqual([0, 6]);
    const reset = reduceBenchWiringState(state, { control: 0, command: 'reset' });
    expect(reset.paths[0]).toEqual([0]);
    expect(reset.paths.slice(1)).toEqual(state.paths.slice(1));
  });

  it('does not jump streets, cross model buildings or use another socket or building', () => {
    const initial = createBenchWiringState();
    for (const [value, feedback] of [[19, 'gap'], [8, 'blocked'], [9, 'socket'], [10, 'socket']] as const) {
      const next = reduceBenchWiringState(initial, { control: 0, command: 'place', value });
      expect(next.paths).toEqual(initial.paths); expect(next.feedback).toBe(feedback);
    }
    const atEdge = lay(0, [1, 2, 3, 4]).reduce(reduceBenchWiringState, initial);
    expect(reduceBenchWiringState(atEdge, { control: 0, command: 'place', value: 6 }).feedback).toBe('gap');
  });

  it('rejects invalid persisted paths and forged power', () => {
    const initial = createBenchWiringState();
    const malformed = [
      [[0, 12], [13], [9], [5]],
      [[0, 6, 7], [13, 7], [9], [5]],
      [[0, 1, 2, 8], [13], [9], [5]],
      [[0, 6, 12, 18, 19, 25], [13], [9], [5]],
      [[0, 6, 12, 13], [13], [9], [5]],
    ];
    for (const paths of malformed) expect(benchWiringStateSchema.safeParse({ ...initial, paths }).success).toBe(false);
    expect(benchWiringStateSchema.safeParse({ ...initial, powered: true, tests: 1 }).success).toBe(false);
    expect(benchWiringStateSchema.safeParse({ ...initial, paths: BENCH_WIRING_SOLUTION_PATHS, powered: true }).success).toBe(false);
  });

  it('bounds untrusted commands and keeps initial/other-player state immutable', () => {
    const initial = createBenchWiringState();
    for (const move of [{ control: 4, command: 'place', value: 0 }, { control: 0, command: 'place', value: 36 }, { control: 0, command: 'place', value: 1.5 }, { control: 0, command: 'win' }, { control: 0, command: 'test', value: 1 }, { control: 0, command: 'undo', value: 1 }] satisfies ActivityMove[]) expect(reduceBenchWiringState(initial, move)).toBe(initial);
    reduceBenchWiringState(initial, { control: 0, command: 'place', value: 6 });
    expect(initial.paths).toEqual(WIRING_STARTS.map(cell => [cell]));
  });

  it('recovers from 400 seeded arbitrary play sequences through ordinary reel-in and routing', () => {
    let seed = 384729;
    const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let sample = 0; sample < 400; sample++) {
      let state = createBenchWiringState();
      for (let step = 0; step < 65; step++) {
        const control = next() % 4; const tip = state.paths[control].at(-1)!;
        const candidate = [tip - 6, tip + 1, tip + 6, tip - 1][next() % 4];
        state = reduceBenchWiringState(state, next() % 11 === 0 ? { control, command: 'undo' } : { control, command: 'place', value: candidate >= 0 && candidate < 36 ? candidate : 0 });
        expect(benchWiringStateSchema.safeParse(state).success).toBe(true);
      }
      for (let control = 0; control < 4; control++) state = reduceBenchWiringState(state, { control, command: 'reset' });
      state = BENCH_WIRING_SOLUTION_MOVES.reduce(reduceBenchWiringState, state);
      expect(isBenchWiringSolved(state), `sample ${sample}`).toBe(true);
    }
  });
});
