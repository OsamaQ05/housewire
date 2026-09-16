import { describe, expect, it } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { isActivitySolved } from '../src/features/story-rooms/activities/registry';
import { STORY_ROOMS } from '../src/features/story-rooms/catalog';
import { createStoryState, reduceStoryAction } from '../src/features/story-rooms/engine';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, storyStateSchema } from '../src/features/story-rooms/story-protocol';
import { STORY_CONTENT_VERSION, type StoryAction } from '../src/features/story-rooms/types';
import { activitySolutionMoves } from './helpers/story-activity';

const NOW = 1_800_000_000_000;
const activities = STORY_ROOMS.flatMap(room => room.stages.flatMap((stage, chapter) =>
  isActivityKind(stage.interaction?.kind) ? [{ room, stage, chapter, kind: stage.interaction.kind }] : []));

describe('v5 complete-action ownership and checkpoint recovery', () => {
  for (const { room, stage, chapter, kind } of activities) for (const count of [2, 3, 4]) {
    it(`${kind}: all ${count} players retain exact controls through a snapshot resume`, () => {
      const players = Array.from({ length: count }, (_, seat) => ({ id: `person-${seat}`, name: `Player ${seat + 1}` }));
      let state = createStoryState(room.id, players, 721, `resume-${kind}-${count}`, NOW);
      for (let prior = 0; prior < chapter; prior++) {
        state = reduceStoryAction(state, { kind: 'reveal', id: `reveal-${prior}`, stageIndex: prior }, players[0].id, NOW);
        state = reduceStoryAction(state, { kind: 'continue', id: `continue-${prior}`, stageIndex: prior }, players[0].id, NOW);
      }
      const moves = activitySolutionMoves(kind);
      for (const [step, move] of moves.entries()) {
        const owner = players[stage.slots[move.control].seat % count];
        const action: StoryAction = { kind: 'act', id: `action-${step}`, stageIndex: chapter, ...move };
        const envelope = { kind: 'story.action', roomId: room.id, operationId: state.operationId, nodeId: owner.id, action, sentAt: NOW };
        for (const other of players.filter(player => player.id !== owner.id)) {
          expect(authenticateStoryAction(state, envelope, other.id)).toBeUndefined();
          expect(authenticateStoryAction(state, { ...envelope, nodeId: other.id }, other.id)).toBeUndefined();
          expect(reduceStoryAction(state, action, other.id, NOW)).toBe(state);
        }
        const accepted = authenticateStoryAction(state, envelope, owner.id);
        expect(accepted).toEqual(action);
        const next = reduceStoryAction(state, accepted!, owner.id, NOW);
        expect(next).not.toBe(state);
        expect(reduceStoryAction(next, action, owner.id, NOW)).toBe(next);
        expect(storyStateSchema.safeParse(next).success).toBe(true);
        state = next;
        if (step === Math.floor(moves.length / 2)) {
          const snapshot = JSON.parse(JSON.stringify(makeStorySnapshot(state, NOW)));
          for (const person of players) {
            const recovered = acceptStorySnapshot({ raw: snapshot, senderId: players[0].id, hostNodeId: players[0].id, localNodeId: person.id, roomId: room.id });
            expect(recovered?.state).toEqual(state);
          }
          state = storyStateSchema.parse(snapshot.state);
          const outdated = { ...snapshot, state: { ...snapshot.state, contentVersion: 5 } };
          expect(acceptStorySnapshot({ raw: outdated, senderId: players[0].id, hostNodeId: players[0].id, localNodeId: players[1].id, roomId: room.id })).toBeUndefined();
        }
      }
      expect(state.contentVersion).toBe(STORY_CONTENT_VERSION);
      expect(isActivitySolved(state.activity!)).toBe(true);
      state = reduceStoryAction(state, { kind: 'submit', id: 'finish', stageIndex: chapter }, players[count - 1].id, NOW);
      expect(state.status).toBe(chapter === room.stages.length - 1 ? 'won' : 'stage-solved');
      expect(state.solvedStages).toContain(chapter);
      expect(storyStateSchema.safeParse(state).success).toBe(true);
    });
  }
});
