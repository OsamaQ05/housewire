import { describe, expect, it } from 'vitest';

import {
  evaluateForgePose,
  forgeVocalCueMatches,
  forgeVocalHoldMs,
} from '../src/features/forge/forge-sensor-evidence';

describe('generated case sensor evidence', () => {
  it('requires a stable, physically plausible posture for every verifiable pose', () => {
    expect(evaluateForgePose('PLACE_FLAT', { flatness: 0.93, steadiness: 0.9, tiltX: 0 })).toEqual({ matched: true, sensorVerifiable: true });
    expect(evaluateForgePose('HOLD_UPRIGHT', { flatness: 0.2, steadiness: 0.8, tiltX: 0 })).toEqual({ matched: true, sensorVerifiable: true });
    expect(evaluateForgePose('TILT_LEFT', { flatness: 0.5, steadiness: 0.8, tiltX: -0.5 })).toEqual({ matched: true, sensorVerifiable: true });
    expect(evaluateForgePose('TILT_RIGHT', { flatness: 0.5, steadiness: 0.8, tiltX: 0.5 })).toEqual({ matched: true, sensorVerifiable: true });
    expect(evaluateForgePose('HOLD_STILL', { flatness: 0.5, steadiness: 0.9, tiltX: 0 })).toEqual({ matched: true, sensorVerifiable: true });
  });

  it('rejects shaky or incorrectly directed readings', () => {
    expect(evaluateForgePose('PLACE_FLAT', { flatness: 0.95, steadiness: 0.4, tiltX: 0 }).matched).toBe(false);
    expect(evaluateForgePose('HOLD_UPRIGHT', { flatness: 0.8, steadiness: 0.9, tiltX: 0 }).matched).toBe(false);
    expect(evaluateForgePose('TILT_LEFT', { flatness: 0.5, steadiness: 0.9, tiltX: 0.5 }).matched).toBe(false);
    expect(evaluateForgePose('TILT_RIGHT', { flatness: 0.5, steadiness: 0.9, tiltX: -0.5 }).matched).toBe(false);
  });

  it('does not falsely claim that normalized motion proves screen-down orientation', () => {
    expect(evaluateForgePose('FACE_DOWN', { flatness: 1, steadiness: 1, tiltX: 0 })).toEqual({ matched: false, sensorVerifiable: false });
  });

  it('classifies vocal requirements using level and duration only', () => {
    expect(forgeVocalCueMatches('LOW_HUM', 'REST')).toBe(false);
    expect(forgeVocalCueMatches('LOW_HUM', 'SOFT')).toBe(true);
    expect(forgeVocalCueMatches('SHORT_TONE', 'STRONG')).toBe(true);
    expect(forgeVocalCueMatches('NONE', 'REST')).toBe(true);
    expect(forgeVocalHoldMs('LOW_HUM')).toBeGreaterThan(forgeVocalHoldMs('SHORT_TONE'));
    expect(forgeVocalHoldMs('NONE')).toBe(0);
  });
});
