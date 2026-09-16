import type { FrequencyScoreboardEntry } from './frequency-scoreboard';

export const FREQUENCY_RANK_REVEAL_MS = 1400;
export const FREQUENCY_RANK_SLIDE_MS = 360;

/** Keep ties in setup order, including the first round when every old rank is zero. */
export function frequencyScoreDisplayOrder(
  entries: readonly FrequencyScoreboardEntry[],
  identityIds: readonly string[],
  settled: boolean,
): FrequencyScoreboardEntry[] {
  if (settled) return [...entries];
  const identityOrder = new Map(identityIds.map((id, index) => [id, index]));
  return [...entries].sort((left, right) => (
    left.previousRank - right.previousRank
    || (identityOrder.get(left.id) ?? Infinity) - (identityOrder.get(right.id) ?? Infinity)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  ));
}

/** Timing and labels only. This never calculates or awards game points. */
export function frequencyScoreArrival(entry: FrequencyScoreboardEntry, identityIndex: number, teamMode: boolean) {
  const launchDelay = 220 + Math.max(0, Math.min(3, identityIndex)) * 60;
  return {
    launchDelay,
    flightDuration: 940,
    totalDelay: launchDelay + 650,
    totalDuration: 340,
    celebrates: teamMode ? entry.roundPoints > 0 : entry.delta > 0,
    deltaLabel: teamMode
      ? entry.roundPoints > 0 ? `+${entry.roundPoints} exact` : entry.opportunities ? 'No new match' : 'Next up'
      : entry.delta === 0 ? 'No change' : `${entry.delta > 0 ? '+' : ''}${entry.delta}`,
  };
}
