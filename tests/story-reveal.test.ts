import { describe, expect, it, vi } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { performStoryActivity } from './helpers/story-activity';

import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, expireStoryState, projectStoryView, reduceStoryAction } from '../src/features/story-rooms/engine';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, storyStateSchema } from '../src/features/story-rooms/story-protocol';
import { pruneStoryCheckpoints } from '../src/features/story-rooms/story-store';
import { STORY_ROOM_IDS, type StoryAction, type StoryRoomId, type StoryStage, type StoryState } from '../src/features/story-rooms/types';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) } }));

const now = 1_800_000_000_000;
const players = [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Partner' }];
let counter = 0;
const begin = (roomId: StoryRoomId = 'line-13') => createStoryState(roomId, players, 71, `reveal-${++counter}`, now);
const act = (state: StoryState, kind: 'reveal' | 'continue' | 'submit' | 'abort', sender = 'host', at = now) =>
  reduceStoryAction(state, { kind, id: `act-${++counter}`, stageIndex: state.stageIndex }, sender, at);
const fill = (state: StoryState, draft: string[]) => {
  const stage = getStoryRoom(state.roomId, state.seed).stages[state.stageIndex];
  if (isActivityKind(stage.interaction?.kind)) return performStoryActivity(state, now);
  return draft.reduce((current, value, slot) => reduceStoryAction(current, {
    kind: 'edit', id: `edit-${++counter}`, stageIndex: current.stageIndex, slot, value,
  }, current.players[stage.slots[slot].seat % current.players.length].id, now), state);
};

function incorrectPlans(stage: StoryStage): string[][] {
  const results: string[][] = [];
  const visit = (draft: string[]) => {
    if (results.length >= 5) return;
    if (draft.length === stage.slots.length) {
      if (draft.some((value, index) => value !== stage.answer[index])) results.push(draft);
      return;
    }
    const slot = stage.slots[draft.length];
    for (const option of stage.options) {
      if (!draft.includes(option.id) && (!slot.optionIds || slot.optionIds.includes(option.id))) visit([...draft, option.id]);
    }
  };
  visit([]);
  return results;
}

describe('explicit reveal and assisted exploration', () => {
  it('requires the host, opens only this chapter, and never awards solved credit', () => {
    const state = begin();
    const stage = getStoryRoom(state.roomId, state.seed).stages[0];
    expect(act(state, 'reveal', 'guest')).toBe(state);
    expect(act(state, 'reveal', 'outsider')).toBe(state);
    const revealed = act(state, 'reveal');
    expect(revealed.status).toBe('stage-solved');
    expect(revealed.draft).toEqual(stage.answer);
    expect(revealed.assistedStages).toEqual([0]);
    expect(revealed.solvedStages).toEqual([]);
    expect(revealed.attemptsUsed).toBe(0);
    for (const player of players) {
      const view = projectStoryView(revealed, player.id);
      expect(view.stage.clues).toHaveLength(stage.clues.length);
      expect(view.stage.revelation).toContain(stage.explanation);
      expect(view.stage).not.toHaveProperty('answer');
      expect(view.room).not.toHaveProperty('stages');
    }
    expect(act(revealed, 'reveal')).toBe(revealed);
    expect(act(revealed, 'submit')).toBe(revealed);
    expect(act(revealed, 'continue', 'guest')).toBe(revealed);
    const next = act(revealed, 'continue');
    expect(next.stageIndex).toBe(1);
    expect(next.draft.every(value => value === '')).toBe(true);
    expect(projectStoryView(next, 'guest').stage.clues.every(clue => clue.seat % 2 === 1)).toBe(true);
    expect(projectStoryView(next, 'guest').stage.revelation).toBe('');
  });

  it('reopens a timed-out case as an untimed exploration without changing the original deadline', () => {
    const state = begin();
    const failed = expireStoryState(state, state.deadlineAt);
    expect(failed.status).toBe('failed');
    expect(act(failed, 'continue')).toBe(failed);
    expect(act(failed, 'reveal', 'guest')).toBe(failed);
    const revealed = act(failed, 'reveal', 'host', state.deadlineAt + 1);
    expect(revealed.status).toBe('stage-solved');
    expect(revealed.endedAt).toBeUndefined();
    expect(revealed.deadlineAt).toBe(state.deadlineAt);
    const next = act(revealed, 'continue', 'host', state.deadlineAt + 2);
    expect(next.status).toBe('playing');
    expect(expireStoryState(next, state.deadlineAt + 60_000)).toBe(next);
    expect(storyStateSchema.safeParse(next).success).toBe(true);
    // The host can also reveal directly if the timer expires between taps.
    expect(act(state, 'reveal', 'host', state.deadlineAt + 1).assistedStages).toEqual([0]);
  });

  it('still limits guesses during exploration, then resets only the next chapter budget', () => {
    let state = act(act(begin(), 'reveal'), 'continue');
    const room = getStoryRoom(state.roomId, state.seed);
    const plans = incorrectPlans(room.stages[1]);
    expect(plans.length).toBeGreaterThanOrEqual(room.attemptLimit);
    for (let index = 0; index < room.attemptLimit; index += 1) {
      state = act(fill(state, plans[index]), 'submit', 'guest');
      expect(state.chapterAttemptsUsed).toBe(index + 1);
      expect(state.status).toBe(index === room.attemptLimit - 1 ? 'failed' : 'playing');
    }
    expect(act(state, 'submit')).toBe(state);
    state = act(state, 'reveal');
    expect(state.assistedStages).toEqual([0, 1]);
    expect(state.solvedStages).toEqual([]);
    state = act(state, 'continue');
    expect(state.chapterAttemptsUsed).toBe(0);
    expect(state.attemptsUsed).toBe(room.attemptLimit);
    // The remaining workshop chapters are physical activities, not another
    // deduction test. Progress is bounded so a final activity can never loop.
    for (let chapter = state.stageIndex; chapter < room.stages.length; chapter++) {
      expect(state.stageIndex).toBe(chapter);
      expect(isActivityKind(room.stages[chapter].interaction?.kind)).toBe(true);
      state = act(state, 'submit');
      expect(state.status).toBe('playing');
      expect(state.chapterAttemptsUsed).toBe(0);
      state = act(fill(state, []), 'submit');
      expect(state.status).toBe(chapter === room.stages.length - 1 ? 'won' : 'stage-solved');
      if (chapter < room.stages.length - 1) state = act(state, 'continue');
    }
    expect(state.chapterAttemptsUsed).toBe(0);
    expect(state.status).toBe('won');
    expect(state.attemptsUsed).toBe(room.attemptLimit);
    expect(storyStateSchema.safeParse(state).success).toBe(true);
  });

  it.each(STORY_ROOM_IDS)('can reveal all %s chapters without earning a clean completion', (roomId) => {
    let state = begin(roomId);
    const room = getStoryRoom(roomId, state.seed);
    for (let index = 0; index < room.stages.length; index += 1) {
      state = act(state, 'reveal');
      expect(state.draft).toEqual(room.stages[index].answer);
      expect(state.solvedStages).toEqual([]);
      expect(storyStateSchema.safeParse(state).success).toBe(true);
      if (index < room.stages.length - 1) state = act(state, 'continue');
    }
    expect(state.status).toBe('won');
    expect(state.assistedStages).toEqual(room.stages.map((_, index) => index));
    expect(act(state, 'reveal')).toBe(state);
    expect(act(state, 'continue')).toBe(state);
  });

  it('keeps independently solved chapters separate from revealed chapters in mixed completion', () => {
    let state = begin();
    const room = getStoryRoom(state.roomId, state.seed);
    for (let index = 0; index < room.stages.length; index += 1) {
      state = index === 1 ? act(state, 'reveal') : act(fill(state, room.stages[index].answer), 'submit');
      if (index < room.stages.length - 1) state = act(state, 'continue');
    }
    expect(state.status).toBe('won');
    expect(state.assistedStages).toEqual([1]);
    expect(state.solvedStages).toEqual(room.stages.map((_, index) => index).filter(index => index !== 1));
    expect(storyStateSchema.safeParse(state).success).toBe(true);
  });

  it('does not revive an aborted room or retrospectively mark a solved chapter as assisted', () => {
    const state = begin();
    const aborted = act(state, 'abort');
    expect(act(aborted, 'reveal')).toBe(aborted);
    const solved = act(fill(state, getStoryRoom(state.roomId, state.seed).stages[0].answer), 'submit');
    expect(act(solved, 'reveal')).toBe(solved);
  });
});

describe('reveal protocol, checkpoints and authority', () => {
  it('authenticates reveal as a host-only action and deduplicates retransmission', () => {
    const state = begin();
    const action: StoryAction = { kind: 'reveal', id: 'one-reveal', stageIndex: 0 };
    const event = (nodeId: string) => ({ kind: 'story.action', roomId: state.roomId, operationId: state.operationId, nodeId, action, sentAt: now });
    expect(authenticateStoryAction(state, event('guest'), 'guest')).toBeUndefined();
    expect(authenticateStoryAction(state, event('host'), 'guest')).toBeUndefined();
    expect(authenticateStoryAction(state, event('host'), 'host')).toEqual(action);
    const next = reduceStoryAction(state, action, 'host', now);
    expect(reduceStoryAction(next, action, 'host', now)).toBe(next);
    const snapshot = makeStorySnapshot(next, now);
    expect(acceptStorySnapshot({ raw: snapshot, senderId: 'host', hostNodeId: 'host', localNodeId: 'guest', roomId: state.roomId, current: state })?.state.assistedStages).toEqual([0]);
    const removedAssistance = { ...next, revision: next.revision + 1, assistedStages: [], solvedStages: [0] };
    expect(acceptStorySnapshot({ raw: makeStorySnapshot(removedAssistance, now), senderId: 'host', hostNodeId: 'host', localNodeId: 'guest', roomId: state.roomId, current: next })).toBeUndefined();
  });

  it('rejects invalid assisted progress and retains assistance across a saved checkpoint', () => {
    const state = act(begin(), 'reveal');
    for (const patch of [
      { assistedStages: [0, 0] }, { assistedStages: [1] }, { solvedStages: [0] },
      { chapterAttemptsUsed: 6 }, { contentVersion: 1 },
    ]) expect(storyStateSchema.safeParse({ ...state, ...patch }).success).toBe(false);
    const saved = pruneStoryCheckpoints({ run: { state, savedAt: now } }, now);
    expect(saved.run.state.assistedStages).toEqual([0]);
    expect(saved.run.state.draft).toEqual(state.draft);
    const { contentVersion: _oldContentVersion, ...legacy } = state;
    expect(pruneStoryCheckpoints({ old: { state: legacy, savedAt: now } }, now)).toEqual({});
  });
});
