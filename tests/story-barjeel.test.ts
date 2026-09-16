import { describe, expect, it } from 'vitest';
import type { ActivityMove } from '../src/features/story-rooms/activities/contracts';
import { createToolSearchState, isToolSearchSolved, reduceToolSearchState, TOOL_SEARCH_SOLUTION, toolSearchStateSchema, toolSearchSummary } from '../src/features/story-rooms/activities/tool-search';
import { createTimeHouseState, isTimeHouseSolved, reduceTimeHouseState, TIME_HOUSE_SOLUTION, timeHouseLightVisible, timeHouseStateSchema, timeHouseSummary } from '../src/features/story-rooms/activities/time-house';
import { NIGHT_GLASS_ROOM } from '../src/features/story-rooms/rooms/night-glass';

describe('Barjeel has four different, clearly motivated chapters', () => {
  it('keeps the cooperative glass and reader around two new physical activities', () => {
    expect(NIGHT_GLASS_ROOM.title).toBe('Barjeel');
    expect(NIGHT_GLASS_ROOM.stages.map(stage => stage.interaction?.kind)).toEqual(['lightbox', 'tool-search', 'time-house', 'patch-panel']);
    expect(NIGHT_GLASS_ROOM.stages.every(stage => stage.slots.length === 4)).toBe(true);
    expect(NIGHT_GLASS_ROOM.stages[0].clues).toEqual([]);
    expect(NIGHT_GLASS_ROOM.stages[0].constraints).toEqual([]);
    expect(NIGHT_GLASS_ROOM.stages[3].id).toBe('night-glass-watermark');
  });
  it('new activities are not disguised answer matching', () => {
    for (const stage of NIGHT_GLASS_ROOM.stages.slice(1, 3)) {
      expect(stage.options).toEqual([]);
      expect(stage.constraints).toEqual([]);
      expect(stage.answer).toEqual([]);
      expect(stage.objective).toMatch(/open/i);
      expect(stage.hints).toHaveLength(2);
    }
  });
});

describe('Courtyard tool exploration', () => {
  it('starts empty and actually discovers, combines, retrieves, unlocks and cleans', () => {
    let state = createToolSearchState();
    expect(isToolSearchSolved(state)).toBe(false);
    for (let index = 0; index < TOOL_SEARCH_SOLUTION.length; index++) {
      const next = reduceToolSearchState(state, TOOL_SEARCH_SOLUTION[index]);
      expect(next).not.toBe(state);
      expect(toolSearchStateSchema.safeParse(next).success).toBe(true);
      state = next;
      expect(isToolSearchSolved(state)).toBe(index === TOOL_SEARCH_SOLUTION.length - 1);
    }
    expect(state).toMatchObject({ cord: true, magnet: true, cloth: true, retrievalLine: true, key: true, unlocked: true, clean: true });
  });
  it('requires an actual found inventory instead of accepting a guessed combination', () => {
    const initial = createToolSearchState();
    expect(reduceToolSearchState(initial, { control: 2, command: 'combine', value: 3 })).toBe(initial);
    expect(reduceToolSearchState(initial, { control: 3, command: 'use-item', value: 3 })).toBe(initial);
    expect(reduceToolSearchState(initial, { control: 2, command: 'lower-tool' })).toMatchObject({ key: false, event: 'too-short' });
  });
  it('empty searches and wrong combinations preserve all useful finds', () => {
    let state = createToolSearchState();
    state = reduceToolSearchState(state, { control: 0, command: 'open-drawer', value: 1 });
    expect(state).toMatchObject({ event: 'empty', cord: false, magnet: false, cloth: false });
    state = reduceToolSearchState(state, { control: 0, command: 'open-drawer', value: 0 });
    state = reduceToolSearchState(state, { control: 0, command: 'open-drawer', value: 2 });
    state = reduceToolSearchState(state, { control: 2, command: 'combine', value: 5 });
    expect(state).toMatchObject({ retrievalLine: false, cord: true, cloth: true, event: 'wrong-combination' });
    expect(toolSearchStateSchema.safeParse(state).success).toBe(true);
  });
  it('the cloth cannot clean through the locked cover', () => {
    const found = reduceToolSearchState(createToolSearchState(), { control: 0, command: 'open-drawer', value: 0 });
    const result = reduceToolSearchState(found, { control: 3, command: 'use-item', value: 4 });
    expect(result).toMatchObject({ clean: false, event: 'open-first' });
  });
  it('repeated searches and moves after completion are idempotent', () => {
    const move = TOOL_SEARCH_SOLUTION[0];
    const found = reduceToolSearchState(createToolSearchState(), move);
    expect(reduceToolSearchState(found, move)).toBe(found);
    const done = TOOL_SEARCH_SOLUTION.reduce(reduceToolSearchState, createToolSearchState());
    expect(reduceToolSearchState(done, { control: 1, command: 'inspect-desk', value: 0 })).toBe(done);
  });
  it('rejects impossible or duplicate snapshot inventory', () => {
    const initial = createToolSearchState();
    for (const patch of [{ cord: true }, { key: true }, { unlocked: true }, { clean: true }, { retrievalLine: true }, { drawers: [1, 1] }, { deskPlaces: [0, 0] }, { drawers: [0] }, { unknown: true }]) {
      expect(toolSearchStateSchema.safeParse({ ...initial, ...patch }).success).toBe(false);
    }
  });
  it.each([2, 3, 4])('every one of %i players must contribute', count => {
    const owners = new Set<number>();
    let state = createToolSearchState();
    for (const move of TOOL_SEARCH_SOLUTION) {
      owners.add(move.control % count);
      state = reduceToolSearchState(state, move);
    }
    expect(owners.size).toBe(count);
    expect(isToolSearchSolved(state)).toBe(true);
    for (let missing = 0; missing < count; missing++) {
      const partial = TOOL_SEARCH_SOLUTION.filter(move => move.control % count !== missing).reduce(reduceToolSearchState, createToolSearchState());
      expect(isToolSearchSolved(partial)).toBe(false);
    }
  });
  it('summaries describe the finds without giving undiscovered drawer positions', () => {
    const lines = toolSearchSummary(createToolSearchState(), [0]);
    expect(lines.join(' ')).toContain('none yet');
    expect(lines.join(' ')).not.toContain('bottom drawer');
  });
});

describe('Past and present courtyard', () => {
  it('cannot be completed by opening a door before changing the world', () => {
    const state = createTimeHouseState();
    expect(reduceTimeHouseState(state, { control: 3, command: 'open-door' })).toMatchObject({ doorOpen: false, event: 'latched' });
    expect(reduceTimeHouseState(state, { control: 1, command: 'search-wall' })).toMatchObject({ pinFound: false, event: 'dark-wall' });
    expect(reduceTimeHouseState(state, { control: 3, command: 'release-catch' })).toMatchObject({ catchReleased: false, event: 'need-pin' });
  });
  it('changing the old shutter changes present light, while the mature plant can shade it', () => {
    let state = createTimeHouseState();
    state = reduceTimeHouseState(state, { control: 0, command: 'set-shutter', value: 2 });
    expect(timeHouseLightVisible(state)).toBe(true);
    state = reduceTimeHouseState(state, { control: 2, command: 'move-planter', value: 1 });
    expect(timeHouseLightVisible(state)).toBe(false);
    state = reduceTimeHouseState(state, { control: 2, command: 'move-planter', value: 2 });
    expect(timeHouseLightVisible(state)).toBe(true);
  });
  it('needs both a released catch and a physically cleared doorway', () => {
    let state = createTimeHouseState();
    for (const move of TIME_HOUSE_SOLUTION.filter(move => move.control !== 2)) state = reduceTimeHouseState(state, move);
    expect(state).toMatchObject({ catchReleased: true, doorOpen: false, event: 'roots' });
    state = reduceTimeHouseState(state, { control: 2, command: 'move-planter', value: 2 });
    expect(isTimeHouseSolved(state)).toBe(false);
    state = reduceTimeHouseState(state, { control: 3, command: 'open-door' });
    expect(isTimeHouseSolved(state)).toBe(true);
  });
  it('supports more than one valid experimentation order', () => {
    const alternate: ActivityMove[] = [
      { control: 0, command: 'set-shutter', value: 2 }, { control: 1, command: 'search-wall' },
      { control: 3, command: 'release-catch' }, { control: 0, command: 'set-shutter', value: 0 },
      { control: 2, command: 'move-planter', value: 1 }, { control: 3, command: 'open-door' },
    ];
    const done = alternate.reduce(reduceTimeHouseState, createTimeHouseState());
    expect(isTimeHouseSolved(done)).toBe(true);
    expect(timeHouseStateSchema.safeParse(done).success).toBe(true);
  });
  it('holds solved worlds steady and rejects impossible saved progress', () => {
    const initial = createTimeHouseState();
    const done = TIME_HOUSE_SOLUTION.reduce(reduceTimeHouseState, initial);
    expect(reduceTimeHouseState(done, { control: 2, command: 'move-planter', value: 0 })).toBe(done);
    for (const patch of [{ catchReleased: true }, { doorOpen: true }, { shutter: 1.5 }, { planter: 3 }, { unknown: true }]) expect(timeHouseStateSchema.safeParse({ ...initial, ...patch }).success).toBe(false);
  });
  it.each([2, 3, 4])('has an essential owned control for all %i players', count => {
    let state = createTimeHouseState();
    const owners = new Set<number>();
    for (const move of TIME_HOUSE_SOLUTION) {
      owners.add(move.control % count);
      state = reduceTimeHouseState(state, move);
      expect(timeHouseStateSchema.safeParse(state).success).toBe(true);
    }
    expect(isTimeHouseSolved(state)).toBe(true);
    expect(owners.size).toBe(count);
    for (let missing = 0; missing < count; missing++) {
      const partial = TIME_HOUSE_SOLUTION.filter(move => move.control % count !== missing).reduce(reduceTimeHouseState, createTimeHouseState());
      expect(isTimeHouseSolved(partial)).toBe(false);
    }
  });
  it('guide observations respect a player’s time perspective', () => {
    expect(timeHouseSummary(createTimeHouseState(), [0, 2]).join(' ')).not.toContain('Present courtyard:');
    expect(timeHouseSummary(createTimeHouseState(), [1, 3]).join(' ')).not.toContain('Old courtyard:');
    expect(timeHouseSummary(createTimeHouseState(), [0, 3]).join(' ')).toContain('Present courtyard:');
  });
});

describe('Activity command validation', () => {
  it.each([
    { control: -1, command: 'open-drawer', value: 0 }, { control: 4, command: 'open-drawer', value: 0 },
    { control: 0.5, command: 'open-drawer', value: 0 }, { control: 0, command: 'open-drawer', value: NaN },
    { control: 0, command: 'open-drawer', value: 3 }, { control: 0, command: 'set-shutter', value: Infinity },
    { control: 2, command: 'move-planter', value: -1 }, { control: 2, command: 'move-planter', value: 1.5 },
    { control: 0, command: 'open-door' }, { control: 1, command: 'combine', value: 3 },
    { control: 3, command: 'win' }, { control: 3, command: 'open-door', value: 2 },
  ])('rejects malformed or wrong-control move %j without mutation', move => {
    const tools = createToolSearchState(); const time = createTimeHouseState();
    expect(reduceToolSearchState(tools, move)).toBe(tools);
    expect(reduceTimeHouseState(time, move)).toBe(time);
  });
});
