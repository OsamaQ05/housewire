import { describe, expect, it } from 'vitest';

import { classifyRelativeLevel } from '../src/domain/acoustic-envelope';

describe('classifyRelativeLevel', () => {
  it('uses only relative loudness bands so different microphones can calibrate locally', () => {
    expect(classifyRelativeLevel(-54, -55)).toBe('REST');
    expect(classifyRelativeLevel(-46, -55)).toBe('SOFT');
    expect(classifyRelativeLevel(-35, -55)).toBe('STRONG');
  });

  it('keeps the category invariant when baseline and observation shift together', () => {
    expect(classifyRelativeLevel(-35, -50)).toBe(classifyRelativeLevel(-55, -70));
  });
});
