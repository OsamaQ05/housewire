import { readFileSync } from 'node:fs';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { performStoryActivity } from './helpers/story-activity';
import { describe, expect, it } from 'vitest';
import { createStoryState, projectStoryView, reduceStoryAction, solveStage, validateStoryRoom } from '../src/features/story-rooms/engine';
import { allowsStoryChoice, satisfiesInteraction } from '../src/features/story-rooms/interaction-rules';
import { LINE13_ROOM } from '../src/features/story-rooms/rooms/line13';
import type { StoryState } from '../src/features/story-rooms/types';

const NOW = 1_800_000_000_000;
const players = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `person-${i}`, name: `Person ${i + 1}` }));

describe('After Hours: five workshop activities, not identical arrangement puzzles', () => {
  it('uses only two written-clue chapters followed by spatial repair, crane control and construction', () => {
    expect(LINE13_ROOM.stages.map(stage => stage.interaction?.kind)).toEqual(['patch-panel', 'route-map', 'bench-wiring', 'rescue-crane', 'clockwork-machine']);
    expect(LINE13_ROOM.stages).toHaveLength(5);
    expect(LINE13_ROOM.minutes).toBeGreaterThanOrEqual(10);
    expect(LINE13_ROOM.minutes).toBeLessThanOrEqual(25);
    expect(validateStoryRoom(LINE13_ROOM)).toEqual([]);
    expect(JSON.stringify(LINE13_ROOM)).not.toMatch(/Before the photograph|polarity|neighbouring entries|WORD PACKETS/);
    expect(LINE13_ROOM.stages.every(stage => stage.clues.every(clue => clue.medium === 'note'))).toBe(true);
  });

  it('has one validated answer for each authored chapter', () => {
    for (const stage of LINE13_ROOM.stages) expect(solveStage(stage)).toEqual(isActivityKind(stage.interaction?.kind) ? [] : [stage.answer]);
  });

  it('draws an actual connected safe route and rejects jumps through walls', () => {
    const stage = LINE13_ROOM.stages[1];
    expect(stage.answer).toEqual(['platform', 'relay', 'workshop', 'gate']);
    expect(satisfiesInteraction(stage, stage.answer)).toBe(true);
    expect(satisfiesInteraction(stage, ['platform', 'workshop', 'relay', 'gate'])).toBe(false);
    expect(satisfiesInteraction(stage, ['', 'relay', 'workshop', 'gate'])).toBe(false);
    expect(satisfiesInteraction(stage, ['platform', 'ticket', 'boiler', 'gate'])).toBe(true);
    // A route may be physically connected but unsafe according to the updates.
    expect(solveStage(stage)).not.toContainEqual(['platform', 'ticket', 'boiler', 'gate']);
  });

  it('replaces the repair-note console with a physical scene and no answer choices', () => {
    const stage = LINE13_ROOM.stages[2];
    expect(stage.interaction?.kind).toBe('bench-wiring');
    expect(stage.clues).toEqual([]);
    expect(stage.answer).toEqual([]);
    expect(allowsStoryChoice(stage, 0, 'keep-line')).toBe(false);
    expect(allowsStoryChoice(stage, 0, 'stop-vent')).toBe(false);
    expect(allowsStoryChoice(stage, 3, 'isolate-bell')).toBe(false);
  });

  for (const count of [2, 3, 4]) {
    it(`keeps useful instructions on another phone for every control with ${count} players`, () => {
      const noteForSlot = [
        ['caller-blue', 'caller-red', 'caller-green', 'caller-yellow'],
        ['route-start', 'route-phone', 'route-tool', 'route-exit'],
        ['line-safety', 'vent-safety', 'bell-safety', 'exit-safety'],
      ];
      LINE13_ROOM.stages.forEach((stage, stageIndex) => {
        if (isActivityKind(stage.interaction?.kind)) return;
        stage.slots.forEach((slot, slotIndex) => {
          const clue = stage.clues.find(clue => clue.id === noteForSlot[stageIndex][slotIndex]);
          expect(clue, `Missing clue for ${slot.label}`).toBeDefined();
          expect(clue!.seat % count).not.toBe(slot.seat % count);
        });
      });
    });

    it(`gives each of ${count} people controls and finishes every chapter using their own phone`, () => {
      let state: StoryState = createStoryState('line-13', players(count), 42, `station-${count}`, NOW);
      let actionId = 0;
      for (const [stageIndex, stage] of LINE13_ROOM.stages.entries()) {
        const views = state.players.map(person => projectStoryView(state, person.id));
        expect(views.every(view => view.ownedSlots.length > 0 && (isActivityKind(stage.interaction?.kind) || view.stage.clues.length > 0))).toBe(true);
        expect(views.flatMap(view => view.ownedSlots).sort()).toEqual([0, 1, 2, 3]);
        if (isActivityKind(stage.interaction?.kind)) state = performStoryActivity(state, NOW + 1);
        for (const [slot, value] of stage.answer.entries()) {
          const owner = stage.slots[slot].seat % count;
          const action = { kind: 'edit' as const, id: `station-edit-${++actionId}`, stageIndex, slot, value };
          expect(reduceStoryAction(state, action, state.players[(owner + 1) % count].id, NOW + 1)).toBe(state);
          state = reduceStoryAction(state, action, state.players[owner].id, NOW + 1);
          expect(state.draft[slot]).toBe(value);
        }
        state = reduceStoryAction(state, { kind: 'submit', id: `station-submit-${++actionId}`, stageIndex }, state.players[0].id, NOW + 2);
        expect(state.status).toBe(stageIndex === LINE13_ROOM.stages.length - 1 ? 'won' : 'stage-solved');
        if (state.status === 'stage-solved') state = reduceStoryAction(state, { kind: 'continue', id: `station-next-${++actionId}`, stageIndex }, state.players[0].id, NOW + 3);
      }
      expect(state.solvedStages).toEqual([0, 1, 2, 3, 4]);
      expect(state.assistedStages).toEqual([]);
      expect(state.attemptsUsed).toBe(0);
    });
  }

  it('provides direct map taps and inline radio controls without another picker modal', () => {
    const source = readFileSync(new URL('../src/features/story-rooms/StationBoards.tsx', import.meta.url), 'utf8');
    expect(source).toContain('Place route stop');
    expect(source).toContain('Select route stop');
    expect(source).toContain('accessibilityRole="radio"');
    expect(source).toContain('checked: selected');
    expect(source).not.toContain('<Modal');
    expect(source).not.toContain('onLongPress');
    expect(source).toContain('minHeight: 49');
  });
});
