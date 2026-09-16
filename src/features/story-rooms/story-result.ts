import type { ClubGameInput } from '../family-club/model';
import type { StoryState } from './types';

export function isCleanStoryWin(state: StoryState): boolean {
  return state.status === 'won' && state.assistedStages.length === 0;
}

/** A revealed case belongs in history, never the competitive board or escape-win count. */
export function assistedStoryHistory(state: StoryState, title: string): ClubGameInput | null {
  if (state.status !== 'won' || !state.assistedStages.length || state.endedAt === undefined) return null;
  return {
    id: `story-assisted:${state.operationId}`, mode: 'escape', title: `${title} · Assisted`,
    playedAt: new Date(state.endedAt).toISOString(),
    durationSeconds: Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000)),
    retries: state.attemptsUsed, caseId: state.roomId, practice: true, source: 'authored',
    participants: state.players.filter(player => player.id !== 'practice-player').map(player => ({ name: player.name, won: false })),
  };
}
