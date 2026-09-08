import { describe, expect, it } from 'vitest';

import {
  compileCircuitRace,
  type CircuitRaceStage,
  type CompiledCircuitRace,
} from '../../domain/circuit-race';
import type { TeamEscapeRaceState } from '../../domain/team-escape-race';
import {
  circuitRaceDisplayCourseSchema,
  projectCircuitRaceCourseForPlayer,
  projectCircuitRaceCoursePreview,
  type CircuitRaceDisplayCourse,
  type CircuitRaceDisplayStage,
} from './course-projection';

const SEED = 0x4a11_ce55;

function sourceStage<M extends CircuitRaceStage['mechanic']>(
  course: CompiledCircuitRace,
  mechanic: M,
): Extract<CircuitRaceStage, { mechanic: M }> {
  const stage = course.stages.find((candidate) => candidate.mechanic === mechanic);
  if (!stage) throw new Error(`Fixture is missing ${mechanic}.`);
  return stage as Extract<CircuitRaceStage, { mechanic: M }>;
}

function displayStage<M extends CircuitRaceDisplayStage['mechanic']>(
  course: CircuitRaceDisplayCourse,
  mechanic: M,
): Extract<CircuitRaceDisplayStage, { mechanic: M }> {
  const stage = course.stages.find((candidate) => candidate.mechanic === mechanic);
  if (!stage) throw new Error(`Projection is missing ${mechanic}.`);
  return stage as Extract<CircuitRaceDisplayStage, { mechanic: M }>;
}

function raceState(
  course: CompiledCircuitRace,
  mode: TeamEscapeRaceState['mode'],
  rosters: readonly (readonly string[])[],
): TeamEscapeRaceState {
  const nodeIds = rosters.flatMap((members) => [...members]);
  return {
    acceptedEventIds: [],
    hostNodeId: nodeIds[0],
    mode,
    operationId: 'projection-test-race',
    participants: nodeIds.map((nodeId) => ({
      label: nodeId,
      nodeId,
      simulated: false,
      skill: 5,
    })),
    revision: 0,
    seed: course.seed,
    stages: course.stages.map((stage) => ({
      id: stage.id,
      label: stage.title,
      proofIds: [stage.proofId],
    })),
    startsAt: 1_000,
    teams: rosters.map((memberNodeIds, index) => ({
      acceptedProofs: [],
      memberNodeIds: [...memberNodeIds],
      stageIndex: 0,
      stageStartedAt: 1_000,
      teamId: `team-${index + 1}`,
    })),
    tieWindowMs: 750,
  };
}

function atBreaker(state: TeamEscapeRaceState): TeamEscapeRaceState {
  return {
    ...state,
    teams: state.teams.map((team) => ({ ...team, stageIndex: 3 })),
  };
}

function nestedKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...nestedKeys(child)]);
}

function expectNoSecretKeys(value: unknown): void {
  const keys = nestedKeys(value);
  for (const secretKey of ['answers', 'contentId', 'proofId', 'seed']) {
    expect(keys).not.toContain(secretKey);
  }
}

function withoutStation(challenge: object): Record<string, unknown> {
  const result = { ...challenge } as Record<string, unknown>;
  delete result.station;
  return result;
}

function expectedFullChallenges(course: CompiledCircuitRace): object[] {
  return course.stages.map((stage) => stage.mechanic === 'sequence-cipher'
    ? {
        ...stage.challenge,
        panels: stage.challenge.panels.map((panel, index) => ({
          ...panel,
          panelId: `relay-plate-${index + 1}`,
        })),
      }
    : stage.challenge);
}

function expectedBreakerFragments(course: CompiledCircuitRace) {
  return course.breakerFragments.map((fragment) => ({
    ...fragment,
    fragmentId: fragment.ownerSlot === 0 ? 'breaker-strip-odd' : 'breaker-strip-even',
  }));
}

describe('Circuit Race course projection', () => {
  it('creates a challenge-complete preview without private course material', () => {
    const course = compileCircuitRace(SEED, 'preview-course');
    const preview = projectCircuitRaceCoursePreview(course);

    expect(preview.breakerFragments).toEqual([]);
    expect(preview.stages).toHaveLength(4);
    expect(preview.stages.map((stage) => stage.id)).toEqual(course.stages.map((stage) => stage.id));
    expect(preview.stages.map((stage) => stage.challenge.station)).toEqual([
      'FULL',
      'FULL',
      'FULL',
      'FULL',
    ]);
    expect(preview.stages.map((stage) => withoutStation(stage.challenge))).toEqual(
      expectedFullChallenges(course),
    );
    expect(preview.stages.map((stage) => stage.hints)).toEqual(
      course.stages.map((stage) => stage.hints),
    );
    expect(circuitRaceDisplayCourseSchema.safeParse(preview).success).toBe(true);
    expectNoSecretKeys(preview);
  });

  it('projects every seeded opening route with mechanic-correct private stations', () => {
    const representatives = new Map<string, CompiledCircuitRace>();
    for (let seed = 0; seed < 500 && representatives.size < 6; seed += 1) {
      const course = compileCircuitRace(seed, 'variety-course');
      representatives.set(course.stages.map((stage) => stage.id).join('|'), course);
    }
    expect(representatives.size).toBe(6);

    const slotZeroStation = {
      'breaker-code': 'ODD',
      'flat-phone': 'ORIENTATION',
      'knock-pattern': 'PLAYBACK',
      'sequence-cipher': 'PLATES',
    } as const;
    const slotOneStation = {
      'breaker-code': 'EVEN',
      'flat-phone': 'GROUND',
      'knock-pattern': 'CONSOLE',
      'sequence-cipher': 'WHEEL',
    } as const;

    for (const course of representatives.values()) {
      const state = atBreaker(raceState(course, 'live', [
        ['alpha', 'bravo'],
        ['charlie', 'delta'],
      ]));
      const slotZero = projectCircuitRaceCourseForPlayer(course, state, 'alpha');
      const slotOne = projectCircuitRaceCourseForPlayer(course, state, 'bravo');
      expect(slotZero.stages.map((stage) => stage.challenge.station)).toEqual(
        slotZero.stages.map((stage) => slotZeroStation[stage.mechanic]),
      );
      expect(slotOne.stages.map((stage) => stage.challenge.station)).toEqual(
        slotOne.stages.map((stage) => slotOneStation[stage.mechanic]),
      );
      expect(circuitRaceDisplayCourseSchema.safeParse(slotZero).success).toBe(true);
      expect(circuitRaceDisplayCourseSchema.safeParse(slotOne).success).toBe(true);
    }
  });

  it.each([0, SEED])(
    'gives 2v2 recipients complementary stations and only their stable-slot fragment (seed %i)',
    (seed) => {
    const course = compileCircuitRace(seed, 'two-v-two-course');
    const initialState = raceState(course, 'live', [
      ['alpha', 'bravo'],
      ['charlie', 'delta'],
    ]);
    const state = atBreaker(initialState);

    expect(projectCircuitRaceCourseForPlayer(course, initialState, 'alpha').breakerFragments).toEqual([]);
    expect(projectCircuitRaceCourseForPlayer(course, initialState, 'bravo').breakerFragments).toEqual([]);

    const slotZero = projectCircuitRaceCourseForPlayer(course, state, 'alpha');
    const slotOne = projectCircuitRaceCourseForPlayer(course, state, 'bravo');

    expect(slotZero.breakerFragments).toEqual([expectedBreakerFragments(course)[0]]);
    expect(slotOne.breakerFragments).toEqual([expectedBreakerFragments(course)[1]]);
    expect(JSON.stringify(slotZero)).not.toContain(course.breakerFragments[0].fragmentId);
    expect(JSON.stringify(slotZero)).not.toContain(course.breakerFragments[1].fragmentId);
    expect(JSON.stringify(slotOne)).not.toContain(course.breakerFragments[0].fragmentId);
    expect(JSON.stringify(slotOne)).not.toContain(course.breakerFragments[1].fragmentId);
    const sourceSequence = sourceStage(course, 'sequence-cipher');
    const sourceKnock = sourceStage(course, 'knock-pattern');
    const sourceGround = sourceStage(course, 'flat-phone');
    const zeroSequence = displayStage(slotZero, 'sequence-cipher');
    const oneSequence = displayStage(slotOne, 'sequence-cipher');
    const zeroKnock = displayStage(slotZero, 'knock-pattern');
    const oneKnock = displayStage(slotOne, 'knock-pattern');
    const zeroGround = displayStage(slotZero, 'flat-phone');
    const oneGround = displayStage(slotOne, 'flat-phone');

    expect(zeroSequence.challenge).toEqual({
      panels: sourceSequence.challenge.panels.map((panel, index) => ({
        ...panel,
        panelId: `relay-plate-${index + 1}`,
      })),
      readingRule: sourceSequence.challenge.readingRule,
      station: 'PLATES',
    });
    expect(oneSequence.challenge).toEqual({
      answerLength: sourceSequence.challenge.answerLength,
      cipherWheel: sourceSequence.challenge.cipherWheel,
      station: 'WHEEL',
    });
    expect(zeroKnock.challenge).toEqual({
      pulseDurationsMs: sourceKnock.challenge.pulseDurationsMs,
      replayLimit: sourceKnock.challenge.replayLimit,
      station: 'PLAYBACK',
    });
    expect(oneKnock.challenge).toEqual({
      accessibleChoices: sourceKnock.challenge.accessibleChoices,
      longReferenceMs: sourceKnock.challenge.longReferenceMs,
      shortReferenceMs: sourceKnock.challenge.shortReferenceMs,
      station: 'CONSOLE',
      timingToleranceMs: sourceKnock.challenge.timingToleranceMs,
    });
    expect(zeroGround.challenge).toEqual({
      requiredFace: sourceGround.challenge.requiredFace,
      station: 'ORIENTATION',
      tiltSequence: sourceGround.challenge.tiltSequence,
    });
    expect(oneGround.challenge).toEqual({
      fallback: sourceGround.challenge.fallback,
      holdMs: sourceGround.challenge.holdMs,
      maxTiltDegrees: sourceGround.challenge.maxTiltDegrees,
      minimumSamples: sourceGround.challenge.minimumSamples,
      moveCount: sourceGround.challenge.moveCount,
      requiredFace: null,
      station: 'GROUND',
      tiltSequence: null,
    });
    expect(displayStage(slotZero, 'breaker-code').challenge.station).toBe('ODD');
    expect(displayStage(slotOne, 'breaker-code').challenge.station).toBe('EVEN');

    const groundSecret = sourceGround.challenge.requiredFace;
    const groundSecretText = groundSecret === 'FACE_UP' ? 'screen-up' : 'screen-down';
    const groundInstructionSecret = groundSecret === 'FACE_UP'
      ? 'screen facing up'
      : 'screen facing down';
    const slotOneJson = JSON.stringify(slotOne);
    expect(slotOneJson).not.toContain(groundSecret);
    expect(slotOneJson).not.toContain(groundSecretText);
    expect(slotOneJson).not.toContain(groundInstructionSecret);
    expect(oneGround.instruction).toContain('Enter the three symbols');
    expect(oneGround.hints[1].text).toContain('After all three symbols');
    expect(circuitRaceDisplayCourseSchema.safeParse(slotZero).success).toBe(true);
    expect(circuitRaceDisplayCourseSchema.safeParse(slotOne).success).toBe(true);
    expectNoSecretKeys(slotZero);
    expectNoSecretKeys(slotOne);
    },
  );

  it('gives both fragments to one-player live teams and to practice players', () => {
    const course = compileCircuitRace(SEED, 'full-fragment-course');
    const oneVsOne = raceState(course, 'live', [['alpha'], ['bravo']]);
    const practice = raceState(course, 'practice', [
      ['alpha', 'practice-bot-1'],
      ['practice-bot-2', 'practice-bot-3'],
    ]);

    expect(projectCircuitRaceCourseForPlayer(course, oneVsOne, 'alpha').breakerFragments).toEqual([]);
    expect(projectCircuitRaceCourseForPlayer(course, practice, 'alpha').breakerFragments).toEqual([]);
    const oneVsOneCourse = projectCircuitRaceCourseForPlayer(course, atBreaker(oneVsOne), 'alpha');
    const practiceCourse = projectCircuitRaceCourseForPlayer(course, atBreaker(practice), 'alpha');

    expect(oneVsOneCourse.breakerFragments).toEqual(expectedBreakerFragments(course));
    expect(practiceCourse.breakerFragments).toEqual(expectedBreakerFragments(course));
    expect(oneVsOneCourse.stages.map((stage) => stage.challenge.station)).toEqual([
      'FULL',
      'FULL',
      'FULL',
      'FULL',
    ]);
    expect(practiceCourse.stages.map((stage) => stage.challenge.station)).toEqual([
      'FULL',
      'FULL',
      'FULL',
      'FULL',
    ]);
    expect(oneVsOneCourse.stages.map((stage) => withoutStation(stage.challenge))).toEqual(
      expectedFullChallenges(course),
    );
    expect(practiceCourse.stages.map((stage) => withoutStation(stage.challenge))).toEqual(
      expectedFullChallenges(course),
    );
  });

  it('strictly rejects secret fields, malformed stage order, and inconsistent fragments', () => {
    const course = compileCircuitRace(SEED, 'strict-course');
    const preview = projectCircuitRaceCoursePreview(course);
    const complete = projectCircuitRaceCourseForPlayer(
      course,
      atBreaker(raceState(course, 'live', [['alpha'], ['bravo']])),
      'alpha',
    );

    for (const secret of [
      { answers: { breakerCode: '0000' } },
      { contentId: course.contentId },
      { seed: course.seed },
    ]) {
      expect(circuitRaceDisplayCourseSchema.safeParse({ ...preview, ...secret }).success).toBe(false);
    }
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...preview,
      stages: [
        { ...preview.stages[0], proofId: course.stages[0].proofId },
        preview.stages[1],
        preview.stages[2],
        preview.stages[3],
      ],
    }).success).toBe(false);
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...preview,
      stages: [
        preview.stages[1],
        preview.stages[0],
        preview.stages[2],
        preview.stages[3],
      ],
    }).success).toBe(false);
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...complete,
      breakerFragments: [
        complete.breakerFragments[0],
        complete.breakerFragments[0],
      ],
    }).success).toBe(false);
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...complete,
      breakerFragments: [{
        ...complete.breakerFragments[0],
        line: 'EVEN',
      }],
    }).success).toBe(false);
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...preview,
      breakerFragments: [course.breakerFragments[0]],
    }).success).toBe(false);

    const scoped = projectCircuitRaceCourseForPlayer(
      course,
      atBreaker(raceState(course, 'live', [['alpha', 'bravo'], ['charlie', 'delta']])),
      'alpha',
    );
    const partnerScoped = projectCircuitRaceCourseForPlayer(
      course,
      atBreaker(raceState(course, 'live', [['alpha', 'bravo'], ['charlie', 'delta']])),
      'bravo',
    );
    const sequenceIndex = scoped.stages.findIndex((stage) => stage.mechanic === 'sequence-cipher');
    const scopedSequence = displayStage(scoped, 'sequence-cipher');
    const sourceSequence = sourceStage(course, 'sequence-cipher');
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...scoped,
      stages: scoped.stages.map((stage, index) => index === sequenceIndex ? {
        ...scopedSequence,
        challenge: {
          ...scopedSequence.challenge,
          cipherWheel: sourceSequence.challenge.cipherWheel,
        },
      } : stage),
    }).success).toBe(false);
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...scoped,
      stages: [
        scoped.stages[0],
        partnerScoped.stages[1],
        scoped.stages[2],
        scoped.stages[3],
      ],
    }).success).toBe(false);
    expect(circuitRaceDisplayCourseSchema.safeParse({
      ...scoped,
      breakerFragments: partnerScoped.breakerFragments,
    }).success).toBe(false);
  });

  it('validates the complete source course and its race-state binding before projection', () => {
    const course = compileCircuitRace(SEED, 'source-validation-course');
    const state = raceState(course, 'live', [
      ['alpha', 'bravo'],
      ['charlie', 'delta'],
    ]);
    const duplicateFragmentIdCourse = {
      ...course,
      breakerFragments: [
        course.breakerFragments[0],
        {
          ...course.breakerFragments[1],
          fragmentId: course.breakerFragments[0].fragmentId,
        },
      ],
    } as CompiledCircuitRace;
    const truncatedFragmentCourse = {
      ...course,
      breakerFragments: [course.breakerFragments[1]],
    } as unknown as CompiledCircuitRace;

    const remappedDuplicateIds = projectCircuitRaceCoursePreview(duplicateFragmentIdCourse);
    expect(JSON.stringify(remappedDuplicateIds)).not.toContain(course.breakerFragments[0].fragmentId);
    expect(() => projectCircuitRaceCoursePreview(truncatedFragmentCourse)).toThrow(/both breaker/i);
    expect(() => projectCircuitRaceCourseForPlayer(truncatedFragmentCourse, state, 'alpha')).toThrow(
      /both breaker/i,
    );
    expect(() => projectCircuitRaceCourseForPlayer(course, {
      ...state,
      stages: state.stages.map((stage, index) => index === 0 ? { ...stage, id: 'wrong-stage' } : stage),
    }, 'alpha')).toThrow(/stages/i);
    expect(() => projectCircuitRaceCourseForPlayer(course, state, 'outsider')).toThrow(/participant/i);
    expect(() => projectCircuitRaceCourseForPlayer(course, {
      ...state,
      teams: [
        { ...state.teams[0], memberNodeIds: ['alpha'] },
        state.teams[1],
      ],
    }, 'alpha')).toThrow(/symmetric/i);
  });
});
