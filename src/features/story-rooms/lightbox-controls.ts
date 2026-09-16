import { optionsForSlot } from './interaction-rules';
import type { StoryStage } from './types';

/** Glass is already on the table at 0°. The first press must actually turn it. */
export function nextGlassChoice(stage: Pick<StoryStage, 'slots' | 'options'>, draft: readonly string[], slot: number, direction: 1 | -1): string | undefined {
  const choices = optionsForSlot(stage, slot);
  const currentTurn = choices.find(option => option.id === draft[slot])?.turn ?? 0;
  const nextTurn = (currentTurn + direction + 4) % 4;
  return choices.find(option => option.turn === nextTurn)?.id;
}
