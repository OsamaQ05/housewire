import { compareFamilyTriviaTeamRates, familyTriviaTeamRateBasisPoints } from '../../domain/family-trivia-engine';
import type { FamilyTriviaQuestion, FamilyTriviaQuestionResult, FamilyTriviaSessionState } from '../../domain/family-trivia-types';

/** Identity colors follow setup order, never the player's changing position. */
export const FREQUENCY_SCORE_COLORS = ['#F7C645', '#26B8A3', '#FF796A', '#66B5E8'] as const;
export const FREQUENCY_TEAM_COLORS = ['#F5844E', '#65C7B7'] as const;

export interface FrequencyScoreboardEntry {
  id: string;
  label: string;
  color: string;
  /** Actual individual points, or the team's exact-match percentage (one decimal). */
  points: number;
  previousPoints: number;
  /** Signed change in displayed points; team percentages can fall after a miss. */
  delta: number;
  /** Competition ranking (1, 1, 3). Zero means the entire board is still at zero. */
  rank: number;
  previousRank: number;
  exact: number;
  opportunities?: number;
  /** Individual points including ownerBonus; in team mode, exact locks this round. */
  roundPoints: number;
  ownerBonus: number;
  /** Consecutive exact reads, ignoring skipped rounds and rounds without a guess. No bonus. */
  streak: number;
}

export interface FrequencyScoreboard {
  teamMode: boolean;
  entries: FrequencyScoreboardEntry[];
  /** Empty until the current round is revealed; contains no answer content. */
  round: { number: number; answered: number; exact: number; skipped: boolean; title: string };
  totalExact: number;
}

interface VisibleRound {
  question: FamilyTriviaQuestion;
  result: FamilyTriviaQuestionResult;
}

interface Tally {
  id: string;
  label: string;
  color: string;
  points: number;
  exactMatches: number;
  opportunities: number;
  streak: number;
}

/**
 * Pure presentation projection. Existing committed results are the only score
 * source: it never reads secrets, adds awards, or modifies the saved session.
 */
export function buildFrequencyScoreboard(session: FamilyTriviaSessionState): FrequencyScoreboard {
  const teamMode = session.setup.teams.length > 0;
  const showingRound = session.phase === 'revealed' || session.phase === 'complete';
  const currentQuestion = session.pack.questions[session.questionIndex];
  const latestResult = session.results.at(-1);
  const currentResult = showingRound && latestResult?.questionId === currentQuestion?.id ? latestResult : undefined;
  const visibleRounds: VisibleRound[] = session.pack.questions.flatMap((question, index) => {
    if (index > session.questionIndex || (index === session.questionIndex && !currentResult)) return [];
    // A repeated projection or duplicate delivery must never create another award.
    // The last committed version also includes any answer-owner correction.
    const result = session.results.findLast((candidate) => candidate.questionId === question.id);
    return result ? [{ question, result }] : [];
  });
  const previousRounds = currentResult
    ? visibleRounds.filter(({ question }) => question.id !== currentResult.questionId)
    : visibleRounds;
  const current = tally(session, visibleRounds);
  const previous = tally(session, previousRounds);
  const currentRanks = ranks(current, teamMode);
  const previousRanks = ranks(previous, teamMode);
  const currentEntries = currentResult && !currentResult.skipped ? currentResult.playerPoints : [];
  const exactThisRound = currentEntries.filter((entry) => entry.exact).length;
  const entries = [...current].sort((left, right) => compare(right, left, teamMode)).map((entry): FrequencyScoreboardEntry => {
    const before = previous.find((candidate) => candidate.id === entry.id)!;
    const memberIds = teamMode
      ? session.setup.teams.find((team) => team.id === entry.id)!.memberPlayerIds
      : [entry.id];
    const earned = currentEntries.filter((item) => memberIds.includes(item.playerId));
    const ownerBonus = !teamMode && currentResult && currentQuestion.authorityPlayerId === entry.id ? exactThisRound : 0;
    return {
      id: entry.id,
      label: entry.label,
      color: entry.color,
      points: entry.points,
      previousPoints: before.points,
      delta: Number((entry.points - before.points).toFixed(1)),
      rank: currentRanks.get(entry.id)!,
      previousRank: previousRanks.get(entry.id)!,
      exact: entry.exactMatches,
      ...(teamMode ? { opportunities: entry.opportunities } : {}),
      roundPoints: teamMode ? earned.filter((item) => item.exact).length : earned.reduce((sum, item) => sum + item.points, ownerBonus),
      ownerBonus,
      streak: entry.streak,
    };
  });
  return {
    teamMode,
    entries,
    round: currentResult ? {
      number: session.questionIndex + 1,
      answered: currentEntries.length,
      exact: exactThisRound,
      skipped: currentResult.skipped,
      title: currentResult.skipped ? 'Round skipped'
        : currentEntries.length > 0 && exactThisRound === currentEntries.length ? 'All in sync!'
          : exactThisRound > 0 ? 'A little more in sync'
            : currentEntries.some((entry) => entry.points > 0) ? 'Getting closer!'
              : 'A new thing learned',
    } : { number: 0, answered: 0, exact: 0, skipped: false, title: '' },
    totalExact: current.reduce((sum, entry) => sum + entry.exactMatches, 0),
  };
}

function tally(session: FamilyTriviaSessionState, rounds: readonly VisibleRound[]): Tally[] {
  const teamMode = session.setup.teams.length > 0;
  const identities = teamMode ? session.setup.teams : session.setup.players;
  return identities.map((identity, index) => {
    const memberIds = teamMode ? session.setup.teams.find((team) => team.id === identity.id)!.memberPlayerIds : [identity.id];
    const colors = teamMode ? FREQUENCY_TEAM_COLORS : FREQUENCY_SCORE_COLORS;
    const score: Tally = { id: identity.id, label: identity.name, color: colors[index % colors.length], points: 0, exactMatches: 0, opportunities: 0, streak: 0 };
    for (const { question, result } of rounds) {
      if (result.skipped) continue;
      const earned = result.playerPoints.filter((entry) => memberIds.includes(entry.playerId));
      for (const entry of earned) {
        score.points += entry.points;
        score.exactMatches += entry.exact ? 1 : 0;
        score.opportunities += 1;
        score.streak = entry.exact ? score.streak + 1 : 0;
      }
      if (!teamMode && question.authorityPlayerId === identity.id) {
        score.points += result.playerPoints.filter((entry) => entry.exact).length;
      }
    }
    if (teamMode) score.points = Number((familyTriviaTeamRateBasisPoints(score) / 100).toFixed(1));
    return score;
  });
}

function compare(left: Tally, right: Tally, teamMode: boolean): number {
  return teamMode ? compareFamilyTriviaTeamRates(left, right) : left.points - right.points;
}

function ranks(scores: readonly Tally[], teamMode: boolean): Map<string, number> {
  if (scores.every((score) => teamMode ? score.exactMatches === 0 : score.points === 0)) {
    return new Map(scores.map((score) => [score.id, 0]));
  }
  const sorted = [...scores].sort((left, right) => compare(right, left, teamMode));
  let rank = 1;
  return new Map(sorted.map((score, index) => {
    if (index > 0 && compare(score, sorted[index - 1], teamMode) !== 0) rank = index + 1;
    return [score.id, rank];
  }));
}
