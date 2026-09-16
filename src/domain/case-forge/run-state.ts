import type { ForgeCase, ForgeStage, ForgeStageSubmission, ForgeSubmissionResult } from './types';
import { validateForgeSubmission } from './validation';
import { routeLandmark } from './route-landmarks';
import { sealRiddle } from '../seal-riddles';

export const FORGE_MAX_ATTEMPTS = 5;

export interface ForgeAnswerReview {
  stageId: string;
  title: string;
  answer: string;
  explanation: string;
}

export interface StoredForgeRun {
  activePlayerId: string;
  caseId: string;
  completedAt: number | null;
  failedAt: number | null;
  attemptsUsed: number;
  hintsByStage: Readonly<Record<string, number>>;
  startedAt: number;
  stageIndex: number;
}

export function createForgeRun(caseId: string, activePlayerId: string, now: number): StoredForgeRun {
  return { caseId, activePlayerId, startedAt: now, completedAt: null, failedAt: null, attemptsUsed: 0, hintsByStage: {}, stageIndex: 0 };
}

/** Only a submitted, wrong answer spends a try. Missing input or a lost connection does not. */
export function forgeResultSpendsAttempt(result: ForgeSubmissionResult): boolean {
  return !result.accepted && (result.code === 'WRONG_VALUE' || result.code === 'TIMING_WINDOW');
}

export function reduceForgeRunSubmission(run: StoredForgeRun, game: ForgeCase, submission: ForgeStageSubmission, now: number) {
  if (run.caseId !== game.id || run.completedAt !== null || run.failedAt !== null || run.attemptsUsed >= FORGE_MAX_ATTEMPTS) {
    return { run, result: { accepted: false, code: 'INVALID_STAGE' } as ForgeSubmissionResult };
  }
  const result = validateForgeSubmission(game, run.stageIndex, submission);
  if (result.accepted) {
    const stageIndex = run.stageIndex + 1;
    return { run: { ...run, stageIndex, completedAt: stageIndex >= game.stages.length ? now : null }, result };
  }
  if (!forgeResultSpendsAttempt(result)) return { run, result };
  const attemptsUsed = Math.min(FORGE_MAX_ATTEMPTS, run.attemptsUsed + 1);
  return { run: { ...run, attemptsUsed, failedAt: attemptsUsed >= FORGE_MAX_ATTEMPTS ? now : null }, result };
}

/** Accept old checkpoints without resetting their solved scenes; all new attempts persist. */
export function parseStoredForgeRun(value: unknown, caseId: string, stageCount: number): StoredForgeRun | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredForgeRun>;
  const stamp = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  const attemptsUsed = candidate.attemptsUsed ?? 0;
  const failedAt = candidate.failedAt ?? null;
  if (candidate.caseId !== caseId || typeof candidate.activePlayerId !== 'string' || !stamp(candidate.startedAt) ||
    !Number.isInteger(candidate.stageIndex) || candidate.stageIndex! < 0 || candidate.stageIndex! > stageCount ||
    (candidate.completedAt !== null && !stamp(candidate.completedAt)) || (failedAt !== null && !stamp(failedAt)) ||
    !Number.isInteger(attemptsUsed) || attemptsUsed < 0 || attemptsUsed > FORGE_MAX_ATTEMPTS ||
    !candidate.hintsByStage || typeof candidate.hintsByStage !== 'object' || Array.isArray(candidate.hintsByStage) ||
    !Object.values(candidate.hintsByStage).every((count) => Number.isInteger(count) && count >= 0) ||
    (failedAt !== null && (candidate.completedAt !== null || candidate.stageIndex === stageCount)) ||
    (candidate.completedAt !== null && candidate.stageIndex !== stageCount)) return null;
  // A saturated checkpoint is terminal even if an older writer omitted failedAt.
  return { ...candidate, attemptsUsed, failedAt: attemptsUsed >= FORGE_MAX_ATTEMPTS ? failedAt ?? candidate.startedAt! : failedAt } as StoredForgeRun;
}

/** Call only for a terminal case; never put these values in active-player projections. */
export function forgeFailureReview(game: ForgeCase, stageIndex: number): ForgeAnswerReview[] {
  return game.stages.slice(stageIndex).map((stage) => ({ stageId: stage.id, title: stage.title, ...describeForgeAnswer(game, stage) }));
}

function describeForgeAnswer(game: ForgeCase, stage: ForgeStage): Pick<ForgeAnswerReview, 'answer' | 'explanation'> {
  const solution = stage.solution;
  switch (solution.kind) {
    case 'word': return { answer: solution.answer.replace(/-/g, ' '), explanation: stage.clues.flatMap((clue) => clue.payload.kind === 'riddle-fragment' ? [clue.payload.text] : []).join(' ') };
    case 'code': return { answer: solution.answer, explanation: 'Translate the displayed symbols using the decoder strips, in their displayed order.' };
    case 'sequence': {
      const tokens = stage.mechanic.kind === 'distributed-order' ? stage.mechanic.tokens : [];
      return { answer: solution.answer.map((id) => tokens.find((token) => token.id === id)?.label ?? id).join(' → '), explanation: 'Combine every “comes before” clue into one order. Each object appears once.' };
    }
    case 'route': return { answer: solution.answer.map((cell) => routeLandmark(cell).label).join(' → '), explanation: 'These landmarks connect through the doors on the private maps, from entrance to exit.' };
    case 'relay': return { answer: solution.rounds.map((round) => `${game.roles.find((role) => role.playerId === round.recipientPlayerId)?.playerName ?? round.recipientPlayerId}: ${round.token}`).join(' · '), explanation: 'Each one-time word belongs to its named recipient. The sender passes it privately.' };
    case 'sync': return { answer: solution.assignments.map((assignment) => `${game.roles.find((role) => role.playerId === assignment.playerId)?.playerName ?? assignment.playerId}: ${sealRiddle(`${stage.id}:${assignment.playerId}:${assignment.pose}`).answers[0]}`).join(' · '), explanation: 'Each player solves their word seal, then everyone unlocks together.' };
  }
}
