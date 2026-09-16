import { describe, expect, it } from 'vitest';
import { createMarbleState, isMarbleSolved, MARBLE_RAILS, MARBLE_SOLUTION_MOVES, marbleGeometry, marbleRailStop, marbleStateSchema, marbleSummary, reduceMarbleState, simulateMarble, type MarbleState } from '../src/features/story-rooms/activities/marble';
import { LONG_TABLE_ROOM } from '../src/features/story-rooms/rooms/long-table';
import { TABLE_CHARACTERS } from '../src/features/story-rooms/rooms/table-characters';

const working = () => MARBLE_SOLUTION_MOVES.reduce(reduceMarbleState, createMarbleState());
const pieces = (stops: number[], tension = 0) => stops.map((stop, index) => ({ cell: MARBLE_RAILS[index][stop], rotation: index === 2 ? tension : 0 })) as MarbleState['pieces'];

describe('Long Table assembled marble machine', () => {
  it('has no question, answer list, or clue gate and gives every player a real part', () => {
    const stage = LONG_TABLE_ROOM.stages.find(item => item.id === 'long-table-marble')!;
    expect(stage.interaction).toEqual({ kind: 'marble-machine' });
    expect(stage.clues).toEqual([]);
    expect(stage.answer).toEqual([]);
    expect(stage.options).toEqual([]);
    for (const people of [2, 3, 4]) for (let person = 0; person < people; person++) {
      expect(stage.slots.some(slot => slot.seat % people === person)).toBe(true);
    }
  });

  it('starts with a visibly assembled machine, not a confusing empty placement grid', () => {
    const state = createMarbleState();
    expect(state.pieces.every(piece => piece.cell >= 0)).toBe(true);
    expect(isMarbleSolved(state)).toBe(false);
    expect(marbleStateSchema.safeParse(state).success).toBe(true);
    const tested = reduceMarbleState(state, { control: 0, command: 'launch' });
    expect(tested.result).toBe('catcher');
    expect(tested.runs).toBe(1);
    expect(tested.trace.length).toBeGreaterThan(30);
  });

  it('moves only the chosen part along its rail and keeps team snapshots immutable', () => {
    const initial = createMarbleState();
    const raised = reduceMarbleState(initial, { control: 0, command: 'height', value: 1 });
    expect(marbleRailStop(raised, 0)).toBe(1);
    expect(initial.pieces[0].cell).toBe(10);
    expect(raised.pieces.slice(1)).toEqual(initial.pieces.slice(1));
    const lowered = reduceMarbleState(raised, { control: 0, command: 'height', value: 2 });
    expect(lowered).toEqual(initial);
    expect(reduceMarbleState(raised, { control: 0, command: 'height', value: 1 })).toBe(raised);
    const firm = reduceMarbleState(initial, { control: 2, command: 'tension', value: 1 });
    expect(firm.pieces[2].rotation).toBe(1);
    expect(firm.pieces[2].cell).toBe(initial.pieces[2].cell);
    expect(reduceMarbleState(firm, { control: 2, command: 'tension', value: 1 })).toBe(firm);
  });

  it('the documented settings ring the bell with a continuous real trajectory', () => {
    const state = working();
    expect(state.pieces).toEqual(pieces([0, 0, 0, 1]));
    expect(isMarbleSolved(state)).toBe(true);
    expect(state.trace.length).toBeGreaterThan(100);
    expect(state.trace[0]).toEqual({ x: 32, y: 14 });
    const geometry = marbleGeometry(state.pieces);
    expect(state.trace.at(-1)?.x).toBe(geometry.bell.x);
    expect(Math.abs(state.trace.at(-1)!.y - geometry.bell.y)).toBeLessThanOrEqual(14);
    for (let point = 1; point < state.trace.length; point++) {
      expect(Math.hypot(state.trace[point].x - state.trace[point - 1].x, state.trace[point].y - state.trace[point - 1].y)).toBeLessThan(16);
    }
    expect(marbleStateSchema.safeParse(state).success).toBe(true);
  });

  it('accepts several physical settings, not a hidden answer combination', () => {
    const builds = [[0, 0, 0, 1, 0], [0, 0, 1, 0, 1], [0, 0, 2, 1, 1], [1, 1, 1, 0, 1], [1, 1, 1, 2, 0], [1, 1, 2, 1, 1], [1, 1, 3, 2, 1]];
    for (const build of builds) expect(simulateMarble(pieces(build.slice(0, 4), build[4])).result, build.join(',')).toBe('success');
  });

  it('spring tension is a modest but real extra decision, changing the visible arc', () => {
    const gentle = simulateMarble(pieces([0, 0, 0, 1], 0));
    const firmer = simulateMarble(pieces([0, 0, 0, 1], 1));
    expect(gentle.result).toBe('success');
    expect(firmer.result).toBe('bell');
    expect(firmer.trace).not.toEqual(gentle.trace);
    expect(Math.min(...firmer.trace.slice(100).map(point => point.y))).toBeLessThan(Math.min(...gentle.trace.slice(100).map(point => point.y)));
    expect(simulateMarble(pieces([0, 0, 1, 0], 1)).result).toBe('success');
  });

  it('reports each missed hand-off with a visible test trail', () => {
    for (const [stops, result] of [[[2, 2, 3, 3], 'catcher'], [[0, 0, 3, 3], 'spring'], [[0, 0, 0, 3], 'bell']] as const) {
      const simulated = simulateMarble(pieces([...stops]));
      expect(simulated.result).toBe(result);
      expect(simulated.trace.length).toBeGreaterThan(30);
    }
  });

  it('starts the next experiment cleanly and is deterministic', () => {
    const initial = createMarbleState();
    const json = JSON.stringify(initial);
    expect(MARBLE_SOLUTION_MOVES.reduce(reduceMarbleState, initial)).toEqual(working());
    expect(JSON.stringify(initial)).toBe(json);
    const tested = reduceMarbleState(initial, { control: 1, command: 'launch' });
    const adjusted = reduceMarbleState(tested, { control: 2, command: 'height', value: 0 });
    expect(adjusted.result).toBe('ready');
    expect(adjusted.trace).toEqual([]);
    expect(isMarbleSolved(adjusted)).toBe(false);
  });

  it('latches success so delayed teammate adjustments cannot erase it', () => {
    const solved = working();
    for (let control = 0; control < 4; control++) for (const command of ['height', 'tension', 'launch']) {
      expect(reduceMarbleState(solved, { control, command, ...(command !== 'launch' ? { value: 1 } : {}) })).toBe(solved);
    }
  });

  it('rejects malformed, obsolete placement and wrong-owner-feature commands', () => {
    const state = createMarbleState();
    for (const move of [
      { control: -1, command: 'launch' }, { control: 4, command: 'launch' }, { control: 1.5, command: 'launch' },
      { control: 0, command: 'launch', value: 1 }, { control: 0, command: 'solve' },
      { control: 0, command: 'height', value: 3 }, { control: 2, command: 'height', value: 4 },
      { control: 0, command: 'height', value: -1 }, { control: 0, command: 'height', value: NaN },
      { control: 0, command: 'height' }, { control: 0, command: 'height', value: .5 },
      { control: 1, command: 'tension', value: 1 }, { control: 2, command: 'tension', value: 2 },
      { control: 0, command: 'place', value: 5 }, { control: 0, command: 'rotate', value: 1 },
      { control: 0, command: 'remove' },
    ]) expect(reduceMarbleState(state, move)).toBe(state);
    const capped = { ...state, runs: 100000 };
    expect(reduceMarbleState(capped, { control: 0, command: 'launch' })).toBe(capped);
  });

  it('lets any owner release a test but rejects fabricated success', () => {
    for (let control = 0; control < 4; control++) expect(reduceMarbleState(createMarbleState(), { control, command: 'launch' }).runs).toBe(1);
    expect(isMarbleSolved({ ...createMarbleState(), result: 'success', runs: 1 })).toBe(false);
    expect(isMarbleSolved({ ...working(), runs: 0 })).toBe(false);
    const invalid = working();
    invalid.pieces[3] = { cell: 9, rotation: 3 };
    expect(isMarbleSolved(invalid)).toBe(false);
  });

  it('uses a bounded legal-rail schema and gives the guide only visible settings', () => {
    const state = createMarbleState();
    expect(marbleStateSchema.safeParse({ ...state, secret: true }).success).toBe(false);
    expect(marbleStateSchema.safeParse({ ...state, runs: 100001 }).success).toBe(false);
    expect(marbleStateSchema.safeParse({ ...state, pieces: [{ cell: 4, rotation: 0 }, ...state.pieces.slice(1)] }).success).toBe(false);
    expect(marbleStateSchema.safeParse({ ...state, trace: [{ x: 999999, y: 1 }] }).success).toBe(false);
    expect(marbleSummary(state, [0, 2]).join(' ')).toContain('You control: Ramp, Spring');
    expect(marbleSummary(state, [0]).join(' ')).toContain('two tension settings');
    expect(marbleSummary(state, [0]).join(' ')).not.toContain('column');
  });
});

describe('Long Table character continuity', () => {
  it('keeps named fictional characters, pronouns, clothing and portrait styling explicit', () => {
    expect(TABLE_CHARACTERS.noor.pronouns).toBe('she/her');
    expect(TABLE_CHARACTERS.sami.pronouns).toBe('he/him');
    expect(TABLE_CHARACTERS.leila.pronouns).toBe('she/her');
    expect(TABLE_CHARACTERS.mina.pronouns).toBe('she/her');
    expect(TABLE_CHARACTERS.khalid.pronouns).toBe('he/him');
    for (const option of LONG_TABLE_ROOM.stages[0].options) {
      const person = TABLE_CHARACTERS[option.id as keyof typeof TABLE_CHARACTERS];
      expect(option.label).toBe(person.name);
      expect(option.detail).toBe(person.detail);
    }
  });
});
