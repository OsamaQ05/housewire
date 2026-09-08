import { describe, expect, it } from 'vitest';

import {
  CIRCUIT_RACE_STAGE_IDS,
  circuitRaceBreakerFragmentForSlot,
  circuitRaceHintPenaltyMs,
  compileCircuitRace,
  validateCircuitRaceStage,
  type CircuitBreakerFragment,
  type CircuitFlatPhoneStage,
  type CircuitKnock,
  type CircuitMotionMove,
  type CircuitRaceStage,
  type CircuitSequenceStage,
} from '../src/domain/circuit-race';

function stageByMechanic<M extends CircuitRaceStage['mechanic']>(
  course: ReturnType<typeof compileCircuitRace>,
  mechanic: M,
): Extract<CircuitRaceStage, { mechanic: M }> {
  const stage = course.stages.find((candidate) => candidate.mechanic === mechanic);
  if (!stage) throw new Error(`Fixture is missing ${mechanic}.`);
  return stage as Extract<CircuitRaceStage, { mechanic: M }>;
}

function solveSequence(stage: CircuitSequenceStage): string {
  const wheel = new Map(stage.challenge.cipherWheel.map((entry) => [entry.glyph, entry.digit]));
  return [...stage.challenge.panels]
    .sort((left, right) => left.pulseOrder - right.pulseOrder)
    .map((panel) => wheel.get(panel.glyph))
    .join('');
}

function heardPattern(durations: readonly number[]): CircuitKnock[] {
  return durations.map((duration) => duration < 320 ? 'SHORT' : 'LONG');
}

function assembleBreakerCode(fragments: readonly CircuitBreakerFragment[]): string {
  const slots = new Array<string>(4);
  for (const fragment of fragments) {
    fragment.positions.forEach((position, index) => {
      slots[position - 1] = String(fragment.digits[index]);
    });
  }
  return slots.join('');
}

function motionPoint(move: CircuitMotionMove): { pitchDegrees: number; rollDegrees: number } {
  switch (move) {
    case 'TILT_LEFT': return { pitchDegrees: 0, rollDegrees: -25 };
    case 'TILT_RIGHT': return { pitchDegrees: 0, rollDegrees: 25 };
    case 'TIP_FORWARD': return { pitchDegrees: -25, rollDegrees: 0 };
    case 'TIP_BACK': return { pitchDegrees: 25, rollDegrees: 0 };
  }
}

function validFlightSamples(stage: CircuitFlatPhoneStage) {
  let at = 20_000;
  const samples = [{ at, gravityZ: 0.94, pitchDegrees: 0, rollDegrees: 0 }];
  for (const move of stage.challenge.tiltSequence) {
    at += 120;
    samples.push({ at, gravityZ: 0.94, ...motionPoint(move) });
    at += 120;
    samples.push({ at, gravityZ: 0.94, pitchDegrees: 0, rollDegrees: 0 });
  }
  if (stage.challenge.requiredFace === 'FACE_DOWN') {
    at += 100;
    samples.push({ at, gravityZ: 0.18, pitchDegrees: 31, rollDegrees: 4 });
    at += 100;
    samples.push({ at, gravityZ: -0.51, pitchDegrees: 17, rollDegrees: -3 });
  }
  const gravityZ = stage.challenge.requiredFace === 'FACE_UP' ? 0.94 : -0.94;
  const step = Math.ceil(stage.challenge.holdMs / (stage.challenge.minimumSamples - 1));
  for (let index = 0; index < stage.challenge.minimumSamples; index += 1) {
    at += step;
    samples.push({ at, gravityZ, pitchDegrees: index % 2 ? 2.2 : -1.7, rollDegrees: index % 2 ? -2.1 : 1.3 });
  }
  return samples;
}

describe('Circuit Race compiler', () => {
  it('gives both teams byte-for-byte equal seeded content and difficulty', () => {
    const amber = compileCircuitRace(4_242, 'amber');
    const cyan = compileCircuitRace(4_242, 'cyan');
    const { teamId: amberTeam, ...amberContent } = amber;
    const { teamId: cyanTeam, ...cyanContent } = cyan;

    expect(amberTeam).toBe('amber');
    expect(cyanTeam).toBe('cyan');
    expect(cyanContent).toEqual(amberContent);
    expect(compileCircuitRace(4_243, 'amber').contentId).not.toBe(amber.contentId);
  });

  it('keeps parity across many seeds without leaking answer fields in stage challenge data', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const left = compileCircuitRace(seed, 'left-team');
      const right = compileCircuitRace(seed, 'right-team');
      expect(right.stages).toEqual(left.stages);
      expect(right.breakerFragments).toEqual(left.breakerFragments);
      for (const stage of left.stages) {
        expect(Object.hasOwn(stage.challenge, 'answer')).toBe(false);
        expect(Object.hasOwn(stage.challenge, 'solution')).toBe(false);
        expect(stage.proofId).toMatch(/^circuit-/);
      }
    }
  });

  it('compiles exactly four distinct, UI-ready mechanics and stable proof ids', () => {
    const course = compileCircuitRace(91, 'amber');
    expect(new Set(course.stages.map((stage) => stage.id))).toEqual(new Set(CIRCUIT_RACE_STAGE_IDS));
    expect(course.stages.at(-1)?.mechanic).toBe('breaker-code');
    expect(course.stages.map((stage) => stage.index)).toEqual([0, 1, 2, 3]);
    expect(new Set(course.stages.map((stage) => stage.proofId))).toHaveProperty('size', 4);
    for (const stage of course.stages) {
      expect(stage.title.length).toBeGreaterThan(3);
      expect(stage.instruction.length).toBeGreaterThan(20);
      expect(stage.estimatedSeconds).toBeGreaterThan(0);
      expect(stage.hints).toHaveLength(2);
      expect(stage.hints.every((hint) => hint.text.length <= 75)).toBe(true);
    }
  });

  it('uses all six deterministic opening routes while always regrouping for the finale', () => {
    const courses = Array.from({ length: 500 }, (_, seed) => compileCircuitRace(seed, 'amber'));
    const routes = new Set(courses.map((course) => course.stages.map((stage) => stage.id).join('|')));
    const templates = new Set(courses.map((course) => course.courseTemplateId));

    expect(routes.size).toBe(6);
    expect(templates.size).toBe(6);
    for (const course of courses) {
      expect(course.stages.at(-1)?.id).toBe('breaker-code');
      expect(new Set(course.stages.slice(0, 3).map((stage) => stage.id))).toEqual(
        new Set(['relay-order', 'knock-line', 'ground-plane']),
      );
    }
  });

  it('varies stage framing and riddle wording without changing the renderer contract', () => {
    const courses = Array.from({ length: 200 }, (_, seed) => compileCircuitRace(seed, 'amber'));
    const titlesByMechanic = (mechanic: CircuitRaceStage['mechanic']) => new Set(
      courses.map((course) => stageByMechanic(course, mechanic).title),
    );
    const keyClues = new Set(courses.flatMap((course) => {
      const stage = stageByMechanic(course, 'sequence-cipher');
      return stage.challenge.panels.filter((panel) => panel.glyph === 'KEY').map((panel) => panel.clue);
    }));

    expect(titlesByMechanic('sequence-cipher').size).toBe(3);
    expect(titlesByMechanic('knock-pattern').size).toBe(3);
    expect(titlesByMechanic('flat-phone').size).toBe(3);
    expect(titlesByMechanic('breaker-code').size).toBe(3);
    expect(keyClues.size).toBe(3);
  });

  it('resolves stage validation and hint scoring by id at every opening position', () => {
    const representatives = new Map<number, ReturnType<typeof compileCircuitRace>>();
    for (let seed = 0; seed < 500 && representatives.size < 3; seed += 1) {
      const course = compileCircuitRace(seed, 'amber');
      const stage = stageByMechanic(course, 'sequence-cipher');
      representatives.set(stage.index, course);
    }
    expect([...representatives.keys()].sort()).toEqual([0, 1, 2]);

    for (const course of representatives.values()) {
      const stage = stageByMechanic(course, 'sequence-cipher');
      expect(validateCircuitRaceStage(course, stage.id, {
        mechanic: stage.mechanic,
        code: solveSequence(stage),
      })).toMatchObject({ valid: true, proofId: stage.proofId });
      expect(circuitRaceHintPenaltyMs(course, stage.id, 1)).toBe(stage.hints[0].penaltyMs);
    }
  });

  it('rejects invalid compiler inputs', () => {
    expect(() => compileCircuitRace(1, 'not a relay id')).toThrow('relay-safe');
    expect(() => compileCircuitRace(Number.POSITIVE_INFINITY, 'amber')).toThrow('safe integer');
  });
});

describe('real stage validation', () => {
  it('validates the ordered glyph cipher and rejects a wrong sequence', () => {
    const course = compileCircuitRace(73, 'amber');
    const stage = stageByMechanic(course, 'sequence-cipher');
    const solution = solveSequence(stage);

    expect(validateCircuitRaceStage(course, 'relay-order', {
      mechanic: 'sequence-cipher',
      code: `${solution.slice(0, 2)}-${solution.slice(2)}`,
    })).toMatchObject({
      valid: true,
      reason: 'accepted',
      proofId: stage.proofId,
      totalPenaltyMs: 0,
    });
    expect(validateCircuitRaceStage(course, 'relay-order', {
      mechanic: 'sequence-cipher', code: solution.split('').reverse().join(''),
    })).toMatchObject({ valid: false, reason: 'wrong-answer' });
  });

  it('validates a heard knock rhythm in timed and accessible modes', () => {
    const course = compileCircuitRace(700, 'amber');
    const stage = stageByMechanic(course, 'knock-pattern');
    const pattern = heardPattern(stage.challenge.pulseDurationsMs);

    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern', mode: 'timed', pressDurationsMs: stage.challenge.pulseDurationsMs,
    })).toMatchObject({ valid: true, reason: 'accepted' });
    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern', mode: 'accessible', pattern,
    })).toMatchObject({ valid: true, reason: 'accepted' });
    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern',
      mode: 'accessible',
      pattern: [pattern[0] === 'SHORT' ? 'LONG' : 'SHORT', ...pattern.slice(1)],
    })).toMatchObject({ valid: false, reason: 'wrong-answer' });
    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern', mode: 'timed', pressDurationsMs: [30, 30],
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
  });

  it('treats natural taps and holds by duration class, including a 900ms hold', () => {
    const course = compileCircuitRace(700, 'amber');
    const stage = stageByMechanic(course, 'knock-pattern');
    const pattern = heardPattern(stage.challenge.pulseDurationsMs);
    const naturalPerformance = pattern.map((knock) => knock === 'SHORT' ? 120 : 900);

    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern', mode: 'timed', pressDurationsMs: naturalPerformance,
    })).toMatchObject({ valid: true, reason: 'accepted' });
    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern', mode: 'timed', pressDurationsMs: naturalPerformance.map((value, index) => index === 0 ? 30 : value),
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
    expect(validateCircuitRaceStage(course, 'knock-line', {
      mechanic: 'knock-pattern', mode: 'timed', pressDurationsMs: naturalPerformance.map((value, index) => index === 0 ? 2_001 : value),
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
  });

  it('validates a called three-move flight plus stable landing without trusting one sample', () => {
    const course = compileCircuitRace(808, 'amber');
    const stage = stageByMechanic(course, 'flat-phone');
    const samples = validFlightSamples(stage);

    expect(validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone', mode: 'sensor', samples,
    })).toMatchObject({ valid: true, inputPenaltyMs: 0 });
    expect(validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone',
      mode: 'sensor',
      samples: samples.map((sample, index) => index === samples.length - 2 ? { ...sample, pitchDegrees: 30 } : sample),
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
    expect(validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone', mode: 'sensor', samples: samples.slice(0, 1),
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
  });

  it('accepts a realistic face-up route followed by a face-down flip and stable landing', () => {
    const course = Array.from({ length: 100 }, (_, seed) => compileCircuitRace(seed, 'amber'))
      .find((candidate) => stageByMechanic(candidate, 'flat-phone').challenge.requiredFace === 'FACE_DOWN');
    expect(course).toBeDefined();
    const stage = stageByMechanic(course!, 'flat-phone');
    const samples = validFlightSamples(stage);
    expect(samples.some((sample) => sample.gravityZ > 0.72)).toBe(true);
    expect(samples.some((sample) => Math.abs(sample.pitchDegrees) > stage.challenge.maxTiltDegrees)).toBe(true);
    expect(validateCircuitRaceStage(course!, 'ground-plane', {
      mechanic: 'flat-phone', mode: 'sensor', samples,
    })).toMatchObject({ valid: true, reason: 'accepted' });
  });

  it('provides a functional manual hold fallback with a transparent time penalty', () => {
    const course = compileCircuitRace(18, 'amber');
    const stage = stageByMechanic(course, 'flat-phone');
    const accepted = validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone', mode: 'manual-hold', heldMs: stage.challenge.fallback.minimumHoldMs, signalSequence: stage.challenge.tiltSequence,
    });
    expect(accepted).toMatchObject({
      valid: true,
      reason: 'accepted',
      inputPenaltyMs: stage.challenge.fallback.penaltyMs,
      totalPenaltyMs: stage.challenge.fallback.penaltyMs,
    });
    expect(validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone', mode: 'manual-hold', heldMs: stage.challenge.fallback.minimumHoldMs - 1, signalSequence: stage.challenge.tiltSequence,
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
    expect(validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone',
      mode: 'manual-hold',
      heldMs: stage.challenge.fallback.minimumHoldMs,
      signalSequence: [...stage.challenge.tiltSequence].reverse(),
    })).toMatchObject({ valid: false, reason: 'insufficient-evidence' });
  });

  it('accepts an injected physical validator without weakening the default contract', () => {
    const course = compileCircuitRace(33, 'amber');
    const result = validateCircuitRaceStage(course, 'ground-plane', {
      mechanic: 'flat-phone', mode: 'sensor', samples: [],
    }, {
      adapters: {
        flatPhone: {
          validateFallback: () => false,
          validateSensor: (_challenge, evidence) => evidence.samples.length === 0,
        },
      },
    });
    expect(result).toMatchObject({ valid: true, reason: 'accepted' });
  });

  it('requires both private breaker fragments to derive the final code', () => {
    const course = compileCircuitRace(1_337, 'amber');
    const odd = circuitRaceBreakerFragmentForSlot(course, 0);
    const even = circuitRaceBreakerFragmentForSlot(course, 1);
    expect(odd).toMatchObject({ line: 'ODD', positions: [1, 3], ownerSlot: 0 });
    expect(even).toMatchObject({ line: 'EVEN', positions: [2, 4], ownerSlot: 1 });
    const code = assembleBreakerCode([odd, even]);

    expect(validateCircuitRaceStage(course, 'breaker-code', {
      mechanic: 'breaker-code', code,
    })).toMatchObject({ valid: true, reason: 'accepted' });
    expect(validateCircuitRaceStage(course, 'breaker-code', {
      mechanic: 'breaker-code', code: `${code.slice(1)}${code[0]}`,
    })).toMatchObject({ valid: false, reason: 'wrong-answer' });
  });

  it('rejects evidence intended for a different mechanic', () => {
    const course = compileCircuitRace(5, 'amber');
    expect(validateCircuitRaceStage(course, 'relay-order', {
      mechanic: 'breaker-code', code: '1234',
    })).toMatchObject({ valid: false, reason: 'wrong-input' });
  });
});

describe('hint penalties', () => {
  it('adds revealed hints once and clamps the count to available hints', () => {
    const course = compileCircuitRace(99, 'amber');
    const stage = stageByMechanic(course, 'sequence-cipher');
    expect(circuitRaceHintPenaltyMs(course, 'relay-order', 0)).toBe(0);
    expect(circuitRaceHintPenaltyMs(course, 'relay-order', 1)).toBe(stage.hints[0].penaltyMs);
    expect(circuitRaceHintPenaltyMs(course, 'relay-order', 99)).toBe(
      stage.hints[0].penaltyMs + stage.hints[1].penaltyMs,
    );

    const solution = solveSequence(stage);
    expect(validateCircuitRaceStage(course, 'relay-order', {
      mechanic: 'sequence-cipher', code: solution,
    }, { revealedHintCount: 2 })).toMatchObject({
      valid: true,
      hintPenaltyMs: stage.hints[0].penaltyMs + stage.hints[1].penaltyMs,
      totalPenaltyMs: stage.hints[0].penaltyMs + stage.hints[1].penaltyMs,
    });
  });
});
