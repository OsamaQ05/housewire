import { describe, expect, it } from 'vitest';

import {
  FIRST_LIGHT_CORRECT_SEAL_ID,
  FIRST_LIGHT_SEALS,
  FIRST_LIGHT_STEPS,
  firstLightGuideHint,
  isFirstLightSealCorrect,
  nextFirstLightStep,
} from '../src/domain/first-light';

describe('First Light teaching case', () => {
  it('has four ordered, individually hinted teaching steps', () => {
    expect(FIRST_LIGHT_STEPS.map((step) => step.id)).toEqual([
      'house-line',
      'private-seal',
      'carry-signal',
      'finale',
    ]);
    FIRST_LIGHT_STEPS.forEach((_, index) => {
      expect(firstLightGuideHint(index).length).toBeGreaterThan(20);
    });
  });

  it('accepts exactly one seal assembled from the three private clues', () => {
    const accepted = FIRST_LIGHT_SEALS.filter((seal) => isFirstLightSealCorrect(seal.id));
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.id).toBe(FIRST_LIGHT_CORRECT_SEAL_ID);
    expect(accepted[0]).toMatchObject({ color: 'BLUE', count: 3, shape: 'TRIANGLE' });
  });

  it('never advances outside the no-fail four-step route', () => {
    expect(nextFirstLightStep(-10)).toBe(1);
    expect(nextFirstLightStep(0)).toBe(1);
    expect(nextFirstLightStep(2)).toBe(3);
    expect(nextFirstLightStep(3)).toBe(3);
    expect(nextFirstLightStep(99)).toBe(3);
    expect(firstLightGuideHint(99)).toBe(FIRST_LIGHT_STEPS[3].hint);
  });
});
