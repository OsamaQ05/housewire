import { describe, expect, it } from 'vitest';
import { CUTOUT_PATHS, cutoutMatrix, projectedCutoutMatrix } from '../src/features/story-rooms/shadow-scene-geometry';
import { SHADOW_TARGETS, shadowProjection } from '../src/features/story-rooms/activities/shadow-play';

describe('native-safe shadow scene geometry', () => {
  it('keeps every legal house/roof/plant transform finite and numerically explicit', () => {
    for (let lamp = 0; lamp < 5; lamp++) for (let x = 0; x < 9; x++) for (let depth = 0; depth < 3; depth++) for (let turn = 0; turn < 4; turn++) {
      for (const target of SHADOW_TARGETS) {
        const piece = { x, depth, turn }, matrix = projectedCutoutMatrix(lamp, piece, target.y);
        const projection = shadowProjection(lamp, piece);
        expect(matrix).toHaveLength(6);
        expect(matrix.every(Number.isFinite)).toBe(true);
        expect(matrix.slice(4)).toEqual([projection.x, target.y]);
        expect(matrix[0] * matrix[3] - matrix[1] * matrix[2]).toBe(projection.scale ** 2);
      }
    }
  });
  it('uses quarter turns without floating-point drift and preserves the house doorway', () => {
    expect(cutoutMatrix(140, 159, 2, 0)).toEqual([2, 0, -0, 2, 140, 159]);
    expect(cutoutMatrix(140, 159, 2, 1)).toEqual([0, 2, -2, 0, 140, 159]);
    expect(CUTOUT_PATHS[1]).toContain('H 7 V -3 H -7 V 14');
    expect(CUTOUT_PATHS.every(path => !path.includes('NaN') && !path.includes('undefined'))).toBe(true);
  });
});
