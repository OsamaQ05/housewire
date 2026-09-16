/** One deliberate move on a player-owned control. No continuous sensor stream. */
export interface ActivityMove {
  control: number;
  command: string;
  value?: number;
}

export const ACTIVITY_KINDS = ['marble-machine', 'time-house', 'tool-search', 'rescue-crane', 'bench-wiring', 'serving-tray', 'shadow-play', 'clockwork-machine'] as const;
export type ActivityKind = typeof ACTIVITY_KINDS[number];
export function isActivityKind(kind: string | undefined): kind is ActivityKind {
  return ACTIVITY_KINDS.some(value => value === kind);
}
