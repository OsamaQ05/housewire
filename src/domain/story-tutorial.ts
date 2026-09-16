export type TutorialRole = 'you' | 'partner';
export const TUTORIAL_STOPS = [
  { id: 'porch', label: 'Porch', icon: 'home-outline' },
  { id: 'shed', label: 'Shed', icon: 'construct-outline' },
  { id: 'kitchen', label: 'Kitchen', icon: 'restaurant-outline' },
  { id: 'garden', label: 'Garden', icon: 'leaf-outline' },
] as const;
export const TUTORIAL_TRAIL = ['kitchen', 'garden', 'porch', 'shed'] as const;
export const TUTORIAL_CLUES: Record<TutorialRole, string[]> = {
  you: ['The garden came after the kitchen.', 'The porch came before the shed.'],
  partner: ['We started in the kitchen.', 'The garden was immediately before the porch.'],
};
export function tutorialOwnsSlot(role: TutorialRole, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < 4 && slot % 2 === (role === 'you' ? 0 : 1);
}
export function placeTutorialStop(draft: string[], role: TutorialRole, slot: number, value: string): string[] {
  if (draft.length !== 4 || !tutorialOwnsSlot(role, slot) || !TUTORIAL_STOPS.some((stop) => stop.id === value)) return draft;
  return draft.map((old, index) => index === slot ? value : old);
}
export function checkTutorialTrail(draft: string[]): 'incomplete' | 'duplicate' | 'wrong' | 'solved' {
  if (draft.length !== 4 || draft.some((id) => !TUTORIAL_STOPS.some((stop) => stop.id === id))) return 'incomplete';
  if (new Set(draft).size !== 4) return 'duplicate';
  return draft.every((value, index) => value === TUTORIAL_TRAIL[index]) ? 'solved' : 'wrong';
}
