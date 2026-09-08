import {
  answerFitsFamilyTriviaQuestion,
  parseFamilyTriviaAnswer,
  parseFamilyTriviaSetup,
  parseSafeFamilyTriviaPack,
  validateFamilyTriviaPackForSetup,
} from './family-trivia-schema';
import type {
  FamilyTriviaActionCode,
  FamilyTriviaActionResult,
  FamilyTriviaAnswer,
  FamilyTriviaPlayerProjection,
  FamilyTriviaOwnerVerdict,
  FamilyTriviaPublicProjection,
  FamilyTriviaQuestion,
  FamilyTriviaQuestionPack,
  FamilyTriviaQuestionResult,
  FamilyTriviaSessionState,
  FamilyTriviaSetup,
} from './family-trivia-types';

export interface FamilyTriviaAnswerScore {
  exact: boolean;
  points: number;
}

export interface FamilyTriviaTeamRate {
  exactMatches: number;
  opportunities: number;
}

export function familyTriviaTeamRateBasisPoints(score: FamilyTriviaTeamRate): number {
  return score.opportunities > 0 ? Math.round((score.exactMatches / score.opportunities) * 10_000) : 0;
}

/** Positive means left has the better exact-lock rate; equal fractions tie exactly. */
export function compareFamilyTriviaTeamRates(left: FamilyTriviaTeamRate, right: FamilyTriviaTeamRate): number {
  const leftDenominator = Math.max(1, left.opportunities);
  const rightDenominator = Math.max(1, right.opportunities);
  return left.exactMatches * rightDenominator - right.exactMatches * leftDenominator;
}

export function createFamilyTriviaSession(
  setupInput: FamilyTriviaSetup,
  packInput: FamilyTriviaQuestionPack,
  sessionId?: string,
): FamilyTriviaSessionState {
  const setup = parseFamilyTriviaSetup(setupInput);
  const pack = parseSafeFamilyTriviaPack(packInput);
  validateFamilyTriviaPackForSetup(pack, setup);
  return {
    id: sessionId ?? `trivia-${pack.seed.toString(36)}`,
    pack,
    setup,
    phase: 'reference',
    questionIndex: 0,
    revision: 0,
    referenceAnswers: {},
    guesses: {},
    playerScores: setup.players.map((player) => ({ playerId: player.id, points: 0, exactMatches: 0 })),
    teamScores: setup.teams.map((team) => ({ teamId: team.id, points: 0, exactMatches: 0, opportunities: 0 })),
    results: [],
  };
}

export function currentFamilyTriviaQuestion(state: FamilyTriviaSessionState): FamilyTriviaQuestion | undefined {
  return state.phase === 'complete' ? undefined : state.pack.questions[state.questionIndex];
}

export function submitFamilyTriviaReference(
  state: FamilyTriviaSessionState,
  actorPlayerId: string,
  answerInput: unknown,
): FamilyTriviaActionResult {
  if (state.phase === 'complete') return rejected(state, 'SESSION_COMPLETE');
  if (state.phase !== 'reference') return rejected(state, 'WRONG_PHASE');
  if (!knownPlayer(state, actorPlayerId)) return rejected(state, 'UNKNOWN_PLAYER');
  const question = currentFamilyTriviaQuestion(state);
  if (!question || question.authorityPlayerId !== actorPlayerId) return rejected(state, 'NOT_AUTHORITY');
  const answer = safeAnswer(answerInput);
  if (!answer || !answerFitsFamilyTriviaQuestion(answer, question)) return rejected(state, 'INVALID_ANSWER');
  if (state.referenceAnswers[question.id]) return rejected(state, 'ALREADY_SUBMITTED');
  return accepted({
    ...state,
    phase: 'guessing',
    revision: state.revision + 1,
    referenceAnswers: { ...state.referenceAnswers, [question.id]: answer },
  });
}

export function submitFamilyTriviaGuess(
  state: FamilyTriviaSessionState,
  actorPlayerId: string,
  answerInput: unknown,
): FamilyTriviaActionResult {
  if (state.phase === 'complete') return rejected(state, 'SESSION_COMPLETE');
  if (state.phase !== 'guessing') return rejected(state, 'WRONG_PHASE');
  if (!knownPlayer(state, actorPlayerId)) return rejected(state, 'UNKNOWN_PLAYER');
  const question = currentFamilyTriviaQuestion(state);
  if (!question || !question.respondentPlayerIds.includes(actorPlayerId)) return rejected(state, 'NOT_RESPONDENT');
  const answer = safeAnswer(answerInput);
  if (!answer || !answerFitsFamilyTriviaQuestion(answer, question)) return rejected(state, 'INVALID_ANSWER');
  const questionGuesses = state.guesses[question.id] ?? {};
  if (questionGuesses[actorPlayerId]) return rejected(state, 'ALREADY_SUBMITTED');
  return accepted({
    ...state,
    revision: state.revision + 1,
    guesses: {
      ...state.guesses,
      [question.id]: { ...questionGuesses, [actorPlayerId]: answer },
    },
  });
}

export function revealFamilyTriviaQuestion(
  state: FamilyTriviaSessionState,
  actorPlayerId: string,
): FamilyTriviaActionResult {
  if (state.phase === 'complete') return rejected(state, 'SESSION_COMPLETE');
  if (state.phase !== 'guessing') return rejected(state, 'WRONG_PHASE');
  if (!knownPlayer(state, actorPlayerId)) return rejected(state, 'UNKNOWN_PLAYER');
  if (state.setup.hostPlayerId !== actorPlayerId) return rejected(state, 'NOT_HOST');
  const question = currentFamilyTriviaQuestion(state);
  if (!question) return rejected(state, 'WRONG_PHASE');
  const reference = state.referenceAnswers[question.id];
  const questionGuesses = state.guesses[question.id] ?? {};
  if (!reference) return rejected(state, 'WRONG_PHASE');
  if (question.respondentPlayerIds.some((playerId) => questionGuesses[playerId] === undefined)) {
    return rejected(state, 'WAITING_FOR_GUESSES');
  }

  const playerPoints = question.respondentPlayerIds.map((playerId) => {
    const score = scoreFamilyTriviaAnswer(question, reference, questionGuesses[playerId]);
    return { playerId, points: score.points, exact: score.exact };
  });
  const result: FamilyTriviaQuestionResult = {
    questionId: question.id,
    skipped: false,
    playerPoints,
  };
  const pointByPlayer = new Map(playerPoints.map((entry) => [entry.playerId, entry]));
  // In free-for-all play the person being read earns one mutual-lock point for
  // every exact read. Bluffing to deny somebody else therefore also denies the
  // answer owner their own points. In team play the only reader is the owner's
  // teammate, so an honest match already benefits their shared side.
  const authorityMutualPoints = state.setup.teams.length === 0
    ? playerPoints.filter((entry) => entry.exact).length
    : 0;
  const playerScores = state.playerScores.map((score) => {
    const earned = pointByPlayer.get(score.playerId);
    if (earned) {
      return { ...score, points: score.points + earned.points, exactMatches: score.exactMatches + (earned.exact ? 1 : 0) };
    }
    return score.playerId === question.authorityPlayerId && authorityMutualPoints > 0
      ? { ...score, points: score.points + authorityMutualPoints }
      : score;
  });
  const teamScores = state.teamScores.map((score) => {
    const team = state.setup.teams.find((candidate) => candidate.id === score.teamId);
    const earned = playerPoints.filter((entry) => team?.memberPlayerIds.includes(entry.playerId));
    // Team mode intentionally ignores per-kind point weights. A side has at
    // most one assigned receiver per round and earns one fixed lock for an
    // exact read, so both sides have the same mathematical ceiling.
    const exactLocks = earned.filter((entry) => entry.exact).length;
    const exactMatches = score.exactMatches + exactLocks;
    const opportunities = score.opportunities + earned.length;
    return {
      ...score,
      points: familyTriviaTeamRateBasisPoints({ exactMatches, opportunities }),
      exactMatches,
      opportunities,
    };
  });
  return accepted({
    ...state,
    phase: 'revealed',
    revision: state.revision + 1,
    playerScores,
    teamScores,
    results: [...state.results, result],
  });
}

/**
 * Lets the person whose answer is being predicted judge the meaning of a
 * free-text guess after reveal. The automatic local match remains the default,
 * while this explicit verdict is the final authority for the round.
 */
export function reviewFamilyTriviaTextGuess(
  state: FamilyTriviaSessionState,
  actorPlayerId: string,
  respondentPlayerId: string,
  verdict: FamilyTriviaOwnerVerdict,
): FamilyTriviaActionResult {
  if (state.phase === 'complete') return rejected(state, 'SESSION_COMPLETE');
  if (state.phase !== 'revealed') return rejected(state, 'WRONG_PHASE');
  if (!knownPlayer(state, actorPlayerId) || !knownPlayer(state, respondentPlayerId)) {
    return rejected(state, 'UNKNOWN_PLAYER');
  }
  const question = currentFamilyTriviaQuestion(state);
  if (!question || question.answerKind !== 'text') return rejected(state, 'INVALID_ANSWER');
  if (question.authorityPlayerId !== actorPlayerId) return rejected(state, 'NOT_AUTHORITY');
  if (!question.respondentPlayerIds.includes(respondentPlayerId)) return rejected(state, 'NOT_RESPONDENT');
  const latestResult = state.results.at(-1);
  if (!latestResult || latestResult.questionId !== question.id || latestResult.skipped) {
    return rejected(state, 'WRONG_PHASE');
  }
  const verdictScore = ownerVerdictScore(verdict);
  const playerPoints = latestResult.playerPoints.map((entry) => entry.playerId === respondentPlayerId
    ? { ...entry, ...verdictScore, authorityReviewed: true as const }
    : entry);
  if (!playerPoints.some((entry) => entry.playerId === respondentPlayerId)) {
    return rejected(state, 'NOT_RESPONDENT');
  }
  const results = [
    ...state.results.slice(0, -1),
    { ...latestResult, playerPoints },
  ];
  const scores = calculateFamilyTriviaScores(state.setup, state.pack, results);
  return accepted({
    ...state,
    revision: state.revision + 1,
    results,
    playerScores: scores.playerScores,
    teamScores: scores.teamScores,
  });
}

export function advanceFamilyTriviaQuestion(
  state: FamilyTriviaSessionState,
  actorPlayerId: string,
): FamilyTriviaActionResult {
  if (state.phase === 'complete') return rejected(state, 'SESSION_COMPLETE');
  if (state.phase !== 'revealed') return rejected(state, 'WRONG_PHASE');
  if (!knownPlayer(state, actorPlayerId)) return rejected(state, 'UNKNOWN_PLAYER');
  if (state.setup.hostPlayerId !== actorPlayerId) return rejected(state, 'NOT_HOST');
  const finalQuestion = state.questionIndex >= state.pack.questions.length - 1;
  return accepted({
    ...state,
    phase: finalQuestion ? 'complete' : 'reference',
    questionIndex: finalQuestion ? state.questionIndex : state.questionIndex + 1,
    revision: state.revision + 1,
  });
}

export function skipFamilyTriviaQuestion(
  state: FamilyTriviaSessionState,
  actorPlayerId: string,
): FamilyTriviaActionResult {
  if (state.phase === 'complete') return rejected(state, 'SESSION_COMPLETE');
  if (state.phase !== 'reference' && state.phase !== 'guessing') return rejected(state, 'WRONG_PHASE');
  if (!knownPlayer(state, actorPlayerId)) return rejected(state, 'UNKNOWN_PLAYER');
  const question = currentFamilyTriviaQuestion(state);
  if (!question || !question.canSkip) return rejected(state, 'CANNOT_SKIP');
  // In team play, only the answer owner can void a card and only before an
  // answer exists. This handles genuinely inapplicable prompts without giving
  // the host or either team a way to erase a known outcome. A void records no
  // attempt for either side, so normalized team rates remain fair.
  if (state.setup.teams.length && (state.phase !== 'reference' || actorPlayerId !== question.authorityPlayerId)) {
    return rejected(state, actorPlayerId === question.authorityPlayerId ? 'CANNOT_SKIP' : 'NOT_AUTHORITY');
  }
  if (!state.setup.teams.length && actorPlayerId !== state.setup.hostPlayerId && actorPlayerId !== question.authorityPlayerId) {
    return rejected(state, 'NOT_AUTHORITY');
  }
  const referenceAnswers = { ...state.referenceAnswers };
  const guesses = { ...state.guesses };
  delete referenceAnswers[question.id];
  delete guesses[question.id];
  const result: FamilyTriviaQuestionResult = { questionId: question.id, skipped: true, playerPoints: [] };
  const finalQuestion = state.questionIndex >= state.pack.questions.length - 1;
  return accepted({
    ...state,
    phase: finalQuestion ? 'complete' : 'reference',
    questionIndex: finalQuestion ? state.questionIndex : state.questionIndex + 1,
    revision: state.revision + 1,
    referenceAnswers,
    guesses,
    results: [...state.results, result],
  });
}

export function scoreFamilyTriviaAnswer(
  question: FamilyTriviaQuestion,
  reference: FamilyTriviaAnswer,
  guess: FamilyTriviaAnswer | undefined,
): FamilyTriviaAnswerScore {
  if (!guess || reference.kind !== guess.kind) return { exact: false, points: 0 };
  if (question.answerKind === 'choice' && reference.kind === 'choice' && guess.kind === 'choice') {
    const exact = reference.optionId === guess.optionId;
    const value = question.kind === 'who-knows-who' ? 3 : 2;
    return { exact, points: exact ? value : 0 };
  }
  if (question.answerKind === 'ordering' && reference.kind === 'ordering' && guess.kind === 'ordering') {
    const pairs = pairwiseAgreement(reference.optionIds, guess.optionIds);
    if (pairs === 1) return { exact: true, points: 4 };
    if (pairs >= 0.66) return { exact: false, points: 2 };
    if (pairs >= 0.5) return { exact: false, points: 1 };
    return { exact: false, points: 0 };
  }
  if (question.answerKind === 'spectrum' && reference.kind === 'spectrum' && guess.kind === 'spectrum') {
    const distance = Math.abs(reference.value - guess.value);
    if (distance <= 5) return { exact: true, points: 4 };
    if (distance <= 15) return { exact: false, points: 3 };
    if (distance <= 30) return { exact: false, points: 1 };
    return { exact: false, points: 0 };
  }
  if (question.answerKind === 'text' && reference.kind === 'text' && guess.kind === 'text') {
    const similarity = familyTriviaTextSimilarity(reference.value, guess.value);
    if (similarity >= 0.88) return { exact: true, points: 4 };
    if (similarity >= 0.58) return { exact: false, points: 2 };
    if (similarity >= 0.34) return { exact: false, points: 1 };
  }
  return { exact: false, points: 0 };
}

function ownerVerdictScore(verdict: FamilyTriviaOwnerVerdict): FamilyTriviaAnswerScore {
  if (verdict === 'exact') return { exact: true, points: 4 };
  if (verdict === 'close') return { exact: false, points: 2 };
  return { exact: false, points: 0 };
}

function calculateFamilyTriviaScores(
  setup: FamilyTriviaSetup,
  pack: FamilyTriviaQuestionPack,
  results: readonly FamilyTriviaQuestionResult[],
): Pick<FamilyTriviaSessionState, 'playerScores' | 'teamScores'> {
  const playerScores = setup.players.map((player) => ({ playerId: player.id, points: 0, exactMatches: 0 }));
  const teamScores = setup.teams.map((team) => ({ teamId: team.id, points: 0, exactMatches: 0, opportunities: 0 }));
  for (const result of results) {
    if (result.skipped) continue;
    const question = pack.questions.find((candidate) => candidate.id === result.questionId);
    if (!question) continue;
    for (const entry of result.playerPoints) {
      const player = playerScores.find((candidate) => candidate.playerId === entry.playerId);
      if (player) {
        player.points += entry.points;
        player.exactMatches += entry.exact ? 1 : 0;
      }
    }
    if (!setup.teams.length) {
      const owner = playerScores.find((candidate) => candidate.playerId === question.authorityPlayerId);
      if (owner) owner.points += result.playerPoints.filter((entry) => entry.exact).length;
    }
    for (const teamScore of teamScores) {
      const team = setup.teams.find((candidate) => candidate.id === teamScore.teamId);
      const entries = result.playerPoints.filter((entry) => team?.memberPlayerIds.includes(entry.playerId));
      teamScore.opportunities += entries.length;
      teamScore.exactMatches += entries.filter((entry) => entry.exact).length;
      teamScore.points = familyTriviaTeamRateBasisPoints(teamScore);
    }
  }
  return { playerScores, teamScores };
}

const FAMILY_WORD_EQUIVALENTS: Readonly<Record<string, string>> = {
  biscuit: 'cookie',
  biscuits: 'cookie',
  chip: 'fries',
  chips: 'fries',
  cookie: 'cookie',
  cookies: 'cookie',
  couch: 'sofa',
  film: 'movie',
  films: 'movie',
  fries: 'fries',
  fry: 'fries',
  football: 'soccer',
  movie: 'movie',
  movies: 'movie',
  pop: 'soda',
  soda: 'soda',
  sofa: 'sofa',
  soccer: 'soccer',
  telly: 'tv',
  television: 'tv',
  tv: 'tv',
};

/**
 * Local-only fuzzy matching for the short-answer round. It deliberately uses
 * a small, explainable vocabulary plus token/edit similarity: no family text
 * leaves the phone and the game remains fully playable without a model key.
 */
export function familyTriviaTextSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeFamilyTriviaText(left);
  const normalizedRight = normalizeFamilyTriviaText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const leftTokens = new Set(normalizedLeft.split(' '));
  const rightTokens = new Set(normalizedRight.split(' '));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const tokenCoverage = shared / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  const editSimilarity = 1 - levenshteinDistance(normalizedLeft, normalizedRight) /
    Math.max(normalizedLeft.length, normalizedRight.length);
  return Math.max(0, Math.min(1, tokenCoverage * 0.72 + editSimilarity * 0.28));
}

function normalizeFamilyTriviaText(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !['a', 'an', 'the'].includes(token))
    .map(canonicalizeFamilyTriviaToken)
    .join(' ');
}

function canonicalizeFamilyTriviaToken(token: string): string {
  const direct = FAMILY_WORD_EQUIVALENTS[token];
  if (direct) return direct;

  // Conservative English singularization makes ordinary entries such as
  // "tacos"/"taco" and "berries"/"berry" equal without trying to be a
  // dictionary. Known irregular or regional terms are handled above first.
  let singular = token;
  if (token.length > 4 && token.endsWith('ies')) {
    singular = `${token.slice(0, -3)}y`;
  } else if (token.length > 4 && /(?:ches|shes|sses|xes|zes)$/.test(token)) {
    singular = token.slice(0, -2);
  } else if (token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)) {
    singular = token.slice(0, -1);
  }
  return FAMILY_WORD_EQUIVALENTS[singular] ?? singular;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

/** Public projection is safe to broadcast: it never includes a reference answer or a guess. */
export function projectFamilyTriviaPublic(state: FamilyTriviaSessionState): FamilyTriviaPublicProjection {
  const question = currentFamilyTriviaQuestion(state);
  const submittedRespondentPlayerIds = question
    ? question.respondentPlayerIds.filter((playerId) => state.guesses[question.id]?.[playerId] !== undefined)
    : [];
  const waitingRespondentPlayerIds = question
    ? question.respondentPlayerIds.filter((playerId) => !submittedRespondentPlayerIds.includes(playerId))
    : [];
  return {
    sessionId: state.id,
    packId: state.pack.id,
    phase: state.phase,
    revision: state.revision,
    questionIndex: state.questionIndex,
    questionCount: state.pack.questions.length,
    question,
    referenceSubmitted: Boolean(question && state.referenceAnswers[question.id]),
    submittedRespondentPlayerIds,
    waitingRespondentPlayerIds,
    readyToReveal: state.phase === 'guessing' && waitingRespondentPlayerIds.length === 0,
    playerScores: state.playerScores,
    teamScores: state.teamScores,
    latestResult: state.phase === 'revealed' ? state.results.at(-1) : undefined,
  };
}

export function projectFamilyTriviaPlayer(
  state: FamilyTriviaSessionState,
  viewerPlayerId: string,
): FamilyTriviaPlayerProjection {
  if (!knownPlayer(state, viewerPlayerId)) throw new Error('Cannot project trivia for an unknown player.');
  const publicProjection = projectFamilyTriviaPublic(state);
  const question = currentFamilyTriviaQuestion(state);
  const ownGuess = question ? state.guesses[question.id]?.[viewerPlayerId] : undefined;
  const ownResult = state.phase === 'revealed'
    ? state.results.at(-1)?.playerPoints.find((entry) => entry.playerId === viewerPlayerId)
    : undefined;
  const referenceAnswer = state.phase === 'revealed' && question
    ? state.referenceAnswers[question.id]
    : undefined;
  return {
    ...publicProjection,
    viewerPlayerId,
    viewerIsAuthority: question?.authorityPlayerId === viewerPlayerId,
    viewerIsRespondent: question?.respondentPlayerIds.includes(viewerPlayerId) ?? false,
    viewerHasSubmitted: question?.authorityPlayerId === viewerPlayerId
      ? Boolean(state.referenceAnswers[question.id])
      : Boolean(ownGuess),
    ownGuess,
    reveal: referenceAnswer
      ? {
          referenceAnswer,
          ownPoints: ownResult?.points ?? 0,
          ownExact: ownResult?.exact ?? false,
        }
      : undefined,
  };
}

function pairwiseAgreement(reference: readonly string[], guess: readonly string[]): number {
  let total = 0;
  let matching = 0;
  const referencePositions = new Map(reference.map((id, index) => [id, index]));
  const guessPositions = new Map(guess.map((id, index) => [id, index]));
  for (let left = 0; left < reference.length; left += 1) {
    for (let right = left + 1; right < reference.length; right += 1) {
      total += 1;
      const leftId = reference[left];
      const rightId = reference[right];
      const referenceOrder = (referencePositions.get(leftId) ?? 0) < (referencePositions.get(rightId) ?? 0);
      const guessOrder = (guessPositions.get(leftId) ?? Number.MAX_SAFE_INTEGER) < (guessPositions.get(rightId) ?? Number.MAX_SAFE_INTEGER);
      if (referenceOrder === guessOrder) matching += 1;
    }
  }
  return total === 0 ? 0 : matching / total;
}

function knownPlayer(state: FamilyTriviaSessionState, playerId: string): boolean {
  return state.setup.players.some((player) => player.id === playerId);
}

function safeAnswer(input: unknown): FamilyTriviaAnswer | undefined {
  try {
    return parseFamilyTriviaAnswer(input);
  } catch {
    return undefined;
  }
}

function accepted(state: FamilyTriviaSessionState): FamilyTriviaActionResult {
  return { accepted: true, code: 'ACCEPTED', state };
}

function rejected(state: FamilyTriviaSessionState, code: FamilyTriviaActionCode): FamilyTriviaActionResult {
  return { accepted: false, code, state };
}
