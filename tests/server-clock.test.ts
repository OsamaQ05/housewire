import { describe, expect, it } from 'vitest';

import {
  advanceServerClockAnchor,
  estimateServerNow,
  isServerTimestampFresh,
} from '../src/features/session/server-clock';

describe('relay-clock liveness', () => {
  it('extrapolates relay time without trusting either phone wall clock', () => {
    const anchor = advanceServerClockAnchor(undefined, 500_000, 9_000_000);
    expect(estimateServerNow(anchor, 9_005_000)).toBe(505_000);
    expect(isServerTimestampFresh(490_000, 505_000, 24_000)).toBe(true);
    expect(isServerTimestampFresh(480_000, 505_000, 24_000)).toBe(false);
  });

  it('prefers a measured clock offset and never regresses its server anchor', () => {
    const current = { serverTime: 500_000, receivedAt: 9_000_000 };
    expect(advanceServerClockAnchor(current, 499_000, 9_001_000)).toBe(current);
    expect(estimateServerNow(current, 100_000, 400_025)).toBe(500_025);
  });
});
