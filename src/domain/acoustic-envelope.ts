export type AcousticBand = 'REST' | 'SOFT' | 'STRONG';

/** Coarse, locally calibrated level classification; never interprets words or pitch. */
export function classifyRelativeLevel(decibels: number, baselineDecibels: number): AcousticBand {
  const rise = decibels - baselineDecibels;
  if (rise < 5) return 'REST';
  if (rise < 15) return 'SOFT';
  return 'STRONG';
}
