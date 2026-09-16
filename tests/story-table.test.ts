import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { performStoryActivity } from './helpers/story-activity';
import { LONG_TABLE_ROOM } from '../src/features/story-rooms/rooms/long-table';
import { OTHER_STORY_RULE_GROUPS } from '../src/features/story-rooms/rooms/catalog-evidence';
import { createStoryState, projectStoryView, reduceStoryAction, solveStage, validateStoryRoom } from '../src/features/story-rooms/engine';
import { getStoryRoom } from '../src/features/story-rooms/catalog';

describe('Long Table: a warm four-part treasure hunt', () => {
  it('has one deduction chapter followed by construction, coordination and shadow play', () => {
    expect(LONG_TABLE_ROOM.stages.map(stage => stage.interaction)).toEqual([
      { kind: 'table-scene', mode: 'seating' },
      { kind: 'marble-machine' },
      { kind: 'serving-tray' },
      { kind: 'shadow-play' },
    ]);
    expect(LONG_TABLE_ROOM.stages.map(stage => stage.id)).not.toContain('long-table-keepsakes');
    expect(JSON.stringify(LONG_TABLE_ROOM)).not.toMatch(/workbench|patch-panel|phone flat|hold a button/);
    expect(LONG_TABLE_ROOM.ending).toContain('Dessert on the roof');
    expect(validateStoryRoom(LONG_TABLE_ROOM)).toEqual([]);
  });

  it('shows the same named bench landmarks that the clues describe', () => {
    const stage = LONG_TABLE_ROOM.stages[0];
    expect(stage.slots.map(slot => slot.label)).toEqual(['Door end', 'Flower side', 'Window side', 'Kitchen end']);
    expect(stage.instruction).toContain('Tap a seat');
    expect(stage.clues.every(clue => clue.medium === 'note')).toBe(true);
    expect(solveStage(stage)).toEqual([['noor', 'sami', 'leila', 'mina']]);
  });

  for (const stage of LONG_TABLE_ROOM.stages.filter(stage => !isActivityKind(stage.interaction?.kind))) {
    it(`${stage.title}: every private scrap is necessary`, () => {
      const groups = OTHER_STORY_RULE_GROUPS[stage.id];
      expect(solveStage(stage)).toEqual([stage.answer]);
      for (let absent = 0; absent < 4; absent++) {
        expect(solveStage({ ...stage, constraints: groups.flatMap((rules, seat) => seat === absent ? [] : rules) }).length).toBeGreaterThan(1);
      }
    });

    it(`${stage.title}: one phone cannot solve everything at two, three, or four players`, () => {
      for (const count of [2, 3, 4]) {
        for (let player = 0; player < count; player++) {
          const theirRules = OTHER_STORY_RULE_GROUPS[stage.id].flatMap((rules, seat) => seat % count === player ? rules : []);
          expect(solveStage({ ...stage, constraints: theirRules }).length).toBeGreaterThan(1);
          expect(stage.slots.some(slot => slot.seat % count === player)).toBe(true);
        }
      }
    });
  }

  it('keeps the riddle and envelope answer clues on another player’s phone at every party size', () => {
    for (const stage of LONG_TABLE_ROOM.stages.slice(1).filter(stage => !isActivityKind(stage.interaction?.kind))) {
      for (const count of [2, 3, 4]) {
        OTHER_STORY_RULE_GROUPS[stage.id].forEach((rules, clueSeat) => {
          const clue = rules.find(rule => rule.kind === 'at');
          expect(clue?.kind).toBe('at');
          if (clue?.kind === 'at') expect(clueSeat % count).not.toBe(stage.slots[clue.slot].seat % count);
        });
      }
    }
  });

  for (const count of [2, 3, 4]) {
    it(`completes all four chapters with real ownership at ${count} players`, () => {
      const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}` }));
      let state = createStoryState('long-table', players, 83, `table-${count}`, 1000);
      const room = getStoryRoom('long-table', 83);
      let action = 0;
      room.stages.forEach((stage, stageIndex) => {
        if (isActivityKind(stage.interaction?.kind)) state = performStoryActivity(state, 1005 + action);
        else players.forEach(player => {
          const view = projectStoryView(state, player.id);
          expect(view.ownedSlots.length).toBeGreaterThan(0);
          view.ownedSlots.forEach(slot => {
            state = reduceStoryAction(state, { kind: 'edit', id: `table-${++action}`, stageIndex, slot, value: stage.answer[slot] }, player.id, 1010 + action);
          });
        });
        expect(state.draft).toEqual(stage.answer);
        state = reduceStoryAction(state, { kind: 'submit', id: `table-${++action}`, stageIndex }, 'p0', 1100 + action);
        if (stageIndex < room.stages.length - 1) {
          expect(state.status).toBe('stage-solved');
          state = reduceStoryAction(state, { kind: 'continue', id: `table-${++action}`, stageIndex }, 'p0', 1200 + action);
        }
      });
      expect(state.status).toBe('won');
      expect(state.solvedStages).toEqual([0, 1, 2, 3]);
      expect(state.attemptsUsed).toBe(0);
    });
  }

  it('renders physical table objects, named guest controls, and changeable real choices', () => {
    const source = readFileSync(new URL('../src/features/story-rooms/TableSceneBoard.tsx', import.meta.url), 'utf8');
    expect(source).toContain('function TableObject');
    expect(source).toContain('function Portrait');
    expect(source).toContain('onEdit(active, value)');
    expect(source).toContain('!ownedSlots.includes(active)');
    expect(source).toContain('Choose seat');
    expect(source).toContain('Someone else has the clue');
  });
});
