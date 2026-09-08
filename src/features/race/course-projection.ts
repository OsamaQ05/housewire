import { z } from 'zod';

import {
  CIRCUIT_RACE_STAGE_IDS,
  CIRCUIT_RACE_VERSION,
  type CircuitBreakerFragment,
  type CircuitRaceStage,
  type CompiledCircuitRace,
} from '../../domain/circuit-race';
import type { TeamEscapeRaceState } from '../../domain/team-escape-race';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const safeIdSchema = z.string().regex(SAFE_ID, 'Use a relay-safe identifier.');
const displayTextSchema = z
  .string()
  .min(1)
  .max(1_000)
  .refine((value) => value.trim().length > 0, 'Display text cannot be blank.');
const digitSchema = z.number().int().min(0).max(9);
const glyphSchema = z.enum(['ARC', 'BELL', 'COIL', 'DOOR', 'EYE', 'FORK', 'KEY', 'WAVE']);
const openingStageIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const circuitRaceDisplayHintSchema = z
  .object({
    id: safeIdSchema,
    penaltyMs: z.number().int().min(0).max(600_000),
    text: displayTextSchema,
  })
  .strict();

const stageBaseShape = {
  difficulty: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  estimatedSeconds: z.number().int().min(1).max(3_600),
  hints: z
    .array(circuitRaceDisplayHintSchema)
    .min(1)
    .max(8)
    .refine((hints) => unique(hints.map((hint) => hint.id)), 'Hint ids must be unique.'),
  instruction: displayTextSchema,
  kicker: displayTextSchema,
  title: displayTextSchema,
};

const cipherWheelSchema = z
  .array(z
    .object({
      digit: digitSchema,
      glyph: glyphSchema,
    })
    .strict())
  .length(6)
  .superRefine((wheel, context) => {
    if (!unique(wheel.map((entry) => entry.glyph))) {
      context.addIssue({ code: 'custom', message: 'Cipher-wheel glyphs must be unique.' });
    }
    if (!unique(wheel.map((entry) => entry.digit))) {
      context.addIssue({ code: 'custom', message: 'Cipher-wheel digits must be unique.' });
    }
  });

const sequencePanelsSchema = z
  .array(z
    .object({
      clue: displayTextSchema,
      glyph: glyphSchema,
      panelId: safeIdSchema,
      pulseOrder: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    })
    .strict())
  .length(4)
  .superRefine((panels, context) => {
    if (!unique(panels.map((panel) => panel.panelId))) {
      context.addIssue({ code: 'custom', message: 'Sequence panel ids must be unique.' });
    }
    if (!unique(panels.map((panel) => panel.glyph))) {
      context.addIssue({ code: 'custom', message: 'Sequence panel glyphs must be unique.' });
    }
    if (!unique(panels.map((panel) => panel.pulseOrder))) {
      context.addIssue({ code: 'custom', message: 'Sequence pulse orders must be unique.' });
    }
  });

const sequenceFullChallengeSchema = z
  .object({
    answerLength: z.literal(4),
    cipherWheel: cipherWheelSchema,
    panels: sequencePanelsSchema,
    readingRule: z.literal('LOWEST_PULSE_FIRST'),
    station: z.literal('FULL'),
  })
  .strict()
  .superRefine((challenge, context) => {
    const wheelGlyphs = new Set(challenge.cipherWheel.map((entry) => entry.glyph));
    if (challenge.panels.some((panel) => !wheelGlyphs.has(panel.glyph))) {
      context.addIssue({
        code: 'custom',
        message: 'Every sequence panel glyph must appear on the cipher wheel.',
        path: ['panels'],
      });
    }
  });

const sequenceChallengeSchema = z.discriminatedUnion('station', [
  sequenceFullChallengeSchema,
  z
    .object({
      panels: sequencePanelsSchema,
      readingRule: z.literal('LOWEST_PULSE_FIRST'),
      station: z.literal('PLATES'),
    })
    .strict(),
  z
    .object({
      answerLength: z.literal(4),
      cipherWheel: cipherWheelSchema,
      station: z.literal('WHEEL'),
    })
    .strict(),
]);

const circuitSequenceDisplayStageSchema = z
  .object({
    ...stageBaseShape,
    challenge: sequenceChallengeSchema,
    id: z.literal('relay-order'),
    index: openingStageIndexSchema,
    mechanic: z.literal('sequence-cipher'),
  })
  .strict();

const accessibleChoicesSchema = z.tuple([z.literal('SHORT'), z.literal('LONG')]);
const knockDurationsSchema = z.array(z.number().int().min(1).max(10_000)).length(5);
const knockReferenceShape = {
  accessibleChoices: accessibleChoicesSchema,
  longReferenceMs: z.number().int().min(1).max(10_000),
  shortReferenceMs: z.number().int().min(1).max(10_000),
  timingToleranceMs: z.number().int().min(0).max(10_000),
};

const knockFullChallengeSchema = z
  .object({
    ...knockReferenceShape,
    pulseDurationsMs: knockDurationsSchema,
    replayLimit: z.number().int().min(0).max(10),
    station: z.literal('FULL'),
  })
  .strict()
  .superRefine((challenge, context) => {
    if (challenge.shortReferenceMs >= challenge.longReferenceMs) {
      context.addIssue({
        code: 'custom',
        message: 'The short knock reference must be shorter than the long reference.',
        path: ['shortReferenceMs'],
      });
    }
    if (challenge.pulseDurationsMs.some((duration) =>
      Math.min(
        Math.abs(duration - challenge.shortReferenceMs),
        Math.abs(duration - challenge.longReferenceMs),
      ) > challenge.timingToleranceMs
    )) {
      context.addIssue({
        code: 'custom',
        message: 'Every knock must be classifiable within the timing tolerance.',
        path: ['pulseDurationsMs'],
      });
    }
  });

const knockConsoleChallengeSchema = z
  .object({
    ...knockReferenceShape,
    station: z.literal('CONSOLE'),
  })
  .strict()
  .superRefine((challenge, context) => {
    if (challenge.shortReferenceMs >= challenge.longReferenceMs) {
      context.addIssue({
        code: 'custom',
        message: 'The short knock reference must be shorter than the long reference.',
        path: ['shortReferenceMs'],
      });
    }
  });

const knockChallengeSchema = z.discriminatedUnion('station', [
  knockFullChallengeSchema,
  z
    .object({
      pulseDurationsMs: knockDurationsSchema,
      replayLimit: z.number().int().min(0).max(10),
      station: z.literal('PLAYBACK'),
    })
    .strict(),
  knockConsoleChallengeSchema,
]);

const circuitKnockDisplayStageSchema = z
  .object({
    ...stageBaseShape,
    challenge: knockChallengeSchema,
    id: z.literal('knock-line'),
    index: openingStageIndexSchema,
    mechanic: z.literal('knock-pattern'),
  })
  .strict();

const flatFallbackSchema = z
  .object({
    instruction: displayTextSchema,
    minimumHoldMs: z.number().int().min(1).max(120_000),
    penaltyMs: z.number().int().min(0).max(600_000),
  })
  .strict();
const flatActionShape = {
  fallback: flatFallbackSchema,
  holdMs: z.number().int().min(1).max(120_000),
  maxTiltDegrees: z.number().finite().min(0).max(90),
  minimumSamples: z.number().int().min(2).max(10_000),
  moveCount: z.literal(3),
};
const tiltSequenceSchema = z.tuple([
  z.enum(['TILT_LEFT', 'TILT_RIGHT', 'TIP_FORWARD', 'TIP_BACK']),
  z.enum(['TILT_LEFT', 'TILT_RIGHT', 'TIP_FORWARD', 'TIP_BACK']),
  z.enum(['TILT_LEFT', 'TILT_RIGHT', 'TIP_FORWARD', 'TIP_BACK']),
]);
const flatPhoneChallengeSchema = z.discriminatedUnion('station', [
  z
    .object({
      ...flatActionShape,
      requiredFace: z.enum(['FACE_UP', 'FACE_DOWN']),
      station: z.literal('FULL'),
      tiltSequence: tiltSequenceSchema,
    })
    .strict(),
  z
    .object({
      requiredFace: z.enum(['FACE_UP', 'FACE_DOWN']),
      station: z.literal('ORIENTATION'),
      tiltSequence: tiltSequenceSchema,
    })
    .strict(),
  z
    .object({
      ...flatActionShape,
      requiredFace: z.null(),
      station: z.literal('GROUND'),
      tiltSequence: z.null(),
    })
    .strict(),
]);

const circuitFlatPhoneDisplayStageSchema = z
  .object({
    ...stageBaseShape,
    challenge: flatPhoneChallengeSchema,
    id: z.literal('ground-plane'),
    index: openingStageIndexSchema,
    mechanic: z.literal('flat-phone'),
  })
  .strict();

const breakerSlotSchemas = [
  z.object({ line: z.literal('ODD'), position: z.literal(1) }).strict(),
  z.object({ line: z.literal('EVEN'), position: z.literal(2) }).strict(),
  z.object({ line: z.literal('ODD'), position: z.literal(3) }).strict(),
  z.object({ line: z.literal('EVEN'), position: z.literal(4) }).strict(),
] as const;

const breakerChallengeShape = {
  codeLength: z.literal(4),
  slots: z.tuple(breakerSlotSchemas),
};

const breakerChallengeSchema = z.discriminatedUnion('station', [
  z.object({ ...breakerChallengeShape, station: z.literal('FULL') }).strict(),
  z.object({ ...breakerChallengeShape, station: z.literal('ODD') }).strict(),
  z.object({ ...breakerChallengeShape, station: z.literal('EVEN') }).strict(),
]);

const circuitBreakerDisplayStageSchema = z
  .object({
    ...stageBaseShape,
    challenge: breakerChallengeSchema,
    id: z.literal('breaker-code'),
    index: z.literal(3),
    mechanic: z.literal('breaker-code'),
  })
  .strict();

export const circuitRaceDisplayStageSchema = z.discriminatedUnion('mechanic', [
  circuitSequenceDisplayStageSchema,
  circuitKnockDisplayStageSchema,
  circuitFlatPhoneDisplayStageSchema,
  circuitBreakerDisplayStageSchema,
]);

export const circuitRaceDisplayBreakerFragmentSchema = z
  .object({
    digits: z.tuple([digitSchema, digitSchema]),
    fragmentId: safeIdSchema,
    line: z.enum(['ODD', 'EVEN']),
    ownerSlot: z.union([z.literal(0), z.literal(1)]),
    positions: z.tuple([
      z.union([z.literal(1), z.literal(2)]),
      z.union([z.literal(3), z.literal(4)]),
    ]),
    revealAfterStageIndex: z.literal(2),
  })
  .strict()
  .superRefine((fragment, context) => {
    const expected = fragment.ownerSlot === 0
      ? { line: 'ODD' as const, positions: [1, 3] as const }
      : { line: 'EVEN' as const, positions: [2, 4] as const };
    if (fragment.line !== expected.line) {
      context.addIssue({
        code: 'custom',
        message: 'Breaker line must match its owner slot.',
        path: ['line'],
      });
    }
    if (
      fragment.positions[0] !== expected.positions[0] ||
      fragment.positions[1] !== expected.positions[1]
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Breaker positions must match the fragment line.',
        path: ['positions'],
      });
    }
  });

const breakerFragmentsSchema = z
  .array(circuitRaceDisplayBreakerFragmentSchema)
  .max(2)
  .superRefine((fragments, context) => {
    if (!unique(fragments.map((fragment) => fragment.fragmentId))) {
      context.addIssue({
        code: 'custom',
        message: 'Breaker fragment ids must be unique.',
      });
    }
    if (!unique(fragments.map((fragment) => fragment.ownerSlot))) {
      context.addIssue({
        code: 'custom',
        message: 'Breaker owner slots must be unique.',
      });
    }
    if (!unique(fragments.map((fragment) => fragment.line))) {
      context.addIssue({
        code: 'custom',
        message: 'Breaker lines must be unique.',
      });
    }
    if (!unique(fragments.flatMap((fragment) => fragment.positions))) {
      context.addIssue({
        code: 'custom',
        message: 'Breaker positions must be unique.',
      });
    }
    if (
      fragments.length === 2 &&
      (fragments[0].ownerSlot !== 0 || fragments[1].ownerSlot !== 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A complete breaker projection must keep owner-slot order.',
      });
    }
  });

export const circuitRaceDisplayCourseSchema = z
  .object({
    breakerFragments: breakerFragmentsSchema,
    stages: z.array(circuitRaceDisplayStageSchema).length(4),
    theme: z
      .object({
        premise: displayTextSchema,
        title: z.literal('THE LAST CIRCUIT'),
        visualMotif: z.literal('ceramic fuseboard and live copper traces'),
      })
      .strict(),
    version: z.literal(CIRCUIT_RACE_VERSION),
  })
  .strict()
  .superRefine((course, context) => {
    const stageIds = course.stages.map((stage) => stage.id);
    if (
      !unique(stageIds) ||
      !CIRCUIT_RACE_STAGE_IDS.every((stageId) => stageIds.includes(stageId))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Circuit Race must contain each mechanic exactly once.',
        path: ['stages'],
      });
    }
    if (!course.stages.every((stage, index) => stage.index === index)) {
      context.addIssue({
        code: 'custom',
        message: 'Circuit Race stage indexes must match their course position.',
        path: ['stages'],
      });
    }
    if (course.stages.at(-1)?.id !== 'breaker-code') {
      context.addIssue({
        code: 'custom',
        message: 'Circuit Race must regroup at the breaker finale.',
        path: ['stages', 3],
      });
    }
    const stations = course.stages.map((stage) => stage.challenge.station);
    const fullCourse = stations.every((station) => station === 'FULL');
    const slotZeroCourse = course.stages.every((stage) =>
      stage.challenge.station === stationForMechanic(stage.mechanic, 0)
    );
    const slotOneCourse = course.stages.every((stage) =>
      stage.challenge.station === stationForMechanic(stage.mechanic, 1)
    );

    if (!fullCourse && !slotZeroCourse && !slotOneCourse) {
      context.addIssue({
        code: 'custom',
        message: 'Circuit Race stations must form one complete, slot-zero, or slot-one course.',
        path: ['stages'],
      });
      return;
    }
    if (fullCourse && course.breakerFragments.length !== 0 && course.breakerFragments.length !== 2) {
      context.addIssue({
        code: 'custom',
        message: 'A full course must hide both breaker fragments or include both.',
        path: ['breakerFragments'],
      });
    }
    if (
      slotZeroCourse &&
      course.breakerFragments.length !== 0 &&
      (course.breakerFragments.length !== 1 || course.breakerFragments[0]?.ownerSlot !== 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Slot-zero stations may reveal only the slot-zero breaker fragment.',
        path: ['breakerFragments'],
      });
    }
    if (
      slotOneCourse &&
      course.breakerFragments.length !== 0 &&
      (course.breakerFragments.length !== 1 || course.breakerFragments[0]?.ownerSlot !== 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Slot-one stations may reveal only the slot-one breaker fragment.',
        path: ['breakerFragments'],
      });
    }
  });

export type CircuitRaceDisplayBreakerFragment = z.infer<
  typeof circuitRaceDisplayBreakerFragmentSchema
>;
export type CircuitRaceDisplayStage = z.infer<typeof circuitRaceDisplayStageSchema>;
export type CircuitRaceDisplayCourse = z.infer<typeof circuitRaceDisplayCourseSchema>;

/**
 * Projects the course for one participant. Practice and one-player live teams
 * receive both breaker strips; a two-player live team receives one strip per
 * stable member slot.
 */
export function projectCircuitRaceCourseForPlayer(
  fullCourse: CompiledCircuitRace,
  state: TeamEscapeRaceState,
  recipientNodeId: string,
): CircuitRaceDisplayCourse {
  const completeCourse = projectAndValidateCompleteCourse(fullCourse);
  assertCourseMatchesState(fullCourse, state);
  safeIdSchema.parse(recipientNodeId);

  if (!state.participants.some((participant) => participant.nodeId === recipientNodeId)) {
    throw new Error('Circuit Race projection recipient is not a race participant.');
  }
  const recipientTeams = state.teams.filter((team) => team.memberNodeIds.includes(recipientNodeId));
  if (recipientTeams.length !== 1) {
    throw new Error('Circuit Race projection recipient must belong to exactly one team.');
  }
  const recipientTeam = recipientTeams[0];
  const revealBreaker = recipientTeam.stageIndex > fullCourse.breakerFragments[0].revealAfterStageIndex;
  if (state.mode === 'practice' || recipientTeam.memberNodeIds.length === 1) {
    return circuitRaceDisplayCourseSchema.parse({
      ...completeCourse,
      breakerFragments: revealBreaker ? completeCourse.breakerFragments : [],
    });
  }
  if (state.mode !== 'live' || recipientTeam.memberNodeIds.length !== 2) {
    throw new Error('Live Circuit Race teams must contain one or two players.');
  }

  const recipientSlot = recipientTeam.memberNodeIds.indexOf(recipientNodeId);
  if (recipientSlot !== 0 && recipientSlot !== 1) {
    throw new Error('Circuit Race recipient does not have a valid team slot.');
  }
  const recipientFragment = completeCourse.breakerFragments.find(
    (fragment) => fragment.ownerSlot === recipientSlot,
  );
  if (!recipientFragment) {
    throw new Error('Circuit Race course is missing the recipient breaker fragment.');
  }
  return circuitRaceDisplayCourseSchema.parse({
    ...completeCourse,
    breakerFragments: revealBreaker ? [recipientFragment] : [],
    stages: fullCourse.stages.map((stage) => projectStage(stage, recipientSlot)),
  });
}

/** Projects public course instructions without revealing either breaker strip. */
export function projectCircuitRaceCoursePreview(
  fullCourse: CompiledCircuitRace,
): CircuitRaceDisplayCourse {
  const completeCourse = projectAndValidateCompleteCourse(fullCourse);
  return circuitRaceDisplayCourseSchema.parse({
    ...completeCourse,
    breakerFragments: [],
  });
}

function projectAndValidateCompleteCourse(fullCourse: CompiledCircuitRace): CircuitRaceDisplayCourse {
  if (fullCourse.breakerFragments.length !== 2) {
    throw new Error('A complete Circuit Race course must contain both breaker fragments.');
  }
  return circuitRaceDisplayCourseSchema.parse({
    breakerFragments: fullCourse.breakerFragments.map(projectBreakerFragment),
    stages: fullCourse.stages.map((stage) => projectStage(stage, 'FULL')),
    theme: {
      premise: fullCourse.theme.premise,
      title: fullCourse.theme.title,
      visualMotif: fullCourse.theme.visualMotif,
    },
    version: fullCourse.version,
  });
}

function projectStage(stage: CircuitRaceStage, station: 'FULL' | 0 | 1): unknown {
  const base = {
    difficulty: stage.difficulty,
    estimatedSeconds: stage.estimatedSeconds,
    hints: stage.hints.map((hint) => ({
      id: hint.id,
      penaltyMs: hint.penaltyMs,
      text: hint.text,
    })),
    id: stage.id,
    index: stage.index,
    instruction: stage.instruction,
    kicker: stage.kicker,
    mechanic: stage.mechanic,
    title: stage.title,
  };

  if (stage.mechanic === 'sequence-cipher') {
    const cipherWheel = stage.challenge.cipherWheel.map((entry) => ({
      digit: entry.digit,
      glyph: entry.glyph,
    }));
    const panels = stage.challenge.panels.map((panel, index) => ({
      clue: panel.clue,
      glyph: panel.glyph,
      panelId: `relay-plate-${index + 1}`,
      pulseOrder: panel.pulseOrder,
    }));
    return {
      ...base,
      challenge: station === 'FULL'
        ? {
            answerLength: stage.challenge.answerLength,
            cipherWheel,
            panels,
            readingRule: stage.challenge.readingRule,
            station,
          }
        : station === 0
          ? {
              panels,
              readingRule: stage.challenge.readingRule,
              station: 'PLATES',
            }
          : {
              answerLength: stage.challenge.answerLength,
              cipherWheel,
              station: 'WHEEL',
            },
    };
  }
  if (stage.mechanic === 'knock-pattern') {
    return {
      ...base,
      challenge: station === 'FULL'
        ? {
            accessibleChoices: [...stage.challenge.accessibleChoices],
            longReferenceMs: stage.challenge.longReferenceMs,
            pulseDurationsMs: [...stage.challenge.pulseDurationsMs],
            replayLimit: stage.challenge.replayLimit,
            shortReferenceMs: stage.challenge.shortReferenceMs,
            station,
            timingToleranceMs: stage.challenge.timingToleranceMs,
          }
        : station === 0
          ? {
              pulseDurationsMs: [...stage.challenge.pulseDurationsMs],
              replayLimit: stage.challenge.replayLimit,
              station: 'PLAYBACK',
            }
          : {
              accessibleChoices: [...stage.challenge.accessibleChoices],
              longReferenceMs: stage.challenge.longReferenceMs,
              shortReferenceMs: stage.challenge.shortReferenceMs,
              station: 'CONSOLE',
              timingToleranceMs: stage.challenge.timingToleranceMs,
            },
    };
  }
  if (stage.mechanic === 'flat-phone') {
    if (station === 0) {
      return {
        ...base,
        hints: stage.hints.map((hint, index) => ({
          id: hint.id,
          penaltyMs: hint.penaltyMs,
          text: index === 0
            ? 'Call the three symbols in order; your partner controls the signal board.'
            : 'After the symbols, tell your partner to hold the seal.',
        })),
        instruction: 'Call the three private symbols in order. Do not show your teammate this screen.',
        challenge: {
          requiredFace: stage.challenge.requiredFace,
          station: 'ORIENTATION',
          tiltSequence: [...stage.challenge.tiltSequence],
        },
      };
    }
    const action = {
      fallback: {
        instruction: stage.challenge.fallback.instruction,
        minimumHoldMs: stage.challenge.fallback.minimumHoldMs,
        penaltyMs: stage.challenge.fallback.penaltyMs,
      },
      holdMs: stage.challenge.holdMs,
      maxTiltDegrees: stage.challenge.maxTiltDegrees,
      minimumSamples: stage.challenge.minimumSamples,
      moveCount: stage.challenge.moveCount,
    };
    if (station === 1) {
      return {
        ...base,
        hints: stage.hints.map((hint, index) => ({
          id: hint.id,
          penaltyMs: hint.penaltyMs,
          text: index === 0
            ? hint.text
            : 'After all three symbols, keep one finger on the seal until it locks.',
        })),
        instruction: 'Enter the three symbols your partner calls, then hold the contact seal.',
        challenge: {
          ...action,
          requiredFace: null,
          station: 'GROUND',
          tiltSequence: null,
        },
      };
    }
    return {
      ...base,
      challenge: {
        ...action,
        requiredFace: stage.challenge.requiredFace,
        station,
        tiltSequence: [...stage.challenge.tiltSequence],
      },
    };
  }
  return {
    ...base,
    challenge: {
      codeLength: stage.challenge.codeLength,
      station: station === 'FULL' ? station : station === 0 ? 'ODD' : 'EVEN',
      slots: stage.challenge.slots.map((slot) => ({
        line: slot.line,
        position: slot.position,
      })),
    },
  };
}

function projectBreakerFragment(fragment: CircuitBreakerFragment): CircuitRaceDisplayBreakerFragment {
  return circuitRaceDisplayBreakerFragmentSchema.parse({
    digits: [...fragment.digits],
    fragmentId: fragment.ownerSlot === 0 ? 'breaker-strip-odd' : 'breaker-strip-even',
    line: fragment.line,
    ownerSlot: fragment.ownerSlot,
    positions: [...fragment.positions],
    revealAfterStageIndex: fragment.revealAfterStageIndex,
  });
}

function assertCourseMatchesState(
  fullCourse: CompiledCircuitRace,
  state: TeamEscapeRaceState,
): void {
  if (state.mode !== 'live' && state.mode !== 'practice') {
    throw new Error('Circuit Race state has an unsupported mode.');
  }
  if (state.stages.length !== CIRCUIT_RACE_STAGE_IDS.length) {
    throw new Error('Circuit Race state must contain all four stages.');
  }
  if (state.mode === 'live') {
    const teamSizes = state.teams.map((team) => team.memberNodeIds.length);
    const validLiveRosters = state.teams.length === 2 && (
      teamSizes.every((size) => size === 1) || teamSizes.every((size) => size === 2)
    );
    if (!validLiveRosters) {
      throw new Error('Live Circuit Race requires symmetric 1v1 or 2v2 rosters.');
    }
  }
  fullCourse.stages.forEach((_, index) => {
    const stateStage = state.stages[index];
    if (
      stateStage?.id !== fullCourse.stages[index]?.id ||
      stateStage?.proofIds.length !== 1
    ) {
      throw new Error('Circuit Race state stages do not match the compiled course.');
    }
  });
}

function stationForMechanic(
  mechanic: CircuitRaceStage['mechanic'],
  slot: 0 | 1,
): 'PLATES' | 'WHEEL' | 'PLAYBACK' | 'CONSOLE' | 'ORIENTATION' | 'GROUND' | 'ODD' | 'EVEN' {
  if (mechanic === 'sequence-cipher') return slot === 0 ? 'PLATES' : 'WHEEL';
  if (mechanic === 'knock-pattern') return slot === 0 ? 'PLAYBACK' : 'CONSOLE';
  if (mechanic === 'flat-phone') return slot === 0 ? 'ORIENTATION' : 'GROUND';
  return slot === 0 ? 'ODD' : 'EVEN';
}
