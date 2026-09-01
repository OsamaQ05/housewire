export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function medianAbsoluteDeviation(values: readonly number[]): number {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * quantile));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function rootMeanSquare(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.sqrt(mean(values.map((value) => value * value)));
}

export function vectorMagnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function unwrapAngles(values: readonly number[]): readonly number[] {
  if (values.length === 0) return [];
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    let value = values[index];
    const previous = result[index - 1];
    while (value - previous > Math.PI) value -= Math.PI * 2;
    while (value - previous < -Math.PI) value += Math.PI * 2;
    result.push(value);
  }
  return result;
}

export function countSignChanges(values: readonly number[], deadZone = 0): number {
  let previousSign = 0;
  let changes = 0;
  for (const value of values) {
    const sign = value > deadZone ? 1 : value < -deadZone ? -1 : 0;
    if (sign === 0) continue;
    if (previousSign !== 0 && sign !== previousSign) changes += 1;
    previousSign = sign;
  }
  return changes;
}

export function confidenceAbove(value: number, threshold: number, fullScale: number): number {
  if (value <= threshold) return 0;
  return clamp01((value - threshold) / Math.max(0.0001, fullScale - threshold));
}

export function confidenceBelow(value: number, threshold: number, zeroScale: number): number {
  if (value >= threshold) return 0;
  return clamp01((threshold - value) / Math.max(0.0001, threshold - zeroScale));
}
