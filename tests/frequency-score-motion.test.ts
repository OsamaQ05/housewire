import { describe, expect, it } from 'vitest';

import {
  FREQUENCY_RANK_REVEAL_MS,
  frequencyScoreArrival,
  frequencyScoreDisplayOrder,
} from '../src/features/trivia/frequency-score-motion';
import type { FrequencyScoreboardEntry } from '../src/features/trivia/frequency-scoreboard';

function score(id: string, values: Partial<FrequencyScoreboardEntry> = {}): FrequencyScoreboardEntry {
  return {
    id, label: id, color: '#F7C645', points: 4, previousPoints: 0, delta: 4,
    rank: 1, previousRank: 0, exact: 1, roundPoints: 4, ownerBonus: 0, streak: 1,
    ...values,
  };
}

describe('Frequency score reveal presentation', () => {
  it('starts in the previous leaderboard order and moves the same identities to the final order', () => {
    const entries = [score('noor', { previousRank: 3 }), score('mara', { rank: 2, previousRank: 1 }), score('rami', { rank: 3, previousRank: 2 })];
    const before = JSON.stringify(entries);
    const initial = frequencyScoreDisplayOrder(entries, ['mara', 'noor', 'rami'], false);
    expect(initial.map((entry) => entry.id)).toEqual(['mara', 'rami', 'noor']);
    expect(frequencyScoreDisplayOrder(entries, ['mara', 'noor', 'rami'], true).map((entry) => entry.id)).toEqual(['noor', 'mara', 'rami']);
    expect(initial[2]).toBe(entries[0]);
    expect(JSON.stringify(entries)).toBe(before);
  });

  it('uses setup order for old ties and an all-zero first round instead of leaking final placement', () => {
    const entries = [score('player-3'), score('player-1', { rank: 2 }), score('player-2', { rank: 3 })];
    expect(frequencyScoreDisplayOrder(entries, ['player-1', 'player-2', 'player-3'], false).map((entry) => entry.id)).toEqual(['player-1', 'player-2', 'player-3']);
    expect(frequencyScoreDisplayOrder(entries, [], false).map((entry) => entry.id)).toEqual(['player-1', 'player-2', 'player-3']);
    expect(entries.every((entry) => entry.previousRank === 0)).toBe(true);
  });

  it('preserves authoritative final ranking even when team displayed percentages are identical', () => {
    const entries = [score('team-b', { points: 66.7, rank: 1 }), score('team-a', { points: 66.7, rank: 2 })];
    expect(frequencyScoreDisplayOrder(entries, ['team-a', 'team-b'], true)).toEqual(entries);
  });

  it('finishes every point arrival before rows start moving, without extending waits for large indices', () => {
    for (const index of [0, 1, 2, 3, 10]) {
      const plan = frequencyScoreArrival(score('player'), index, false);
      expect(plan.totalDelay).toBeGreaterThan(800);
      expect(plan.launchDelay + plan.flightDuration).toBeLessThan(FREQUENCY_RANK_REVEAL_MS);
      expect(plan.totalDelay + plan.totalDuration).toBeLessThan(FREQUENCY_RANK_REVEAL_MS);
    }
  });

  it('presents existing individual awards and answer-owner bonuses without adding points', () => {
    expect(frequencyScoreArrival(score('guesser'), 0, false)).toMatchObject({ celebrates: true, deltaLabel: '+4' });
    expect(frequencyScoreArrival(score('owner', { delta: 3, roundPoints: 3, ownerBonus: 3 }), 1, false)).toMatchObject({ celebrates: true, deltaLabel: '+3' });
    expect(frequencyScoreArrival(score('miss', { delta: 0, roundPoints: 0 }), 2, false)).toMatchObject({ celebrates: false, deltaLabel: 'No change' });
  });

  it('celebrates actual team exact matches even when the cumulative rate falls', () => {
    const entry = score('team', { points: 66.7, previousPoints: 100, delta: -33.3, roundPoints: 1, opportunities: 3 });
    expect(frequencyScoreArrival(entry, 0, true)).toMatchObject({ celebrates: true, deltaLabel: '+1 exact' });
    expect(entry.points).toBe(66.7);
    expect(entry.delta).toBe(-33.3);
  });

  it('never creates a point chip for a missed team guess or a team still waiting', () => {
    expect(frequencyScoreArrival(score('miss', { delta: -50, roundPoints: 0, opportunities: 2 }), 0, true)).toMatchObject({ celebrates: false, deltaLabel: 'No new match' });
    expect(frequencyScoreArrival(score('waiting', { points: 0, delta: 0, roundPoints: 0, opportunities: 0, rank: 0 }), 0, true)).toMatchObject({ celebrates: false, deltaLabel: 'Next up' });
  });
});
