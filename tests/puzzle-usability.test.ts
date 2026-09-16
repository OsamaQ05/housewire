import { describe, expect, it } from 'vitest';
import { generateOfflineForgeCase, parseForgeCase, validateForgeCase, validateForgeSubmission } from '../src/domain/case-forge';
import { attemptCooldownSeconds, canAppendRoute, ROUTE_LANDMARKS, routeLandmark } from '../src/domain/case-forge/route-landmarks';
import { compileCircuitRace, validateCircuitRaceStage } from '../src/domain/circuit-race';
import { circuitRaceSubmissionSchema } from '../src/features/race/protocol';
import { withLegacySyncFinale } from './legacy-forge-fixture';
import { matchesSealRiddle, sealRiddle } from '../src/domain/seal-riddles';

const game = () => generateOfflineForgeCase({ seed: 'FRIENDLY-MAP', generatedAt: 1800000000000, playerIds: ['mum', 'dad', 'kid'], difficulty: 3, targetMinutes: 30, tone: 'mystery', intensity: 'balanced', safeMovement: false, noiseAllowed: false });

describe('friendlier puzzle rules', () => {
  it('gives all sixteen possible map places a unique pronounceable landmark', () => {
    expect(new Set(ROUTE_LANDMARKS.map((item) => item.label)).size).toBe(16);
    expect(routeLandmark(1).label).toBe('Sun');
    expect(routeLandmark(9).label).toBe('Star');
  });
  it('permits orthogonal steps but rejects wrapped rows, revisits, diagonals and invalid places', () => {
    expect(canAppendRoute([1], 2, 3, 9)).toBe(true);
    expect(canAppendRoute([1], 4, 3, 9)).toBe(true);
    expect(canAppendRoute([3], 4, 3, 9)).toBe(false);
    expect(canAppendRoute([1], 5, 3, 9)).toBe(false);
    expect(canAppendRoute([1, 2], 1, 3, 9)).toBe(false);
    expect(canAppendRoute([9], 10, 3, 9)).toBe(false);
  });
  it('uses a bounded retry pause, without permanent lockout', () => {
    expect([0, 1, 2, 5, 99].map(attemptCooldownSeconds)).toEqual([0, 3, 6, 15, 15]);
  });
  it('new cases end in inference, with camera, word riddle, route and private relay retained', () => {
    const current = game();
    expect(current.generatorVersion).toBe('housewire-local-forge-v3');
    expect(validateForgeCase(current).playable).toBe(true);
    expect(current.stages[4].mechanic.kind).toBe('distributed-order');
    expect(current.stages.some((stage) => stage.mechanic.kind === 'motion-sync')).toBe(false);
    expect(new Set(current.stages.map((stage) => stage.mechanic.kind)).size).toBe(5);
  });
  it('still parses and validates a saved version-two contact finale', () => {
    const legacy = withLegacySyncFinale(game());
    expect(validateForgeCase(parseForgeCase(JSON.parse(JSON.stringify(legacy))))).toMatchObject({ playable: true });
  });
  it('accepts friendly typed riddle words with an article and spaces', () => {
    const current = game();
    const stage = current.stages.find((entry) => entry.solution.kind === 'word')!;
    if (stage.solution.kind !== 'word') throw Error('missing riddle');
    expect(validateForgeSubmission(current, stage.index, { kind: 'word', value: `The ${stage.solution.answer.replaceAll('-', ' ')}` }).accepted).toBe(true);
  });
  it('does not say whether a partial code or sequence matches the answer', () => {
    const current = game();
    const stage = current.stages.find((entry) => entry.solution.kind === 'code')!;
    if (stage.solution.kind !== 'code') throw Error('missing lock');
    const correct = validateForgeSubmission(current, stage.index, { kind: 'code', value: stage.solution.answer.slice(0, 1) });
    const incorrect = validateForgeSubmission(current, stage.index, { kind: 'code', value: 'X' });
    expect(correct).toEqual(incorrect);
    expect(correct).not.toHaveProperty('acceptedPrefixLength');
  });
  it('race verse lock validates the actual answer without inventing a sensor or hold proof', () => {
    const course = compileCircuitRace(12345, 'test-team');
    const stage = course.stages.find((entry) => entry.mechanic === 'flat-phone')!;
    if (stage.mechanic !== 'flat-phone') throw Error('missing verse lock');
    const submission = { mechanic: 'flat-phone', mode: 'decoded-signal', signalSequence: stage.challenge.tiltSequence } as const;
    expect(circuitRaceSubmissionSchema.safeParse(submission).success).toBe(true);
    expect(validateCircuitRaceStage(course, stage.id, submission).valid).toBe(true);
    expect(validateCircuitRaceStage(course, stage.id, { ...submission, signalSequence: [...stage.challenge.tiltSequence].reverse() }).valid).toBe(false);
    expect(validateCircuitRaceStage(course, stage.id, { ...submission, signalSequence: [] }).valid).toBe(false);
  });
  it('old contact replacements require a real riddle answer and vary by room, stage and player', () => {
    const keys = Array.from({ length: 100 }, (_, index) => `room-${index}:3:kid:FLAT`);
    expect(new Set(keys.map((key) => sealRiddle(key).clue)).size).toBeGreaterThanOrEqual(10);
    for (const key of keys) {
      expect(matchesSealRiddle(key, '')).toBe(false);
      expect(matchesSealRiddle(key, 'wrong random guess')).toBe(false);
      expect(matchesSealRiddle(key, sealRiddle(key).answers[0].toUpperCase())).toBe(true);
    }
  });
});
