import { describe, expect, it } from 'vitest';
import { STORY_ROOMS } from '../src/features/story-rooms/catalog';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { validateStoryRoom } from '../src/features/story-rooms/engine';

describe('room variety is a product rule, not a copy change', () => {
  it('caps authored written-clue / answer stages at two per room', () => {
    const counts = STORY_ROOMS.map(room => room.stages.filter(stage => stage.clues.length && !isActivityKind(stage.interaction?.kind)).length);
    expect(counts).toEqual([2, 1, 1]);
    for (const room of STORY_ROOMS) expect(new Set(room.stages.map(stage => stage.interaction?.kind)).size).toBe(room.stages.length);
  });
  it('gives After Hours a genuine fifth construction activity, keeping the crane', () => {
    const workshop = STORY_ROOMS[0];
    expect(workshop.stages[3].interaction?.kind).toBe('rescue-crane');
    expect(workshop.stages[4].interaction?.kind).toBe('clockwork-machine');
    expect(workshop.stages[4].options).toEqual([]);
    expect(workshop.stages[4].answer).toEqual([]);
  });
  it('rejects a future return to three clue-and-answer chapters', () => {
    const room = STORY_ROOMS[0];
    const repeat = { ...room.stages[0], id: 'unwanted-third-answer-stage' };
    expect(validateStoryRoom({ ...room, stages: [...room.stages, repeat] })).toContain('A room may contain at most two written-clue answer chapters.');
  });
});
