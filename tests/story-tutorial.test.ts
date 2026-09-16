import { describe, expect, it } from 'vitest';
import { checkTutorialTrail, placeTutorialStop, TUTORIAL_TRAIL, tutorialOwnsSlot } from '../src/domain/story-tutorial';

describe('friendly shared-board tutorial', () => {
  it('requires both roles to build the complete trail', () => {
    let draft = ['', '', '', ''];
    TUTORIAL_TRAIL.forEach((place, slot) => { draft = placeTutorialStop(draft, 'you', slot, place); });
    expect(checkTutorialTrail(draft)).toBe('incomplete');
    TUTORIAL_TRAIL.forEach((place, slot) => { draft = placeTutorialStop(draft, 'partner', slot, place); });
    expect(checkTutorialTrail(draft)).toBe('solved');
  });
  it('does not change another player’s slot or accept a fictional option', () => {
    const draft = ['', '', '', ''];
    expect(placeTutorialStop(draft, 'you', 1, 'garden')).toBe(draft);
    expect(placeTutorialStop(draft, 'partner', 0, 'kitchen')).toBe(draft);
    expect(placeTutorialStop(draft, 'you', 0, 'made-up')).toBe(draft);
    expect(tutorialOwnsSlot('you', -2)).toBe(false);
    expect(tutorialOwnsSlot('partner', 1.5)).toBe(false);
  });
  it('gives useful feedback without a failure state or penalties', () => {
    expect(checkTutorialTrail(['kitchen', '', '', ''])).toBe('incomplete');
    expect(checkTutorialTrail(['kitchen', 'kitchen', 'porch', 'shed'])).toBe('duplicate');
    expect(checkTutorialTrail(['garden', 'kitchen', 'porch', 'shed'])).toBe('wrong');
    expect(checkTutorialTrail([...TUTORIAL_TRAIL])).toBe('solved');
  });
});
