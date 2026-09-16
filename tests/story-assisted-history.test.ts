import { describe, expect, it } from 'vitest';
import { countsForBoard, gameInputSchema, insertGame, leaderboard } from '../src/features/family-club/model';
import { assistedStoryHistory, isCleanStoryWin } from '../src/features/story-rooms/story-result';
import { STORY_CONTENT_VERSION, type StoryState } from '../src/features/story-rooms/types';

const state = (patch: Partial<StoryState> = {}): StoryState => ({
  version: 1, contentVersion: STORY_CONTENT_VERSION, operationId: 'assisted-case', roomId: 'line-13', seed: 72,
  players: [{ id: 'host', name: 'Osama' }, { id: 'guest', name: 'Feras' }],
  stageIndex: 3, draft: [], revision: 14,
  attemptsUsed: 3, chapterAttemptsUsed: 0, startedAt: 1000, deadlineAt: 901000, endedAt: 61000,
  status: 'won', solvedStages: [0, 2, 3], assistedStages: [1], processedActionIds: [], ...patch,
});

describe('assisted authored case history', () => {
  it('does not classify a finished assisted story as a clean escape', () => {
    expect(isCleanStoryWin(state())).toBe(false);
    expect(isCleanStoryWin(state({ assistedStages: [], solvedStages: [0, 1, 2, 3] }))).toBe(true);
    expect(isCleanStoryWin(state({ status: 'playing', assistedStages: [] }))).toBe(false);
  });

  it('keeps assisted games in history with no leaderboard, timed-game, or win credit', () => {
    const input = assistedStoryHistory(state(), 'LINE 13')!;
    expect(gameInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ title: 'LINE 13 · Assisted', mode: 'escape', practice: true, source: 'authored', durationSeconds: 60 });
    expect(input.participants).toEqual([{ name: 'Osama', won: false }, { name: 'Feras', won: false }]);
    const club = insertGame({ members: [], games: [] }, input);
    expect(club.games).toHaveLength(1);
    expect(countsForBoard(club.games[0])).toBe(false);
    expect(leaderboard(club).every(member => member.games === 0 && member.wins === 0 && member.escapes === 0 && member.timedGames === 0)).toBe(true);
  });

  it('does not record a premature failed game that the family can still reveal and continue', () => {
    for (const status of ['failed', 'playing', 'stage-solved', 'aborted'] as const) expect(assistedStoryHistory(state({ status }), 'LINE 13')).toBeNull();
    expect(assistedStoryHistory(state({ endedAt: undefined }), 'LINE 13')).toBeNull();
    expect(assistedStoryHistory(state({ assistedStages: [] }), 'LINE 13')).toBeNull();
  });

  it('filters the practice companion and cannot duplicate a history entry on reopen', () => {
    const run = state({ players: [{ id: 'host', name: 'Osama' }, { id: 'practice-player', name: 'Partner' }] });
    const first = assistedStoryHistory(run, 'LINE 13')!;
    expect(first.participants).toEqual([{ name: 'Osama', won: false }]);
    const club = insertGame({ members: [], games: [] }, first);
    expect(insertGame(club, assistedStoryHistory(run, 'LINE 13')!)).toBe(club);
  });
});
