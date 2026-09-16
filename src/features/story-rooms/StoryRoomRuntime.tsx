import { useStoryRoom } from './use-story-room';

/** Lives with the relay provider, not a route: Home never strands other phones. */
export function StoryRoomRuntime() {
  useStoryRoom('line-13', { coordinator: true });
  useStoryRoom('night-glass', { coordinator: true });
  useStoryRoom('long-table', { coordinator: true });
  return null;
}
