import { assert, integer, property, subarray } from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compileMission } from '../src/domain/capability-compiler';
import { LINE_13 } from '../src/domain/line-13';
import type { Capability } from '../src/domain/types';
import { compileInput } from './fixtures';

describe('LINE 13 capability compiler', () => {
  it.each([2, 3, 4])('keeps one switchboard and an all-crew finale across %i phones', (count) => {
    const mission = compileMission(LINE_13, compileInput(count));
    expect(mission.stages.map((stage) => stage.id)).toEqual([
      'incoming-call',
      'split-cipher',
      'courier-transfer',
      'route-reconstruction',
      'synchronized-hangup',
    ]);
    expect(mission.stages[1].actions).toHaveLength(1);
    expect(mission.stages[3].actions).toHaveLength(1);
    expect(mission.stages[4].actions).toHaveLength(count);
    expect(new Set(mission.stages[4].actions.map((action) => action.deviceId))).toHaveLength(count);
  });

  it('preserves the full-warning and two-node handoff interactions without sensors', () => {
    const mission = compileMission(LINE_13, compileInput(2, ['manual']));
    expect(mission.stages[0].actions[0].selectedVariant.evidenceKind).toBe('MANUAL_HOLD');
    expect(mission.stages[1].actions.every((action) => action.selectedVariant.evidenceKind === 'WARNING_RECONSTRUCTED')).toBe(true);
    expect(mission.stages[2].actions.map((action) => action.selectedVariant.evidenceKind)).toEqual([
      'MANUAL_HOLD',
      'RECEIPT_RELEASED',
    ]);
    expect(mission.stages[3].actions.every((action) => action.selectedVariant.evidenceKind === 'ROUTE_RECONSTRUCTED')).toBe(true);
    expect(mission.stages[4].actions.every((action) => action.selectedVariant.evidenceKind === 'MANUAL_HOLD')).toBe(true);
  });

  it('never compiles an action without a manual fallback for arbitrary capability mixes', () => {
    const sensorCapabilities = [
      'motion',
      'orientation',
      'microphoneLevel',
      'cameraQr',
      'ambientLight',
      'haptics',
    ] as const satisfies readonly Capability[];

    assert(
      property(
        integer({ min: 2, max: 4 }),
        subarray([...sensorCapabilities]),
        (count, selected) => {
          const mission = compileMission(LINE_13, compileInput(count, ['manual', ...selected]));
          return mission.stages.every((stage) =>
            stage.actions.every(
              (action) =>
                action.manualFallback.capability === 'manual' &&
                action.manualFallback.evidenceKind ===
                  (action.requirementId === 'release-destination-receipt' ? 'RECEIPT_RELEASED' : 'MANUAL_HOLD'),
            ),
          );
        },
      ),
      { numRuns: 80 },
    );
  });
});
