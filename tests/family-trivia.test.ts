import { describe, expect, it, vi } from 'vitest';

import {
  FAMILY_TRIVIA_ROUND_KINDS,
  advanceFamilyTriviaQuestion,
  compareFamilyTriviaTeamRates,
  createFamilyTriviaAiPackRequest,
  createFamilyTriviaSession,
  createQuickFamilyTriviaSetup,
  generateOfflineFamilyTriviaPack,
  familyTriviaTeamRateBasisPoints,
  loadFamilyTriviaQuestionPack,
  parseSafeFamilyTriviaPack,
  projectFamilyTriviaPlayer,
  projectFamilyTriviaPublic,
  revealFamilyTriviaQuestion,
  reviewFamilyTriviaTextGuess,
  scoreFamilyTriviaAnswer,
  familyTriviaTextSimilarity,
  skipFamilyTriviaQuestion,
  submitFamilyTriviaGuess,
  submitFamilyTriviaReference,
  type FamilyTriviaAnswer,
  type FamilyTriviaAiPackRequest,
  type FamilyTriviaQuestion,
  type FamilyTriviaQuestionPack,
  type FamilyTriviaQuestionPackProvider,
  type FamilyTriviaSessionState,
} from '../src/domain/family-trivia';

function setup(count = 3, teams = false) {
  return createQuickFamilyTriviaSetup(['Mara', 'Samir', 'Noor', 'Rami'].slice(0, count), { teams });
}

function pack(count = 3, seed: number | string = 42, questionCount = 8) {
  const currentSetup = setup(count);
  return {
    setup: currentSetup,
    pack: generateOfflineFamilyTriviaPack({ setup: currentSetup, seed, questionCount }),
  };
}

function referenceFor(question: FamilyTriviaQuestion, offset = 0): FamilyTriviaAnswer {
  if (question.answerKind === 'choice') {
    return { kind: 'choice', optionId: question.options[offset % question.options.length].id };
  }
  if (question.answerKind === 'ordering') {
    const optionIds = question.options.map((option) => option.id);
    return { kind: 'ordering', optionIds: offset % 2 === 0 ? optionIds : [...optionIds].reverse() };
  }
  if (question.answerKind === 'spectrum') {
    return { kind: 'spectrum', value: offset % 2 === 0 ? 65 : 20 };
  }
  return { kind: 'text', value: offset % 2 === 0 ? 'Iced coffee' : 'Popcorn' };
}

function withQuestionFirst(source: FamilyTriviaQuestionPack, question: FamilyTriviaQuestion): FamilyTriviaQuestionPack {
  return parseSafeFamilyTriviaPack({
    ...source,
    id: `${source.id}-reordered`,
    questions: [question, ...source.questions.filter((candidate) => candidate.id !== question.id)],
  });
}

function answerCurrentRoundCorrectly(state: FamilyTriviaSessionState): FamilyTriviaSessionState {
  const question = state.pack.questions[state.questionIndex];
  const reference = referenceFor(question);
  let next = submitFamilyTriviaReference(state, question.authorityPlayerId, reference).state;
  for (const respondentId of question.respondentPlayerIds) {
    next = submitFamilyTriviaGuess(next, respondentId, reference).state;
  }
  next = revealFamilyTriviaQuestion(next, next.setup.hostPlayerId).state;
  return advanceFamilyTriviaQuestion(next, next.setup.hostPlayerId).state;
}

describe('family trivia quick setup and offline generation', () => {
  it('creates a complete individual setup from names alone for two to four players', () => {
    for (const count of [2, 3, 4]) {
      const current = setup(count);
      expect(current.players).toHaveLength(count);
      expect(current.teams).toEqual([]);
      expect(current.hostPlayerId).toBe('player-1');
      expect(current.players.every((player) => player.teamId === undefined)).toBe(true);
    }
  });

  it('can assign exactly two balanced teams without another onboarding question', () => {
    const current = setup(4, true);
    expect(current.teams).toHaveLength(2);
    expect(current.teams.map((team) => team.memberPlayerIds.length)).toEqual([2, 2]);
    expect(new Set(current.teams.flatMap((team) => team.memberPlayerIds))).toEqual(
      new Set(current.players.map((player) => player.id)),
    );
  });

  it('rejects invalid group sizes, blank names, and duplicate names', () => {
    expect(() => createQuickFamilyTriviaSetup(['Only one'])).toThrow();
    expect(() => createQuickFamilyTriviaSetup(['A', 'B', 'C', 'D', 'E'])).toThrow();
    expect(() => createQuickFamilyTriviaSetup(['A', '   '])).toThrow();
    expect(() => createQuickFamilyTriviaSetup(['Noor', 'noor'])).toThrow();
    expect(() => createQuickFamilyTriviaSetup(['A', 'B'], { teams: true })).toThrow(/exactly four/i);
    expect(() => createQuickFamilyTriviaSetup(['A', 'B', 'C'], { teams: true })).toThrow(/exactly four|equally sized/i);
  });

  it('generates deterministic packs with all six family-knowledge mechanics', () => {
    const current = setup(4);
    const first = generateOfflineFamilyTriviaPack({ setup: current, seed: 'living-room', questionCount: 8 });
    const replay = generateOfflineFamilyTriviaPack({ setup: current, seed: 'living-room', questionCount: 8 });
    const other = generateOfflineFamilyTriviaPack({ setup: current, seed: 'kitchen', questionCount: 8 });
    expect(replay).toEqual(first);
    expect(other).not.toEqual(first);
    expect(new Set(first.questions.map((question) => question.kind))).toEqual(new Set(FAMILY_TRIVIA_ROUND_KINDS));
    expect(JSON.stringify(first)).not.toContain('correctAnswer');
    expect(JSON.stringify(first)).not.toContain('referenceAnswer');
  });

  it('keeps generated authority and respondent assignments valid across crew sizes and seeds', () => {
    for (const count of [2, 3, 4]) {
      for (let seed = 0; seed < 40; seed += 1) {
        const current = setup(count);
        const generated = generateOfflineFamilyTriviaPack({ setup: current, seed, questionCount: 12 });
        const playerIds = current.players.map((player) => player.id);
        expect(generated.questions).toHaveLength(12);
        for (const question of generated.questions) {
          expect(playerIds).toContain(question.authorityPlayerId);
          expect(question.respondentPlayerIds).not.toContain(question.authorityPlayerId);
          expect(new Set(question.respondentPlayerIds).size).toBe(question.respondentPlayerIds.length);
          expect(question.respondentPlayerIds.every((id) => playerIds.includes(id))).toBe(true);
          expect(question.kind === 'who-knows-who' ? question.respondentPlayerIds.length : count - 1).toBe(
            question.respondentPlayerIds.length,
          );
        }
      }
    }
  });

  it('gives both partner teams identical scoring ceilings without opponent-owned answers', () => {
    for (const questionCount of [4, 8, 12] as const) {
      for (let seed = 0; seed < 128; seed += 1) {
        const current = setup(4, true);
        const generated = generateOfflineFamilyTriviaPack({ setup: current, seed, questionCount });
        const opportunities = current.teams.map((team) => generated.questions.reduce((total, question) =>
          total + question.respondentPlayerIds.filter((playerId) => team.memberPlayerIds.includes(playerId)).length, 0));
        expect(opportunities[0]).toBe(questionCount / 2);
        expect(opportunities[1]).toBe(questionCount / 2);
        for (const question of generated.questions) {
          expect(question.respondentPlayerIds).toHaveLength(1);
          const authorityTeam = current.teams.find((team) => team.memberPlayerIds.includes(question.authorityPlayerId))!;
          expect(authorityTeam.memberPlayerIds).toContain(question.respondentPlayerIds[0]);
        }
      }
      const current = setup(4, true);
      const generated = generateOfflineFamilyTriviaPack({ setup: current, seed: 0, questionCount });
      let state = createFamilyTriviaSession(current, generated);
      while (state.phase !== 'complete') state = answerCurrentRoundCorrectly(state);
      expect(state.teamScores.every((score) => score.points === 10_000)).toBe(true);
    }
  }, 15_000);
});

describe('family trivia private-answer state machine', () => {
  it('keeps the reference and every guess out of the public projection until and after reveal', () => {
    const generated = pack(3, 91, 4);
    let state = createFamilyTriviaSession(generated.setup, generated.pack);
    const question = state.pack.questions[0];
    const reference = referenceFor(question);
    const wrongActor = question.respondentPlayerIds[0];

    expect(submitFamilyTriviaReference(state, wrongActor, reference)).toMatchObject({ accepted: false, code: 'NOT_AUTHORITY' });
    state = submitFamilyTriviaReference(state, question.authorityPlayerId, reference).state;
    expect(state.phase).toBe('guessing');

    const publicBeforeGuesses = projectFamilyTriviaPublic(state);
    expect(publicBeforeGuesses).not.toHaveProperty('referenceAnswers');
    expect(publicBeforeGuesses).not.toHaveProperty('guesses');
    expect(publicBeforeGuesses.referenceSubmitted).toBe(true);
    expect(projectFamilyTriviaPlayer(state, question.authorityPlayerId).reveal).toBeUndefined();

    const firstRespondent = question.respondentPlayerIds[0];
    state = submitFamilyTriviaGuess(state, firstRespondent, reference).state;
    expect(projectFamilyTriviaPlayer(state, firstRespondent).ownGuess).toEqual(reference);
    expect(projectFamilyTriviaPlayer(state, question.respondentPlayerIds.at(-1)!).ownGuess).toBeUndefined();
    expect(projectFamilyTriviaPublic(state)).not.toHaveProperty('ownGuess');
    expect(revealFamilyTriviaQuestion(state, state.setup.hostPlayerId)).toMatchObject({ accepted: false, code: 'WAITING_FOR_GUESSES' });

    for (const respondentId of question.respondentPlayerIds.slice(1)) {
      state = submitFamilyTriviaGuess(state, respondentId, reference).state;
    }
    state = revealFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;
    expect(state.phase).toBe('revealed');
    expect(projectFamilyTriviaPlayer(state, firstRespondent).reveal?.referenceAnswer).toEqual(reference);

    const publicAfterReveal = projectFamilyTriviaPublic(state) as unknown as Record<string, unknown>;
    expect(publicAfterReveal).not.toHaveProperty('referenceAnswers');
    expect(publicAfterReveal).not.toHaveProperty('guesses');
    expect(JSON.stringify(publicAfterReveal.latestResult)).not.toContain('optionId');
    expect(JSON.stringify(publicAfterReveal.latestResult)).not.toContain('optionIds');
  });

  it('rejects malformed answers, answer-kind mismatches, duplicate guesses, and unauthorized reveals', () => {
    const generated = pack(3, 19, 4);
    let state = createFamilyTriviaSession(generated.setup, generated.pack);
    const question = state.pack.questions[0];
    expect(submitFamilyTriviaReference(state, question.authorityPlayerId, { kind: 'choice', optionId: 'not-an-option' })).toMatchObject({ accepted: false, code: 'INVALID_ANSWER' });

    const reference = referenceFor(question);
    state = submitFamilyTriviaReference(state, question.authorityPlayerId, reference).state;
    const respondent = question.respondentPlayerIds[0];
    expect(submitFamilyTriviaGuess(state, question.authorityPlayerId, reference)).toMatchObject({ accepted: false, code: 'NOT_RESPONDENT' });
    state = submitFamilyTriviaGuess(state, respondent, reference).state;
    expect(submitFamilyTriviaGuess(state, respondent, reference)).toMatchObject({ accepted: false, code: 'ALREADY_SUBMITTED' });
    const nonHost = state.setup.players.find((player) => player.id !== state.setup.hostPlayerId)!;
    expect(revealFamilyTriviaQuestion(state, nonHost.id)).toMatchObject({ accepted: false, code: 'NOT_HOST' });
  });

  it('runs every generated round to completion with one-tap references and guesses', () => {
    const generated = pack(4, 'complete-run', 8);
    let state = createFamilyTriviaSession(generated.setup, generated.pack);
    for (let index = 0; index < generated.pack.questions.length; index += 1) {
      state = answerCurrentRoundCorrectly(state);
    }
    expect(state.phase).toBe('complete');
    expect(state.results).toHaveLength(8);
    expect(state.results.every((result) => !result.skipped)).toBe(true);
    expect(state.playerScores.reduce((total, score) => total + score.points, 0)).toBeGreaterThan(0);
    expect(submitFamilyTriviaReference(state, 'player-1', { kind: 'choice', optionId: 'anything' })).toMatchObject({ accepted: false, code: 'SESSION_COMPLETE' });
  });

  it('allows only host or answer owner to skip an inapplicable memory card and removes its secrets', () => {
    const generated = pack(4, 'skip-memory', 8);
    const memory = generated.pack.questions.find((question) => question.kind === 'shared-memory-detail')!;
    const reordered = withQuestionFirst(generated.pack, memory);
    let state = createFamilyTriviaSession(generated.setup, reordered);
    const outsider = state.setup.players.find((player) => player.id !== memory.authorityPlayerId && player.id !== state.setup.hostPlayerId)!;
    expect(skipFamilyTriviaQuestion(state, outsider.id)).toMatchObject({ accepted: false, code: 'NOT_AUTHORITY' });
    state = submitFamilyTriviaReference(state, memory.authorityPlayerId, referenceFor(memory)).state;
    state = skipFamilyTriviaQuestion(state, memory.authorityPlayerId).state;
    expect(state.questionIndex).toBe(1);
    expect(state.referenceAnswers[memory.id]).toBeUndefined();
    expect(state.guesses[memory.id]).toBeUndefined();
    expect(state.results[0]).toEqual({ questionId: memory.id, skipped: true, playerPoints: [] });
  });
});

describe('family trivia scoring', () => {
  it('lets only the answer owner make the final exact, close, or miss call on text guesses', () => {
    const generated = pack(3, 'owner-review', 8);
    const question = generated.pack.questions.find((candidate) => candidate.answerKind === 'text')!;
    let state = createFamilyTriviaSession(generated.setup, withQuestionFirst(generated.pack, question));
    state = submitFamilyTriviaReference(state, question.authorityPlayerId, { kind: 'text', value: 'grilled cheese' }).state;
    state = submitFamilyTriviaGuess(state, question.respondentPlayerIds[0], { kind: 'text', value: 'toastie' }).state;
    state = submitFamilyTriviaGuess(state, question.respondentPlayerIds[1], { kind: 'text', value: 'cheese sandwich' }).state;
    state = revealFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;

    expect(reviewFamilyTriviaTextGuess(
      state,
      question.respondentPlayerIds[0],
      question.respondentPlayerIds[0],
      'exact',
    )).toMatchObject({ accepted: false, code: 'NOT_AUTHORITY' });

    state = reviewFamilyTriviaTextGuess(
      state,
      question.authorityPlayerId,
      question.respondentPlayerIds[0],
      'exact',
    ).state;
    state = reviewFamilyTriviaTextGuess(
      state,
      question.authorityPlayerId,
      question.respondentPlayerIds[1],
      'close',
    ).state;
    expect(state.results[0].playerPoints).toEqual([
      { playerId: question.respondentPlayerIds[0], points: 4, exact: true, authorityReviewed: true },
      { playerId: question.respondentPlayerIds[1], points: 2, exact: false, authorityReviewed: true },
    ]);
    expect(state.playerScores.find((score) => score.playerId === question.authorityPlayerId)?.points).toBe(1);
    expect(state.playerScores.find((score) => score.playerId === question.respondentPlayerIds[0])?.points).toBe(4);
    expect(state.playerScores.find((score) => score.playerId === question.respondentPlayerIds[1])?.points).toBe(2);

    state = reviewFamilyTriviaTextGuess(
      state,
      question.authorityPlayerId,
      question.respondentPlayerIds[0],
      'miss',
    ).state;
    expect(state.playerScores.find((score) => score.playerId === question.authorityPlayerId)?.points).toBe(0);
    expect(state.playerScores.find((score) => score.playerId === question.respondentPlayerIds[0])?.points).toBe(0);
  });

  it('recalculates the team exact-lock rate after an owner reviews a text guess', () => {
    const currentSetup = setup(4, true);
    const generated = generateOfflineFamilyTriviaPack({ setup: currentSetup, seed: 'owner-team-review', questionCount: 8 });
    const question = generated.questions.find((candidate) => candidate.answerKind === 'text')!;
    let state = createFamilyTriviaSession(currentSetup, withQuestionFirst(generated, question));
    state = submitFamilyTriviaReference(state, question.authorityPlayerId, { kind: 'text', value: 'movie night' }).state;
    state = submitFamilyTriviaGuess(state, question.respondentPlayerIds[0], { kind: 'text', value: 'cinema together' }).state;
    state = revealFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;
    state = reviewFamilyTriviaTextGuess(
      state,
      question.authorityPlayerId,
      question.respondentPlayerIds[0],
      'exact',
    ).state;

    const respondentTeam = currentSetup.teams.find((team) => team.memberPlayerIds.includes(question.respondentPlayerIds[0]))!;
    expect(state.teamScores.find((score) => score.teamId === respondentTeam.id)).toMatchObject({
      exactMatches: 1,
      opportunities: 1,
      points: 10_000,
    });
  });

  it('rewards the person being understood so bluffing also costs them', () => {
    const generated = pack(3, 'mutual-lock', 8);
    const question = generated.pack.questions.find((candidate) => candidate.kind === 'preference-match')!;
    let state = createFamilyTriviaSession(generated.setup, withQuestionFirst(generated.pack, question));
    const reference = referenceFor(question);
    state = submitFamilyTriviaReference(state, question.authorityPlayerId, reference).state;
    state = submitFamilyTriviaGuess(state, question.respondentPlayerIds[0], reference).state;
    state = submitFamilyTriviaGuess(state, question.respondentPlayerIds[1], referenceFor(question, 1)).state;
    state = revealFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;

    expect(state.playerScores.find((score) => score.playerId === question.authorityPlayerId)?.points).toBe(1);
    expect(state.playerScores.find((score) => score.playerId === question.respondentPlayerIds[0])?.points).toBe(2);
    expect(state.playerScores.find((score) => score.playerId === question.respondentPlayerIds[1])?.points).toBe(0);
  });

  it('scores exact, partial, and reversed family-lore orders by pairwise agreement', () => {
    const generated = pack(3, 'ordering-score', 4);
    const question = generated.pack.questions.find((candidate) => candidate.kind === 'family-lore-ordering')!;
    const ids = question.options.map((option) => option.id);
    const reference = { kind: 'ordering' as const, optionIds: ids };
    expect(scoreFamilyTriviaAnswer(question, reference, reference)).toEqual({ exact: true, points: 4 });
    expect(scoreFamilyTriviaAnswer(question, reference, { kind: 'ordering', optionIds: [ids[0], ids[1], ids[3], ids[2]] })).toEqual({ exact: false, points: 2 });
    expect(scoreFamilyTriviaAnswer(question, reference, { kind: 'ordering', optionIds: [...ids].reverse() })).toEqual({ exact: false, points: 0 });
  });

  it('scores dial proximity and locally matches close free-text wording', () => {
    const generated = pack(3, 'new-formats', 8);
    const spectrum = generated.pack.questions.find((question) => question.kind === 'spectrum-read')!;
    expect(scoreFamilyTriviaAnswer(spectrum, { kind: 'spectrum', value: 70 }, { kind: 'spectrum', value: 75 }))
      .toEqual({ exact: true, points: 4 });
    expect(scoreFamilyTriviaAnswer(spectrum, { kind: 'spectrum', value: 70 }, { kind: 'spectrum', value: 85 }))
      .toEqual({ exact: false, points: 3 });
    expect(scoreFamilyTriviaAnswer(spectrum, { kind: 'spectrum', value: 70 }, { kind: 'spectrum', value: 20 }))
      .toEqual({ exact: false, points: 0 });

    const words = generated.pack.questions.find((question) => question.kind === 'same-wavelength')!;
    expect(scoreFamilyTriviaAnswer(words, { kind: 'text', value: 'The movies' }, { kind: 'text', value: 'film' }))
      .toEqual({ exact: true, points: 4 });
    expect(scoreFamilyTriviaAnswer(words, { kind: 'text', value: 'iced coffee' }, { kind: 'text', value: 'coffee' }))
      .toEqual({ exact: false, points: 2 });
    expect(scoreFamilyTriviaAnswer(words, { kind: 'text', value: 'tea' }, { kind: 'text', value: 'popcorn' }))
      .toEqual({ exact: false, points: 0 });
  });

  it('scores only the answer owner’s teammate during team rounds', () => {
    const currentSetup = setup(4, true);
    const generated = generateOfflineFamilyTriviaPack({ setup: currentSetup, seed: 'teams', questionCount: 8 });
    const ordinary = generated.questions.find((question) => question.kind === 'preference-match')!;
    const oneToOne = generated.questions.find((question) => question.kind === 'who-knows-who')!;
    let state = createFamilyTriviaSession(currentSetup, withQuestionFirst(generated, ordinary));
    const reference = referenceFor(ordinary);
    state = submitFamilyTriviaReference(state, ordinary.authorityPlayerId, reference).state;
    for (const respondentId of ordinary.respondentPlayerIds) {
      state = submitFamilyTriviaGuess(state, respondentId, reference).state;
    }
    state = revealFamilyTriviaQuestion(state, state.setup.hostPlayerId).state;
    expect(oneToOne.respondentPlayerIds).toHaveLength(1);
    expect(ordinary.respondentPlayerIds).toHaveLength(1);
    const ownerTeam = currentSetup.teams.find((team) => team.memberPlayerIds.includes(ordinary.authorityPlayerId))!;
    expect(ownerTeam.memberPlayerIds).toContain(ordinary.respondentPlayerIds[0]);
    expect(ordinary.respondentPlayerIds.every((respondentId) =>
      state.playerScores.find((score) => score.playerId === respondentId)?.points === 2)).toBe(true);
    expect(state.teamScores.find((score) => score.teamId === ownerTeam.id)).toEqual({
      teamId: ownerTeam.id,
      points: 10_000,
      exactMatches: 1,
      opportunities: 1,
    });
    expect(state.teamScores.find((score) => score.teamId !== ownerTeam.id)).toEqual(expect.objectContaining({
      points: 0,
      exactMatches: 0,
      opportunities: 0,
    }));
  });

  it('lets only the answer owner void an inapplicable team card before answering, scoring neither side', () => {
    const currentSetup = setup(4, true);
    const generated = generateOfflineFamilyTriviaPack({ setup: currentSetup, seed: 'skip-fairly', questionCount: 8 });
    expect(generated.questions.every((question) => question.canSkip)).toBe(true);
    const state = createFamilyTriviaSession(currentSetup, generated);
    const question = state.pack.questions[0];
    const outsider = state.setup.players.find((player) => player.id !== question.authorityPlayerId)!;
    expect(skipFamilyTriviaQuestion(state, outsider.id)).toMatchObject({ accepted: false, code: 'NOT_AUTHORITY' });

    const voided = skipFamilyTriviaQuestion(state, question.authorityPlayerId);
    expect(voided).toMatchObject({ accepted: true, code: 'ACCEPTED' });
    expect(voided.state.results[0]).toEqual({ questionId: question.id, skipped: true, playerPoints: [] });
    expect(voided.state.playerScores).toEqual(state.playerScores);
    expect(voided.state.teamScores).toEqual(state.teamScores);
    expect(voided.state.teamScores.every((score) => score.opportunities === 0)).toBe(true);

    const answered = submitFamilyTriviaReference(state, question.authorityPlayerId, referenceFor(question)).state;
    expect(skipFamilyTriviaQuestion(answered, question.authorityPlayerId)).toMatchObject({
      accepted: false,
      code: 'CANNOT_SKIP',
    });
  });

  it('canonicalizes regional food words and conservative singular/plural variants locally', () => {
    expect(familyTriviaTextSimilarity('fries', 'chips')).toBe(1);
    expect(familyTriviaTextSimilarity('a taco', 'tacos')).toBe(1);
    expect(familyTriviaTextSimilarity('berries', 'berry')).toBe(1);
    expect(familyTriviaTextSimilarity('cookies', 'biscuits')).toBe(1);
  });

  it('compares exact-lock rates as fractions rather than rounded or raw totals', () => {
    expect(compareFamilyTriviaTeamRates(
      { exactMatches: 1, opportunities: 2 },
      { exactMatches: 2, opportunities: 4 },
    )).toBe(0);
    expect(compareFamilyTriviaTeamRates(
      { exactMatches: 2, opportunities: 3 },
      { exactMatches: 1, opportunities: 2 },
    )).toBeGreaterThan(0);
    expect(familyTriviaTeamRateBasisPoints({ exactMatches: 2, opportunities: 3 })).toBe(6667);
  });
});

describe('safe AI question-pack boundary', () => {
  it('sends no family names to a provider and accepts a matching validated AI pack', async () => {
    const currentSetup = setup(3);
    const offline = generateOfflineFamilyTriviaPack({ setup: currentSetup, seed: 123, questionCount: 4 });
    const generateQuestionPack = vi.fn(async (_request: FamilyTriviaAiPackRequest): Promise<unknown> => ({
      ...offline,
      id: 'ai-family-pack',
      source: { kind: 'ai', providerId: 'safe-provider', model: 'model-one' },
    }));
    const provider: FamilyTriviaQuestionPackProvider = { id: 'safe-provider', model: 'model-one', generateQuestionPack };
    const result = await loadFamilyTriviaQuestionPack({ provider, setup: currentSetup, seed: 123, questionCount: 4 });
    expect(result.usedFallback).toBe(false);
    expect(result.pack.source).toEqual({ kind: 'ai', providerId: 'safe-provider', model: 'model-one' });
    const request = generateQuestionPack.mock.calls[0]![0];
    expect(request.constraints).toEqual({
      answersMustBePrivate: true,
      answersStayOnDevice: true,
      supportedAnswerKinds: ['choice', 'ordering', 'spectrum', 'text'],
      noTherapyOrConflictPrompts: true,
      noSensitiveAttributes: true,
    });
    expect(JSON.stringify(request)).not.toContain('Mara');
    expect(JSON.stringify(request)).not.toContain('Samir');
  });

  it('rejects answer-bearing, unsafe, wrong-provider, and malformed AI output and falls back offline', async () => {
    const currentSetup = setup(3);
    const offline = generateOfflineFamilyTriviaPack({ setup: currentSetup, seed: 777, questionCount: 4 });
    const candidates: unknown[] = [
      {
        ...offline,
        source: { kind: 'ai', providerId: 'safe-provider' },
        questions: offline.questions.map((question, index) => index === 0 ? { ...question, correctAnswer: 'leak' } : question),
      },
      {
        ...offline,
        source: { kind: 'ai', providerId: 'safe-provider' },
        questions: offline.questions.map((question, index) => index === 0 ? { ...question, prompt: 'Which family trauma caused the biggest conflict?' } : question),
      },
      {
        ...offline,
        source: { kind: 'ai', providerId: 'safe-provider' },
        questions: offline.questions.map((question, index) => index === 0 ? { ...question, afterRevealPrompt: 'The correct answer is already shown.' } : question),
      },
      { ...offline, source: { kind: 'ai', providerId: 'different-provider' } },
      { nonsense: true },
    ];
    for (const candidate of candidates) {
      const provider: FamilyTriviaQuestionPackProvider = {
        id: 'safe-provider',
        generateQuestionPack: async () => candidate,
      };
      const result = await loadFamilyTriviaQuestionPack({ provider, setup: currentSetup, seed: 777, questionCount: 4 });
      expect(result.usedFallback).toBe(true);
      expect(result.pack.source).toEqual({ kind: 'offline', generatorVersion: 1 });
      expect(result.rejectionReason).toBeTruthy();
    }
  });

  it('builds a bounded provider request covering only supported mechanics', () => {
    const request = createFamilyTriviaAiPackRequest(setup(2), 'provider-seed', 99);
    expect(request.questionCount).toBe(12);
    expect(request.allowedKinds).toEqual(FAMILY_TRIVIA_ROUND_KINDS);
    expect(request.playerIds).toEqual(['player-1', 'player-2']);
  });
});
