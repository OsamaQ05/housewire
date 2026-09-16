import { describe, expect, it } from 'vitest';
import { ACTIVITY_KINDS, isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { activityMoveSchema, activityStateSchema, activitySummary, createActivityState, isActivitySolved, reduceActivityState } from '../src/features/story-rooms/activities/registry';
import { STORY_ROOMS, getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, projectStoryView, reduceStoryAction, solveStage, validateStoryRoom } from '../src/features/story-rooms/engine';
import { storyGuideContext, storyGuideMechanic } from '../src/features/story-rooms/guide-context';
import { authenticateStoryAction, makeStorySnapshot, storyActionSchema, storyStateSchema } from '../src/features/story-rooms/story-protocol';
import { STORY_CONTENT_VERSION, type StoryState } from '../src/features/story-rooms/types';
import { activitySolutionMoves, performStoryActivity } from './helpers/story-activity';

const NOW = 1_800_000_000_000;
const roster = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Member ${i + 1}` }));
const activities = STORY_ROOMS.flatMap(room => room.stages.flatMap((stage, stageIndex) =>
  isActivityKind(stage.interaction?.kind) ? [{ room, stage, stageIndex, kind: stage.interaction.kind }] : []));

function atActivity(index: number, count = 4): StoryState {
  const { room, stageIndex, kind } = activities[index];
  return { ...createStoryState(room.id, roster(count), 781, `activity-${index}-${count}`, NOW),
    stageIndex, draft: [], activity: createActivityState(kind) };
}

describe('shared physical activity registry', () => {
  it('uses content version five and all eight actual activity systems', () => {
    expect(STORY_CONTENT_VERSION).toBe(6);
    expect(activities.map(item => item.kind).sort()).toEqual([...ACTIVITY_KINDS].sort());
    STORY_ROOMS.forEach(room => expect(validateStoryRoom(room)).toEqual([]));
  });

  it.each(ACTIVITY_KINDS)('%s has a bounded valid initial state, real move solution, and no magic answer', kind => {
    const initial = createActivityState(kind);
    expect(initial.kind).toBe(kind);
    expect(activityStateSchema.safeParse(initial).success).toBe(true);
    expect(isActivitySolved(initial)).toBe(false);
    expect(reduceActivityState(initial, { control: 0, command: 'invented-command' })).toBe(initial);
    const finished = activitySolutionMoves(kind).reduce((state, move) => {
      const next = reduceActivityState(state, move);
      expect(next).not.toBe(state);
      expect(activityStateSchema.safeParse(next).success).toBe(true);
      return next;
    }, initial);
    expect(isActivitySolved(finished)).toBe(true);
    expect(activitySummary(initial, [0]).length).toBeGreaterThan(0);
    expect(activityStateSchema.safeParse({ ...initial, injected: 'secret' }).success).toBe(false);
  });

  it('bounds the command envelope before reducer work', () => {
    const valid = { control: 0, command: 'adjust', value: 1 };
    expect(activityMoveSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, control: -1 }, { ...valid, control: 4 }, { ...valid, control: .5 },
      { ...valid, command: '' }, { ...valid, command: 'x'.repeat(41) }, { ...valid, command: 'script()' },
      { ...valid, value: Infinity }, { ...valid, value: .1 }, { ...valid, value: 1001 }, { ...valid, extra: true },
    ]) expect(activityMoveSchema.safeParse(invalid).success).toBe(false);
    expect(storyActionSchema.safeParse({ kind: 'act', id: 'bounded', stageIndex: 0, ...valid }).success).toBe(true);
    expect(storyActionSchema.safeParse({ kind: 'act', id: 'bounded', stageIndex: 0, ...valid, execute: true }).success).toBe(false);
  });

  for (const [index, { room, stage, stageIndex, kind }] of activities.entries()) {
    describe(`${room.title}: ${kind}`, () => {
      it('initializes through chapter progression and never passes the arrangement solver', () => {
        expect(stage.options).toEqual([]); expect(stage.answer).toEqual([]); expect(stage.constraints).toEqual([]);
        expect(solveStage(stage)).toEqual([]);
        if (stageIndex > 0) {
          let prior = createStoryState(room.id, roster(2), 7, 'enter-activity', NOW);
          for (let chapter = 0; chapter < stageIndex; chapter++) {
            prior = reduceStoryAction(prior, { kind: 'reveal', id: `skip-${chapter}`, stageIndex: chapter }, 'p0', NOW);
            prior = reduceStoryAction(prior, { kind: 'continue', id: `next-${chapter}`, stageIndex: chapter }, 'p0', NOW);
          }
          expect(prior.activity).toEqual(createActivityState(kind));
          expect(prior.draft).toEqual([]);
          expect(storyStateSchema.safeParse(prior).success).toBe(true);
        }
      });

      it('requires each actual control owner at two, three, and four phones', () => {
        for (const count of [2, 3, 4]) {
          const state = atActivity(index, count);
          const move = activitySolutionMoves(kind)[0];
          const owner = stage.slots[move.control].seat % count;
          const action = { kind: 'act' as const, id: 'first-move', stageIndex, ...move };
          expect(reduceStoryAction(state, action, `p${(owner + 1) % count}`, NOW)).toBe(state);
          const next = reduceStoryAction(state, action, `p${owner}`, NOW);
          expect(next.revision).toBe(state.revision + 1);
          expect(next.activity).not.toEqual(state.activity);
          expect(reduceStoryAction(next, action, `p${owner}`, NOW)).toBe(next);
          for (const person of state.players) expect(projectStoryView(state, person.id).ownedSlots.length).toBeGreaterThan(0);
        }
      });

      it('rejects foreign commands, malformed moves, and arrangement edits without charging an attempt', () => {
        const state = atActivity(index);
        const invalid = { kind: 'act' as const, id: 'invalid', stageIndex, control: 0, command: 'not-a-command' };
        expect(reduceStoryAction(state, invalid, 'p0', NOW)).toBe(state);
        expect(reduceStoryAction(state, { ...invalid, control: -1 }, 'p0', NOW)).toBe(state);
        expect(reduceStoryAction(state, { ...invalid, control: .5 }, 'p0', NOW)).toBe(state);
        expect(reduceStoryAction(state, { kind: 'edit', id: 'arrangement', stageIndex, slot: 0, value: '' }, 'p0', NOW)).toBe(state);
        expect(reduceStoryAction(state, { kind: 'probe', id: 'probe', stageIndex, probeId: 'tap' }, 'p0', NOW)).toBe(state);
        expect(state.attemptsUsed).toBe(0);
      });

      it('does not accept an empty answer as a win, but does accept completed physical progress', () => {
        let state = atActivity(index);
        for (let attempt = 0; attempt < 7; attempt++) {
          state = reduceStoryAction(state, { kind: 'submit', id: `check-${attempt}`, stageIndex }, 'p1', NOW);
          expect(state.status).toBe('playing');
          expect(state.attemptsUsed).toBe(0);
          expect(state.chapterAttemptsUsed).toBe(0);
        }
        state = performStoryActivity(state, NOW);
        expect(isActivitySolved(state.activity!)).toBe(true);
        const completed = reduceStoryAction(state, { kind: 'submit', id: 'complete', stageIndex }, 'p1', NOW);
        expect(completed.status).toBe(stageIndex === room.stages.length - 1 ? 'won' : 'stage-solved');
        expect(completed.solvedStages).toContain(stageIndex);
      });

      it('matches state to the chapter and authenticates both sender identity and ownership', () => {
        const state = atActivity(index);
        const move = activitySolutionMoves(kind)[0];
        const owner = stage.slots[move.control].seat;
        const action = { kind: 'act', id: 'from-phone', stageIndex, ...move };
        const event = { kind: 'story.action', roomId: room.id, operationId: state.operationId, nodeId: `p${owner}`, action, sentAt: NOW };
        expect(authenticateStoryAction(state, event, `p${owner}`)).toEqual(action);
        expect(authenticateStoryAction(state, event, `p${(owner + 1) % 4}`)).toBeUndefined();
        expect(storyStateSchema.safeParse(state).success).toBe(true);
        expect(storyStateSchema.safeParse({ ...state, activity: undefined }).success).toBe(false);
        const anotherKind = ACTIVITY_KINDS.find(other => other !== kind)!;
        expect(storyStateSchema.safeParse({ ...state, activity: createActivityState(anotherKind) }).success).toBe(false);
        expect(storyStateSchema.safeParse({ ...state, draft: ['bypass'] }).success).toBe(false);
        expect(storyStateSchema.safeParse({ ...state, contentVersion: 3 }).success).toBe(false);
        expect(makeStorySnapshot(state, NOW).state.activity).toEqual(state.activity);
        const nonActivity = createStoryState('line-13', roster(2), 7, 'normal-stage', NOW);
        expect(storyStateSchema.safeParse({ ...nonActivity, activity: state.activity }).success).toBe(false);
      });

      it('reveals the explanation without a fake win and initializes the next stage cleanly', () => {
        const state = atActivity(index);
        const reveal = { kind: 'reveal' as const, id: 'reveal-physical', stageIndex };
        expect(reduceStoryAction(state, reveal, 'p1', NOW)).toBe(state);
        const revealed = reduceStoryAction(state, reveal, 'p0', NOW);
        expect(revealed.assistedStages).toEqual([stageIndex]);
        expect(revealed.solvedStages).toEqual([]);
        expect(isActivitySolved(revealed.activity!)).toBe(false);
        expect(projectStoryView(revealed, 'p1').stage.revelation).toBe(stage.explanation);
        if (stageIndex < room.stages.length - 1) {
          const next = reduceStoryAction(revealed, { kind: 'continue', id: 'continue-physical', stageIndex }, 'p0', NOW);
          const upcoming = getStoryRoom(room.id).stages[stageIndex + 1];
          expect(next.activity).toEqual(isActivityKind(upcoming.interaction?.kind) ? createActivityState(upcoming.interaction.kind) : undefined);
        }
      });

      it('gives the guide current visible state without answer fixtures or future chapters', () => {
        const state = atActivity(index);
        const view = projectStoryView(state, 'p0');
        const context = storyGuideContext(state, view, [], room.stages.length);
        expect(context.clues).toEqual(expect.arrayContaining(activitySummary(state.activity!, view.ownedSlots)));
        expect(context.progress).toContain('Do not provide a complete move sequence');
        expect(JSON.stringify(context)).not.toContain('SOLUTION_MOVES');
        expect(JSON.stringify(context)).not.toContain(stage.explanation);
        expect(storyGuideMechanic(stage)).toBe(kind === 'tool-search' ? 'deduction' : 'coordination');
      });
    });
  }
});
