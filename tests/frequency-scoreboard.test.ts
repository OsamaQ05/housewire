import { describe, expect, it } from 'vitest';

import {
  advanceFamilyTriviaQuestion,
  createFamilyTriviaSession,
  createQuickFamilyTriviaSetup,
  generateOfflineFamilyTriviaPack,
  revealFamilyTriviaQuestion,
  reviewFamilyTriviaTextGuess,
  submitFamilyTriviaGuess,
  submitFamilyTriviaReference,
  type FamilyTriviaAnswer,
  type FamilyTriviaQuestion,
  type FamilyTriviaQuestionResult,
  type FamilyTriviaSessionState,
} from '../src/domain/family-trivia';
import { buildFrequencyScoreboard, FREQUENCY_SCORE_COLORS } from '../src/features/trivia/frequency-scoreboard';

function session(teams = false): FamilyTriviaSessionState {
  const setup = createQuickFamilyTriviaSetup(['Mara', 'Samir', 'Noor', 'Rami'], { teams });
  return createFamilyTriviaSession(setup, generateOfflineFamilyTriviaPack({ setup, seed: 'scoreboard', questionCount: 8 }));
}

function answer(question: FamilyTriviaQuestion): FamilyTriviaAnswer {
  if (question.answerKind === 'choice') return { kind: 'choice', optionId: question.options[0].id };
  if (question.answerKind === 'ordering') return { kind: 'ordering', optionIds: question.options.map((option) => option.id) };
  if (question.answerKind === 'spectrum') return { kind: 'spectrum', value: 50 };
  return { kind: 'text', value: 'popcorn' };
}

function reveal(state: FamilyTriviaSessionState): FamilyTriviaSessionState {
  const question = state.pack.questions[state.questionIndex];
  let next = submitFamilyTriviaReference(state, question.authorityPlayerId, answer(question)).state;
  for (const playerId of question.respondentPlayerIds) next = submitFamilyTriviaGuess(next, playerId, answer(question)).state;
  return revealFamilyTriviaQuestion(next, next.setup.hostPlayerId).state;
}

function recordedRounds(
  rows: readonly { owner?: string; skipped?: boolean; guesses: readonly (readonly [string, number, boolean])[] }[],
  teams = false,
): FamilyTriviaSessionState {
  const base = session(teams);
  const questions: FamilyTriviaQuestion[] = rows.map((row, index) => ({
    id: `round-${index}`,
    kind: 'preference-match',
    answerKind: 'choice',
    authorityPlayerId: row.owner ?? 'player-4',
    respondentPlayerIds: row.guesses.map(([id]) => id),
    prompt: 'Which snack would you pick?',
    afterRevealPrompt: 'A snack for next time.',
    canSkip: true,
    options: [{ id: 'a', label: 'Popcorn' }, { id: 'b', label: 'Fruit' }],
  }));
  const results: FamilyTriviaQuestionResult[] = rows.map((row, index) => ({
    questionId: questions[index].id,
    skipped: row.skipped ?? false,
    playerPoints: row.guesses.map(([playerId, points, exact]) => ({ playerId, points, exact })),
  }));
  return { ...base, phase: 'revealed', questionIndex: questions.length - 1, pack: { ...base.pack, questions }, results };
}

describe('Family Frequency round scoreboard', () => {
  it('matches the real engine totals, including owner points, across a complete game', () => {
    let state = session();
    for (let index = 0; index < state.pack.questions.length; index += 1) {
      state = reveal(state);
      const board = buildFrequencyScoreboard(state);
      for (const score of state.playerScores) {
        expect(board.entries.find((entry) => entry.id === score.playerId)).toMatchObject({ points: score.points, exact: score.exactMatches });
      }
      const owner = board.entries.find((entry) => entry.id === state.pack.questions[index].authorityPlayerId)!;
      expect(owner.ownerBonus).toBe(state.results.at(-1)!.playerPoints.length);
      expect(owner.roundPoints).toBe(owner.ownerBonus);
      state = advanceFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;
    }
    expect(state.phase).toBe('complete');
    expect(buildFrequencyScoreboard(state).round.number).toBe(8);
  });

  it('recomputes owner adjustments without awarding duplicate points on redraw or reload', () => {
    const base = session();
    const textQuestion = base.pack.questions.find((question) => question.answerKind === 'text')!;
    let state: FamilyTriviaSessionState = { ...base, pack: { ...base.pack, questions: [textQuestion, ...base.pack.questions.filter((question) => question.id !== textQuestion.id)] } };
    state = reveal(state);
    const respondent = textQuestion.respondentPlayerIds[0];
    state = reviewFamilyTriviaTextGuess(state, textQuestion.authorityPlayerId, respondent, 'miss').state;
    const missed = buildFrequencyScoreboard(state);
    expect(missed.entries.find((entry) => entry.id === respondent)).toMatchObject({ points: 0, exact: 0, roundPoints: 0 });
    state = reviewFamilyTriviaTextGuess(state, textQuestion.authorityPlayerId, respondent, 'exact').state;
    const restored = buildFrequencyScoreboard(state);
    expect(restored.entries.find((entry) => entry.id === respondent)).toMatchObject({ points: 4, exact: 1, roundPoints: 4 });
    expect(restored.entries.find((entry) => entry.id === textQuestion.authorityPlayerId)?.ownerBonus).toBe(textQuestion.respondentPlayerIds.length);
    expect(buildFrequencyScoreboard(state)).toEqual(restored);
    expect(buildFrequencyScoreboard(JSON.parse(JSON.stringify(state)) as FamilyTriviaSessionState)).toEqual(restored);
    state = reviewFamilyTriviaTextGuess(state, textQuestion.authorityPlayerId, respondent, 'exact').state;
    expect(buildFrequencyScoreboard(state)).toEqual(restored);
    expect(state.playerScores.find((entry) => entry.playerId === respondent)?.points).toBe(4);
  });

  it('never reads secret answers or guesses and hides uncommitted current-round scores', () => {
    const source = reveal(session());
    const state: FamilyTriviaSessionState = {
      ...source,
      phase: 'guessing',
      get referenceAnswers(): never { throw new Error('Do not read private answers'); },
      get guesses(): never { throw new Error('Do not read private guesses'); },
    };
    const board = buildFrequencyScoreboard(state);
    expect(board.entries.every((entry) => entry.points === 0 && entry.delta === 0)).toBe(true);
    expect(board.round).toEqual({ number: 0, answered: 0, exact: 0, skipped: false, title: '' });
    expect(board.totalExact).toBe(0);
  });

  it('retains committed totals between rounds without replaying the previous round award', () => {
    const revealed = reveal(session());
    const next = advanceFamilyTriviaQuestion(revealed, revealed.setup.hostPlayerId).state;
    const board = buildFrequencyScoreboard(next);
    expect(board.entries.map((entry) => entry.points)).toEqual(buildFrequencyScoreboard(revealed).entries.map((entry) => entry.points));
    expect(board.entries.every((entry) => entry.previousPoints === entry.points && entry.delta === 0 && entry.roundPoints === 0 && entry.ownerBonus === 0)).toBe(true);
    expect(board.round.number).toBe(0);
  });

  it('uses competition ranks with stable identity colors, not podium position colors', () => {
    const state = recordedRounds([{ guesses: [['player-1', 4, true], ['player-2', 4, true], ['player-3', 2, false]] }]);
    const board = buildFrequencyScoreboard(state);
    expect(board.entries.map((entry) => entry.rank)).toEqual([1, 1, 3, 3]);
    for (const [index, player] of state.setup.players.entries()) {
      expect(board.entries.find((entry) => entry.id === player.id)?.color).toBe(FREQUENCY_SCORE_COLORS[index]);
    }
    expect(board.entries.every((entry) => entry.previousRank === 0)).toBe(true);
  });

  it('does not manufacture a winner when nobody has scored', () => {
    for (const teams of [false, true]) {
      const board = buildFrequencyScoreboard(recordedRounds([{ guesses: [['player-1', 0, false], ['player-2', 0, false]] }], teams));
      expect(board.entries.every((entry) => entry.rank === 0 && entry.points === 0)).toBe(true);
      expect(board.totalExact).toBe(0);
    }
  });

  it('matches team engine rates without awarding weighted points or owner bonuses', () => {
    let state = session(true);
    for (let index = 0; index < state.pack.questions.length; index += 1) {
      state = reveal(state);
      const board = buildFrequencyScoreboard(state);
      for (const score of state.teamScores) {
        expect(board.entries.find((entry) => entry.id === score.teamId)).toMatchObject({ points: Number((score.points / 100).toFixed(1)), exact: score.exactMatches, opportunities: score.opportunities, ownerBonus: 0 });
      }
      expect(board.entries.reduce((sum, entry) => sum + entry.roundPoints, 0)).toBe(1);
      state = advanceFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;
    }
  });

  it('ranks unequal team opportunities by fractions, not raw locks, with signed rate changes', () => {
    const state = recordedRounds([
      { guesses: [['player-1', 4, true], ['player-2', 2, true]] },
      { guesses: [['player-1', 2, true], ['player-2', 0, false]] },
      { guesses: [['player-1', 0, false]] },
    ], true);
    const board = buildFrequencyScoreboard(state);
    expect(board.entries[0]).toMatchObject({ id: 'team-a', points: 66.7, previousPoints: 100, delta: -33.3, rank: 1, exact: 2, opportunities: 3, roundPoints: 0, ownerBonus: 0 });
    expect(board.entries[1]).toMatchObject({ id: 'team-b', points: 50, previousPoints: 50, delta: 0, rank: 2, roundPoints: 0 });
  });

  it('ties mathematically equal team rates with unequal opportunities', () => {
    const board = buildFrequencyScoreboard(recordedRounds([
      { guesses: [['player-1', 2, true], ['player-2', 2, true]] },
      { guesses: [['player-1', 0, false], ['player-2', 0, false]] },
      { guesses: [['player-2', 2, true]] },
      { guesses: [['player-2', 0, false]] },
    ], true));
    expect(board.entries.map((entry) => [entry.points, entry.rank])).toEqual([[50, 1], [50, 1]]);
  });

  it('keeps exact fraction ranks distinct even when the displayed percentages round alike', () => {
    const rows = Array.from({ length: 334 }, (_, index) => ({
      guesses: [
        ...(index < 333 ? [['player-1', index === 0 ? 2 : 0, index === 0] as const] : []),
        ['player-2', index === 0 ? 2 : 0, index === 0] as const,
      ],
    }));
    const board = buildFrequencyScoreboard(recordedRounds(rows, true));
    expect(board.entries.map((entry) => entry.points)).toEqual([0.3, 0.3]);
    expect(board.entries.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it('counts consecutive exact reads while ignoring skipped and non-participant rounds', () => {
    const state = recordedRounds([
      { guesses: [['player-1', 2, true]] },
      { owner: 'player-1', guesses: [['player-2', 2, true]] },
      { skipped: true, guesses: [] },
      { guesses: [['player-1', 2, true]] },
    ]);
    const board = buildFrequencyScoreboard(state);
    expect(board.entries.find((entry) => entry.id === 'player-1')).toMatchObject({ streak: 2, points: 5, roundPoints: 2 });
    const missed = recordedRounds([
      { guesses: [['player-1', 2, true]] },
      { guesses: [['player-1', 1, false]] },
      { guesses: [['player-1', 2, true]] },
    ]);
    expect(buildFrequencyScoreboard(missed).entries.find((entry) => entry.id === 'player-1')?.streak).toBe(1);
  });

  it('uses the latest committed correction once if a result is accidentally duplicated', () => {
    const state = recordedRounds([{ guesses: [['player-1', 4, true]] }]);
    const correction: FamilyTriviaQuestionResult = { ...state.results[0], playerPoints: [{ playerId: 'player-1', points: 2, exact: false, authorityReviewed: true }] };
    const board = buildFrequencyScoreboard({ ...state, results: [...state.results, correction] });
    expect(board.entries.find((entry) => entry.id === 'player-1')).toMatchObject({ points: 2, exact: 0, roundPoints: 2 });
    expect(board.entries.find((entry) => entry.id === 'player-4')?.points).toBe(0);
  });

  it('shows a skipped final round without scoring or breaking previous streaks', () => {
    const state = recordedRounds([{ guesses: [['player-1', 2, true]] }, { skipped: true, guesses: [] }]);
    const board = buildFrequencyScoreboard({ ...state, phase: 'complete' });
    expect(board.round).toEqual({ number: 2, answered: 0, exact: 0, skipped: true, title: 'Round skipped' });
    expect(board.entries.every((entry) => entry.delta === 0 && entry.roundPoints === 0)).toBe(true);
    expect(board.entries.find((entry) => entry.id === 'player-1')?.streak).toBe(1);
  });
});
