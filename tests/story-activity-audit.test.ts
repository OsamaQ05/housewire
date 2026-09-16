import { describe, expect, it } from 'vitest';
import type { ActivityMove } from '../src/features/story-rooms/activities/contracts';
import { createCraneState, craneStateSchema, isCraneSolved, reduceCraneState, type CraneState } from '../src/features/story-rooms/activities/crane';
import { createTimeHouseState, timeHouseStateSchema, isTimeHouseSolved, reduceTimeHouseState, type TimeHouseState } from '../src/features/story-rooms/activities/time-house';
import { createToolSearchState, toolSearchStateSchema, isToolSearchSolved, reduceToolSearchState, type ToolSearchState } from '../src/features/story-rooms/activities/tool-search';
import { createMarbleState, isMarbleSolved, MARBLE_RAILS, MARBLE_SOLUTION_MOVES, marbleStateSchema, reduceMarbleState, simulateMarble, type MarbleState } from '../src/features/story-rooms/activities/marble';

/** Explore every reachable physical state, then work backwards from all exits.
 * Invalid/feedback-only actions do not create a separate world. This catches
 * traps caused by legitimate experimentation, rather than testing only a fixture. */
function auditReachability<T>(initial: T, moves: ActivityMove[], reduce: (state: T, move: ActivityMove) => T, key: (state: T) => string, solved: (state: T) => boolean, valid: (state: T) => boolean) {
  const start = key(initial);
  const states = new Map<string, T>([[start, initial]]);
  const backwards = new Map<string, Set<string>>();
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const from = queue[index];
    const state = states.get(from)!;
    for (const move of moves) {
      const next = reduce(state, move);
      expect(valid(next), `Reducer emitted an invalid state for ${JSON.stringify(move)} from ${from}`).toBe(true);
      const to = key(next);
      if (!states.has(to)) { states.set(to, next); queue.push(to); }
      if (!backwards.has(to)) backwards.set(to, new Set());
      backwards.get(to)!.add(from);
    }
  }
  const wins = [...states].filter(([, state]) => solved(state)).map(([id]) => id);
  expect(wins.length).toBeGreaterThan(0);
  const recoverable = new Set(wins);
  for (let index = 0; index < wins.length; index++) {
    for (const previous of backwards.get(wins[index]) ?? []) {
      if (!recoverable.has(previous)) { recoverable.add(previous); wins.push(previous); }
    }
  }
  const trapped = [...states.keys()].filter(id => !recoverable.has(id));
  expect(trapped.slice(0, 4), 'A legitimate experiment left a room impossible to finish').toEqual([]);
  return states.size;
}

describe('Independent physical-activity audit', () => {
  it('every reachable crane world can still deliver its parcel', () => {
    const moves: ActivityMove[] = [
      ...Array.from({ length: 7 }, (_, value) => ({ control: 0, command: 'travel', value })),
      ...Array.from({ length: 4 }, (_, value) => ({ control: 1, command: 'hoist', value })),
      { control: 2, command: 'bridge', value: 0 }, { control: 2, command: 'bridge', value: 1 },
      { control: 3, command: 'grip' },
    ];
    const key = ({ x, height, bridge, carrying, parcelX, delivered }: CraneState) => JSON.stringify({ x, height, bridge, carrying, parcelX, delivered });
    const worlds = auditReachability(createCraneState(), moves, reduceCraneState, key, isCraneSolved, state => craneStateSchema.safeParse(state).success);
    expect(worlds).toBeGreaterThan(100);
  });
  it('every reachable past–present courtyard can still open the passage', () => {
    const moves: ActivityMove[] = [
      ...Array.from({ length: 3 }, (_, value) => ({ control: 0, command: 'set-shutter', value })),
      ...Array.from({ length: 3 }, (_, value) => ({ control: 2, command: 'move-planter', value })),
      { control: 1, command: 'search-wall' }, { control: 3, command: 'release-catch' }, { control: 3, command: 'open-door' },
    ];
    const key = ({ shutter, planter, pinFound, catchReleased, doorOpen }: TimeHouseState) => JSON.stringify({ shutter, planter, pinFound, catchReleased, doorOpen });
    const worlds = auditReachability(createTimeHouseState(), moves, reduceTimeHouseState, key, isTimeHouseSolved, state => timeHouseStateSchema.safeParse(state).success);
    expect(worlds).toBeGreaterThan(20);
  });
  it('every reachable inventory/search state retains a way to restore the viewer', () => {
    const moves: ActivityMove[] = [
      ...Array.from({ length: 3 }, (_, value) => ({ control: 0, command: 'open-drawer', value })),
      ...Array.from({ length: 3 }, (_, value) => ({ control: 1, command: 'inspect-desk', value })),
      ...[3, 5, 6].map(value => ({ control: 2, command: 'combine', value })),
      { control: 2, command: 'lower-tool' },
      ...[1, 2, 3, 4].map(value => ({ control: 3, command: 'use-item', value })),
    ];
    const key = ({ drawers, deskPlaces, event: _event, ...physical }: ToolSearchState) => JSON.stringify({ ...physical, drawers: [...drawers].sort(), deskPlaces: [...deskPlaces].sort() });
    const worlds = auditReachability(createToolSearchState(), moves, reduceToolSearchState, key, isToolSearchSolved, state => toolSearchStateSchema.safeParse(state).success);
    expect(worlds).toBeGreaterThan(60);
  });
  it('all 288 marble rail/tension settings are valid and recoverable; every win needs all four owners', () => {
    const initial = createMarbleState();
    const wins: MarbleState['pieces'][] = [];
    let configurations = 0;
    for (const ramp of MARBLE_RAILS[0]) for (const funnel of MARBLE_RAILS[1]) for (const spring of MARBLE_RAILS[2]) for (const bell of MARBLE_RAILS[3]) for (const tension of [0, 1]) {
      const pieces: MarbleState['pieces'] = [{ cell: ramp, rotation: 0 }, { cell: funnel, rotation: 0 }, { cell: spring, rotation: tension }, { cell: bell, rotation: 0 }];
      const result = simulateMarble(pieces);
      const tested = { ...initial, pieces, runs: 1, ...result };
      expect(marbleStateSchema.safeParse(tested).success, JSON.stringify(pieces)).toBe(true);
      if (result.result === 'success') wins.push(pieces);
      expect(result.trace.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      const resetTension = reduceMarbleState(tested, { control: 2, command: 'tension', value: 0 });
      const recovered = MARBLE_SOLUTION_MOVES.reduce(reduceMarbleState, resetTension);
      expect(isMarbleSolved(recovered), JSON.stringify(pieces)).toBe(true);
      configurations++;
    }
    expect(configurations).toBe(288);
    expect(wins.length).toBeGreaterThan(3);
    for (let control = 0; control < 4; control++) expect(new Set(wins.map(win => win[control].cell)).size).toBeGreaterThan(1);
    for (const win of wins) for (let control = 0; control < 4; control++) expect(win[control]).not.toEqual(initial.pieces[control]);
    expect(new Set(wins.map(win => win[2].rotation)).size).toBe(2);
  });
});
