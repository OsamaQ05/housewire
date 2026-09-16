import { LINE13_ROOM } from './rooms/line13';
import { OTHER_STORY_ROOMS } from './rooms/other-rooms';
import type { StoryRoom, StoryRoomId } from './types';

export const STORY_ROOMS: StoryRoom[] = [LINE13_ROOM, ...OTHER_STORY_ROOMS];

/** Presentation order never gives away the authored answer, and stays stable on rejoin. */
export function getStoryRoom(id: StoryRoomId, seed = 1): StoryRoom {
  const room = STORY_ROOMS.find((candidate) => candidate.id === id);
  if (!room) throw new Error('That story room is not available.');
  let value = seed | 0;
  for (const letter of id) value = Math.imul(value ^ letter.charCodeAt(0), 16777619);
  const random = () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return {
    ...room,
    roles: [...room.roles],
    stages: room.stages.map((stage) => {
      const options = stage.options.map((option) => ({ ...option }));
      for (let index = options.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [options[index], options[swap]] = [options[swap], options[index]];
      }
      return {
        ...stage, options,
        slots: stage.slots.map((slot) => ({ ...slot, optionIds: slot.optionIds ? [...slot.optionIds] : undefined })),
        interaction: stage.interaction ? JSON.parse(JSON.stringify(stage.interaction)) : undefined,
        clues: stage.clues.map((clue) => ({ ...clue, lines: [...clue.lines], beats: clue.beats ? [...clue.beats] : undefined, observations: clue.observations?.map((observation) => ({ ...observation, lines: [...observation.lines], beats: observation.beats ? [...observation.beats] : undefined })) })),
        constraints: stage.constraints.map((constraint) => ({ ...constraint })),
        answer: [...stage.answer], hints: [...stage.hints],
        experiments: stage.experiments?.map((experiment) => ({ ...experiment })),
      };
    }),
  };
}
