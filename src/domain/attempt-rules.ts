export function escapeAttemptLimit(mission: string): 3 | 4 | 5 {
  return mission === 'line-13' ? 3 : mission === 'long-table' ? 5 : 4;
}
export function escapeDurationMs(mission: string): number {
  return (mission === 'long-table' ? 22 : mission === 'line-13' ? 13 : 18) * 60_000;
}
