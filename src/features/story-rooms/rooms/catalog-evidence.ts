import type { StoryClue, StoryConstraint, StoryOption, StorySlot, StoryStage } from '../types';

export type Evidence = Omit<StoryClue, 'seat'> & { rules: StoryConstraint[] };

/** Kept alongside the authored evidence so tests can prove that every role matters. */
export const OTHER_STORY_RULE_GROUPS: Record<string, StoryConstraint[][]> = {};

export function evidenceStage(
  stage: Omit<StoryStage, 'clues' | 'constraints'>,
  evidence: [Evidence, Evidence, Evidence, Evidence],
): StoryStage {
  // Authored matching clues describe stations 1, 2, 3, 0. Pairing control
  // owners 0↔1 and 2↔3 keeps every hand-off on another phone at 2, 3 OR 4
  // players; a simple cycle accidentally hands seat 3's clue back to seat 0
  // when three people play.
  const bySeat = [evidence[0], evidence[3], evidence[2], evidence[1]];
  OTHER_STORY_RULE_GROUPS[stage.id] = bySeat.map((clue) => clue.rules);
  return {
    ...stage,
    clues: bySeat.map(({ rules: _rules, ...clue }, seat) => ({
      ...clue, seat,
      // A camera clue must request a marker on another actual phone too.
      ...(clue.medium === 'lens' ? { scanTargetSeat: seat ^ 1 } : {}),
    })),
    constraints: evidence.flatMap((clue) => clue.rules),
  };
}

export const slots = (...labels: [string, string, string, string]): StorySlot[] =>
  labels.map((label, seat) => ({ id: `station-${seat}`, label, seat }));

export const at = (item: string, slot: number): StoryConstraint => ({ kind: 'at', item, slot });
export const present = (item: string): StoryConstraint => ({ kind: 'include', item });
export const notAt = (item: string, slot: number): StoryConstraint[] =>
  [present(item), { kind: 'not-at', item, slot }];
export const before = (first: string, second: string): StoryConstraint => ({ kind: 'before', first, second });
export const nextTo = (first: string, second: string): StoryConstraint => ({ kind: 'adjacent', first, second });
export const apart = (first: string, second: string, distance: number): StoryConstraint =>
  ({ kind: 'offset', first, second, distance });

/** Separate IDs keep each physical dial attached to its own tile or film. */
export function rotatingParts(prefix: string, labels: [string, string, string, string]): { slots: StorySlot[]; options: StoryOption[] } {
  const options = labels.flatMap((label, part) => [0, 1, 2, 3].map((turn) => ({
    id: `${prefix}-${part}-${turn}`, label: `${label} · ${turn * 90}°`,
    detail: turn === 0 ? 'Original orientation' : `${turn} clockwise quarter ${turn === 1 ? 'turn' : 'turns'}`,
    icon: 'refresh', turn,
  })));
  return {
    options,
    slots: labels.map((label, seat) => ({ id: `${prefix}-${seat}`, label, seat, optionIds: options.filter((option) => option.id.startsWith(`${prefix}-${seat}-`)).map((option) => option.id) })),
  };
}
