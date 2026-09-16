import { describe, expect, it } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { createActivityState, isActivitySolved } from '../src/features/story-rooms/activities/registry';
import { performStoryActivity } from './helpers/story-activity';
import { STORY_ROOMS } from '../src/features/story-rooms/catalog';
import { OTHER_STORY_RULE_GROUPS } from '../src/features/story-rooms/rooms/catalog-evidence';
import { createStoryState, projectStoryView, solveStage, validateStoryRoom } from '../src/features/story-rooms/engine';
import { filmComposite } from '../src/features/story-rooms/interaction-rules';
import type { StoryConstraint, StoryStage } from '../src/features/story-rooms/types';

function groupsFor(stage: StoryStage): StoryConstraint[][] {
  // LINE 13's four private updates are paired 0↔1, 2↔3, as in the other catalogs.
  return OTHER_STORY_RULE_GROUPS[stage.id] ?? Array.from({ length: 4 }, (_, seat) =>
    stage.constraints.filter(rule => rule.kind === 'at' && rule.slot === (seat ^ 1)));
}

describe('three themed authored rooms', () => {
  it('contains three distinct stories: five workshop chapters and four in each other room', () => {
    expect(STORY_ROOMS.map(room => room.id)).toEqual(['line-13', 'night-glass', 'long-table']);
    expect(new Set(STORY_ROOMS.map(room => room.accent)).size).toBe(3);
    expect(new Set(STORY_ROOMS.flatMap(room => room.stages.map(stage => stage.id))).size).toBe(13);
  });

  for (const room of STORY_ROOMS) {
    describe(room.title, () => {
      it('is complete, clearly described, and has a bounded mistake budget', () => {
        expect(validateStoryRoom(room)).toEqual([]);
        expect(room.stages).toHaveLength(room.id === 'line-13' ? 5 : 4);
        expect(room.attemptLimit).toBeGreaterThanOrEqual(3);
        expect(room.attemptLimit).toBeLessThanOrEqual(5);
        expect(room.opening.trim()).not.toBe('');
        expect(room.ending.trim()).not.toBe('');
      });

      for (const [stageIndex, stage] of room.stages.entries()) {
        const activity = isActivityKind(stage.interaction?.kind);
        const glass = stage.interaction?.kind === 'lightbox';
        const publicGeometry = glass || stage.interaction?.kind === 'route-map';
        it(`${stage.title}: evidence and physical rules agree on one plan`, () => {
          if (isActivityKind(stage.interaction?.kind)) {
            expect(solveStage(stage)).toEqual([]);
            expect(stage.options).toEqual([]); expect(stage.answer).toEqual([]);
            const state = { ...createStoryState(room.id, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 1, `proof-${stage.id}`, 1_000), stageIndex, draft: [], activity: createActivityState(stage.interaction.kind) };
            expect(isActivitySolved(performStoryActivity(state, 1_001).activity!)).toBe(true);
            return;
          }
          expect(solveStage(stage)).toEqual([stage.answer]);
          expect(stage.options.length).toBeGreaterThan(stage.slots.length);
          expect(stage.options.every(option => option.label.trim() && option.detail?.trim())).toBe(true);
        });

        it(`${stage.title}: every role has a meaningful contribution`, () => {
          if (activity) { expect(stage.slots.map(slot => slot.seat).sort()).toEqual([0, 1, 2, 3]); return; }
          if (glass && stage.interaction?.kind === 'lightbox') {
            expect(stage.clues).toEqual([]);
            expect(stage.constraints).toEqual([]);
            expect(OTHER_STORY_RULE_GROUPS[stage.id]).toBeUndefined();
            // Each physical piece adds something irreplaceable to the shared picture.
            for (let missing = 0; missing < 4; missing++) {
              const without = { ...stage, interaction: { ...stage.interaction, films: stage.interaction.films.map((film, index) => index === missing ? [] : film) } };
              expect(filmComposite(without, stage.answer)).not.toEqual(stage.interaction.target);
            }
            return;
          }
          const groups = groupsFor(stage);
          expect(groups).toHaveLength(4);
          for (let seat = 0; seat < 4; seat++) {
            expect(stage.clues.some(clue => clue.seat === seat)).toBe(true);
            expect(stage.slots.some(slot => slot.seat === seat)).toBe(true);
            expect(groups[seat].length).toBeGreaterThan(0);
            // The map can corroborate a missing location update spatially.
            // Independent stations and private table evidence cannot do that.
            if (!publicGeometry) {
              const remaining = groups.flatMap((rules, index) => index === seat ? [] : rules);
              expect(solveStage({ ...stage, constraints: remaining }).length, `${stage.id}: missing role ${seat}`).toBeGreaterThan(1);
            }
          }
        });

        it(`${stage.title}: distributes controls and useful private information across 2, 3, and 4 phones`, () => {
          for (const count of [2, 3, 4]) {
            const players = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Player ${index + 1}` }));
            const state = { ...createStoryState(room.id, players, 1, `catalog-${stage.id}-${count}`, 1_000), stageIndex, draft: stage.answer, activity: isActivityKind(stage.interaction?.kind) ? createActivityState(stage.interaction.kind) : undefined };
            const controlled: number[] = [];
            for (const [phone, player] of players.entries()) {
              const view = projectStoryView(state, player.id);
              expect(view.ownedSlots.length).toBeGreaterThan(0);
              expect(view.ownedSlots.length).toBeLessThan(4);
              controlled.push(...view.ownedSlots);
              if (activity) {
                expect(state.activity?.kind).toBe(stage.interaction?.kind);
              } else if (glass && view.stage.interaction?.kind === 'lightbox') {
                expect(view.stage.clues).toEqual([]);
                expect(view.stage.interaction.films.filter(film => film.length).length).toBe(view.ownedSlots.length);
                expect(view.stage.interaction.preview).toEqual(filmComposite(stage, state.draft));
              } else {
                expect(view.stage.clues.length).toBeGreaterThan(0);
                expect(view.stage.clues.every(clue => clue.seat % count === phone)).toBe(true);
                if (!publicGeometry) {
                  const privateRules = groupsFor(stage).flatMap((rules, seat) => seat % count === phone ? rules : []);
                  expect(solveStage({ ...stage, constraints: privateRules }).length, `${stage.id}: phone ${phone + 1}/${count} must need a teammate`).toBeGreaterThan(1);
                }
              }
            }
            expect(controlled.sort()).toEqual([0, 1, 2, 3]);
          }
        });

        it(`${stage.title}: names the task and offers readable clues without rewarding verbose prose`, () => {
          expect(stage.objective.trim()).not.toBe('');
          expect(stage.instruction.trim()).not.toBe('');
          expect(stage.instruction.length).toBeLessThan(240);
          expect(stage.slots.every(slot => slot.label.trim())).toBe(true);
          expect(stage.hints.length).toBeGreaterThanOrEqual(2);
          expect(stage.explanation.trim()).not.toBe('');
          expect(stage.clues.every(clue => clue.lines.length > 0 && clue.lines.every(line => line.trim()))).toBe(true);
          for (const clue of stage.clues.filter(clue => clue.medium === 'lens')) {
            expect(clue.illustration).toBeDefined();
            for (const phones of [2, 3, 4]) expect(clue.scanTargetSeat! % phones).not.toBe(clue.seat % phones);
            expect(clue.diagram?.nodes.length).toBeGreaterThanOrEqual(2);
            expect(clue.diagram?.nodes.length).toBeLessThanOrEqual(4);
            expect(clue.diagram?.caption.trim()).toBeTruthy();
          }
        });
      }
    });
  }

  it('removes mandatory sound decoding and the old floorplan before the glass activity', () => {
    for (const room of STORY_ROOMS) {
      expect(room.stages.some(stage => stage.kind === 'rhythm')).toBe(false);
      expect(room.stages.flatMap(stage => stage.clues).some(clue => clue.beats?.length)).toBe(false);
    }
    const room = STORY_ROOMS.find(room => room.id === 'night-glass')!;
    expect(room.stages[0].id).toBe('night-glass-negative');
    expect(room.stages.some(stage => stage.id === 'night-glass-original')).toBe(false);
  });

  it('uses scoped glass rotations with one real geometric solution and no written puzzle', () => {
    const stage = STORY_ROOMS.find(room => room.id === 'night-glass')!.stages[0];
    expect(stage.options).toHaveLength(16);
    expect(stage.constraints).toEqual([]);
    expect(stage.clues).toEqual([]);
    expect(solveStage(stage)).toEqual([stage.answer]);
    for (const slot of stage.slots) {
      expect(slot.optionIds).toHaveLength(4);
      expect(slot.optionIds?.map(id => stage.options.find(option => option.id === id)?.turn)).toEqual([0, 1, 2, 3]);
    }
  });

  it('places direct matching information on another phone from the control it describes', () => {
    for (const stage of STORY_ROOMS.flatMap(room => room.stages).filter(stage => stage.constraints.every(rule => rule.kind === 'at') && stage.clues.length)) {
      for (let seat = 0; seat < 4; seat++) {
        for (const rule of groupsFor(stage)[seat]) {
          expect(rule.kind).toBe('at');
          if (rule.kind === 'at') for (const phones of [2, 3, 4]) expect(stage.slots[rule.slot].seat % phones).not.toBe(seat % phones);
        }
      }
    }
  });
});
