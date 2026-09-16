import { describe, expect, it } from 'vitest';
import { BENCH_WIRING_SOLUTION_MOVES } from '../src/features/story-rooms/activities/bench-wiring';
import { createStoryState, reduceStoryAction } from '../src/features/story-rooms/engine';
import { authenticateStoryAction, storyStateSchema } from '../src/features/story-rooms/story-protocol';
import type { StoryAction } from '../src/features/story-rooms/types';

describe('simpler games keep multiplayer authority', () => {
  for (const count of [2, 3, 4]) it(`only a cable owner may undo or reel in with ${count} players`, () => {
    const players = Array.from({ length: count }, (_, i) => ({ id: `player-${i}`, name: `Player ${i + 1}` }));
    let state = createStoryState('line-13', players, 18, `routing-${count}`, 1000);
    for (let prior = 0; prior < 2; prior++) {
      state = reduceStoryAction(state, { kind: 'reveal', id: `reveal-${prior}`, stageIndex: prior }, players[0].id, 1000);
      state = reduceStoryAction(state, { kind: 'continue', id: `next-${prior}`, stageIndex: prior }, players[0].id, 1000);
    }
    const segment = BENCH_WIRING_SOLUTION_MOVES[0];
    state = reduceStoryAction(state, { kind: 'act', id: 'lay-segment', stageIndex: 2, ...segment }, players[0].id, 1000);
    for (const command of ['undo', 'reset']) {
      const action: StoryAction = { kind: 'act', id: command, stageIndex: 2, control: 0, command };
      const envelope = { kind: 'story.action', roomId: state.roomId, operationId: state.operationId, nodeId: players[0].id, action, sentAt: 1000 };
      for (const foreign of players.slice(1)) {
        expect(authenticateStoryAction(state, envelope, foreign.id)).toBeUndefined();
        expect(reduceStoryAction(state, action, foreign.id, 1000)).toBe(state);
      }
      const changed = reduceStoryAction(state, action, players[0].id, 1000);
      expect(changed).not.toBe(state);
      expect(storyStateSchema.safeParse(changed).success).toBe(true);
      expect(changed.activity?.kind === 'bench-wiring' && changed.activity.paths[0]).toEqual([0]);
    }
    expect(storyStateSchema.safeParse({ ...state, contentVersion: 5 }).success).toBe(false);
  });
});
