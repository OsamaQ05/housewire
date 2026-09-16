/** Stable display names preserve routes in already-saved cases without exposing edges. */
export const ROUTE_LANDMARKS = [
  { label: 'Sun', icon: 'sunny-outline' },
  { label: 'Key', icon: 'key-outline' },
  { label: 'Bell', icon: 'notifications-outline' },
  { label: 'Moon', icon: 'moon-outline' },
  { label: 'Tree', icon: 'leaf-outline' },
  { label: 'Boat', icon: 'boat-outline' },
  { label: 'Flame', icon: 'flame-outline' },
  { label: 'Book', icon: 'book-outline' },
  { label: 'Star', icon: 'star-outline' },
  { label: 'Cup', icon: 'cafe-outline' },
  { label: 'Fish', icon: 'fish-outline' },
  { label: 'Clock', icon: 'time-outline' },
  { label: 'Flower', icon: 'flower-outline' },
  { label: 'Home', icon: 'home-outline' },
  { label: 'Eye', icon: 'eye-outline' },
  { label: 'Heart', icon: 'heart-outline' },
] as const;

export function routeLandmark(cell: number) {
  return ROUTE_LANDMARKS[cell - 1] ?? { label: `Place ${cell}`, icon: 'location-outline' as const };
}

/** Geometric legality only. It deliberately does not reveal a private doorway. */
export function canAppendRoute(route: readonly number[], cell: number, width: number, cellCount: number): boolean {
  const current = route.at(-1);
  if (!current || cell < 1 || cell > cellCount || !Number.isInteger(cell) || route.includes(cell)) return false;
  return Math.abs(Math.floor((current - 1) / width) - Math.floor((cell - 1) / width)) + Math.abs((current - 1) % width - (cell - 1) % width) === 1;
}

export function attemptCooldownSeconds(wrongAttempts: number): number {
  return Math.min(15, Math.max(0, Math.floor(wrongAttempts)) * 3);
}
