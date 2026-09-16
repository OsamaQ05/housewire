import { shadowProjection, type ShadowPiece } from './activities/shadow-play';

/** Numeric SVG matrices avoid different native/web transform-string parsers. */
export function cutoutMatrix(x: number, y: number, scale: number, turn: number): [number, number, number, number, number, number] {
  const quarter = ((turn % 4) + 4) % 4;
  const cos = [1, 0, -1, 0][quarter], sin = [0, 1, 0, -1][quarter];
  return [cos * scale, sin * scale, -sin * scale, cos * scale, x, y];
}

export function projectedCutoutMatrix(lamp: number, piece: ShadowPiece, y: number) {
  const projection = shadowProjection(lamp, piece);
  return cutoutMatrix(projection.x, y, projection.scale, projection.turn);
}

export const CUTOUT_PATHS = [
  'M -25 12 L 0 -14 L 25 12 Z',
  'M -23 -14 H 23 V 14 H 7 V -3 H -7 V 14 H -23 Z',
  'M -12 14 H 12 L 9 25 H -9 Z M 0 14 V -9 M 0 4 Q -18 4 -15 -11 Q -1 -13 0 4 M 0 -4 Q 1 -21 15 -19 Q 18 -3 0 -4',
] as const;
