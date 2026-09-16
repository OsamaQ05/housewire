import type { ActivityKind, ActivityMove } from '../../src/features/story-rooms/activities/contracts';
import { isActivityKind } from '../../src/features/story-rooms/activities/contracts';
import { MARBLE_SOLUTION_MOVES } from '../../src/features/story-rooms/activities/marble';
import { TIME_HOUSE_SOLUTION } from '../../src/features/story-rooms/activities/time-house';
import { TOOL_SEARCH_SOLUTION } from '../../src/features/story-rooms/activities/tool-search';
import { BENCH_WIRING_SOLUTION_MOVES } from '../../src/features/story-rooms/activities/bench-wiring';
import { CLOCKWORK_SOLUTION_MOVES } from '../../src/features/story-rooms/activities/clockwork';
import { SERVING_TRAY_SOLUTION } from '../../src/features/story-rooms/activities/serving-tray';
import { SHADOW_PLAY_SOLUTION } from '../../src/features/story-rooms/activities/shadow-play';
import { getStoryRoom } from '../../src/features/story-rooms/catalog';
import { reduceStoryAction } from '../../src/features/story-rooms/engine';
import type { StoryState } from '../../src/features/story-rooms/types';

/** These are actual legal moves through the same reducer used by live phones. */
export function activitySolutionMoves(kind: ActivityKind): ActivityMove[] {
  switch (kind) {
    case 'marble-machine': return MARBLE_SOLUTION_MOVES.map(move => ({ ...move }));
    case 'time-house': return TIME_HOUSE_SOLUTION.map(move => ({ ...move }));
    case 'tool-search': return TOOL_SEARCH_SOLUTION.map(move => ({ ...move }));
    case 'bench-wiring': return BENCH_WIRING_SOLUTION_MOVES.map(move => ({ ...move }));
    case 'clockwork-machine': return CLOCKWORK_SOLUTION_MOVES.map(move => ({ ...move }));
    case 'serving-tray': return SERVING_TRAY_SOLUTION.map(move => ({ ...move }));
    case 'shadow-play': return SHADOW_PLAY_SOLUTION.map(move => ({ ...move }));
    case 'rescue-crane': return [
      { control: 0, command: 'travel', value: 1 }, { control: 1, command: 'hoist', value: 0 },
      { control: 3, command: 'grip' }, { control: 1, command: 'hoist', value: 2 },
      { control: 2, command: 'bridge', value: 1 }, { control: 0, command: 'travel', value: 5 },
      { control: 2, command: 'bridge', value: 0 }, { control: 1, command: 'hoist', value: 0 },
      { control: 3, command: 'grip' },
    ];
  }
}

let sequence = 0;
export function performStoryActivity(state: StoryState, now: number): StoryState {
  const stage = getStoryRoom(state.roomId, state.seed).stages[state.stageIndex];
  if (!isActivityKind(stage.interaction?.kind)) return state;
  if (!state.activity || state.activity.kind !== stage.interaction.kind) throw new Error('Activity must be initialized by the engine before playing it.');
  return activitySolutionMoves(stage.interaction.kind).reduce((current, move) => {
    const owner = current.players[stage.slots[move.control].seat % current.players.length].id;
    const next = reduceStoryAction(current, { kind: 'act', id: `physical-move-${++sequence}`, stageIndex: current.stageIndex, ...move }, owner, now);
    if (next === current) throw new Error(`Fixture move rejected: ${stage.interaction?.kind}/${move.command}`);
    return next;
  }, state);
}
