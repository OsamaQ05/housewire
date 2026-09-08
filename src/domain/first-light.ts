export type FirstLightStepId = 'house-line' | 'private-seal' | 'carry-signal' | 'finale';

export interface FirstLightStepDefinition {
  id: FirstLightStepId;
  eyebrow: string;
  title: string;
  instruction: string;
  hint: string;
}

export interface FirstLightSealOption {
  id: string;
  color: 'BLUE' | 'AMBER' | 'CORAL';
  count: number;
  shape: 'CIRCLE' | 'DIAMOND' | 'TRIANGLE';
}

export const FIRST_LIGHT_STEPS: readonly FirstLightStepDefinition[] = [
  {
    id: 'house-line',
    eyebrow: 'ROOM 01 · LIVING ROOM',
    title: 'Call the rooms',
    instruction: 'Hold the orange ring, say “Living room ready,” then release.',
    hint: 'Press and hold the orange House Line ring. Release it when you finish speaking.',
  },
  {
    id: 'private-seal',
    eyebrow: 'ROOM 02 · PRIVATE CLUES',
    title: 'Build the seal',
    instruction: 'Combine one private detail from each room, then choose the matching seal.',
    hint: 'Use all three details: your colour, Mara’s number and Samir’s shape.',
  },
  {
    id: 'carry-signal',
    eyebrow: 'ROOM 03 · SHARED CONTACT',
    title: 'Lock the signal',
    instruction: 'Hold the contact until it locks. This is how physical actions work in a case.',
    hint: 'Press and hold the contact plate for one second.',
  },
  {
    id: 'finale',
    eyebrow: 'ROOM 04 · EVERYONE TOGETHER',
    title: 'Light the house',
    instruction: 'Start the countdown. When every room glows, hold your light to finish.',
    hint: 'Start the countdown. When the centre says NOW, hold your ring until it fills.',
  },
] as const;

export const FIRST_LIGHT_SEALS: readonly FirstLightSealOption[] = [
  { id: 'blue-three-triangle', color: 'BLUE', count: 3, shape: 'TRIANGLE' },
  { id: 'amber-three-diamond', color: 'AMBER', count: 3, shape: 'DIAMOND' },
  { id: 'coral-two-triangle', color: 'CORAL', count: 2, shape: 'TRIANGLE' },
] as const;

export const FIRST_LIGHT_CORRECT_SEAL_ID = 'blue-three-triangle';

export function isFirstLightSealCorrect(id: string): boolean {
  return id === FIRST_LIGHT_CORRECT_SEAL_ID;
}

export function nextFirstLightStep(index: number): number {
  return Math.min(FIRST_LIGHT_STEPS.length - 1, Math.max(0, Math.trunc(index)) + 1);
}

export function firstLightGuideHint(index: number): string {
  const safeIndex = Math.max(0, Math.min(FIRST_LIGHT_STEPS.length - 1, Math.trunc(index)));
  return FIRST_LIGHT_STEPS[safeIndex].hint;
}
