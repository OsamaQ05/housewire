import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, projectStoryView, reduceStoryAction, solveStage } from '../src/features/story-rooms/engine';
import { filmComposite, optionsForSlot } from '../src/features/story-rooms/interaction-rules';
import { nextGlassChoice } from '../src/features/story-rooms/lightbox-controls';

const room = getStoryRoom('night-glass');
const glass = room.stages[0];

describe('Night Glass: direct cooperative shape making', () => {
  it('has four chapters, starts with glass, and removes the old floorplan and written shape puzzle', () => {
    expect(room.stages.map(stage => stage.id)).toEqual(['night-glass-negative', 'night-glass-passage', 'night-glass-courtyard', 'night-glass-watermark']);
    expect(glass.interaction?.kind).toBe('lightbox');
    expect(glass.clues).toEqual([]);
    expect(glass.constraints).toEqual([]);
    expect(solveStage(glass)).toEqual([glass.answer]);
  });

  it('turns every slide on the first click, even if a missing draft reaches the UI', () => {
    for (let slot = 0; slot < 4; slot++) {
      const choices = optionsForSlot(glass, slot);
      expect(nextGlassChoice(glass, [], slot, 1)).toBe(choices.find(option => option.turn === 1)!.id);
      expect(nextGlassChoice(glass, [], slot, -1)).toBe(choices.find(option => option.turn === 3)!.id);
      const draft = [...glass.answer];
      draft[slot] = choices.find(option => option.turn === 0)!.id;
      const before = [...draft];
      for (let turn = 0; turn < 4; turn++) draft[slot] = nextGlassChoice(glass, draft, slot, 1)!;
      expect(draft).toEqual(before);
      draft[slot] = nextGlassChoice(glass, draft, slot, -1)!;
      draft[slot] = nextGlassChoice(glass, draft, slot, 1)!;
      expect(draft).toEqual(before);
    }
    expect(nextGlassChoice(glass, [], 99, 1)).toBeUndefined();
  });

  for (const count of [2, 3, 4]) it(`is fully playable with ${count} people using their own visible controls`, () => {
    const players = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Player ${index + 1}` }));
    let state = createStoryState('night-glass', players, 1, `glass-${count}`, 1_000);
    const controls = players.flatMap(player => projectStoryView(state, player.id).ownedSlots);
    expect([...controls].sort()).toEqual([0, 1, 2, 3]);
    expect(new Set(controls).size).toBe(4);
    expect(state.draft).toEqual(glass.slots.map((_, index) => optionsForSlot(glass, index).find(option => option.turn === 0)!.id));
    const startingPicture = filmComposite(glass, state.draft);
    for (const player of players) {
      const personal = projectStoryView(state, player.id);
      expect(personal.ownedSlots.length).toBeGreaterThan(0);
      expect(personal.stage.clues).toEqual([]);
      if (personal.stage.interaction?.kind !== 'lightbox') throw new Error('No lightbox');
      expect(personal.stage.interaction.films.filter(film => film.length).length).toBe(personal.ownedSlots.length);
      for (const slot of personal.ownedSlots) {
        // Exercise the exact same next-choice helper as both UI arrows.
        for (let attempt = 0; state.draft[slot] !== glass.answer[slot] && attempt < 4; attempt++) {
          const value = nextGlassChoice(glass, state.draft, slot, 1)!;
          state = reduceStoryAction(state, { kind: 'edit', stageIndex: 0, id: `turn-${slot}-${attempt}`, slot, value }, player.id, 1_010 + slot * 10 + attempt);
        }
      }
    }
    expect(state.draft).toEqual(glass.answer);
    expect(filmComposite(glass, state.draft)).not.toEqual(startingPicture);
    state = reduceStoryAction(state, { kind: 'submit', stageIndex: 0, id: 'check-picture' }, players[0].id, 1_100);
    expect(state.status).toBe('stage-solved');
    expect(state.attemptsUsed).toBe(0);
  });

  it('exposes target/live together, two labelled directions, and an accessible direct glass control', () => {
    // Source contracts supplement domain tests; these are not device rendering tests.
    const source = readFileSync(resolve('src/features/story-rooms/LightboxBoard.tsx'), 'utf8');
    expect(source).toContain('MAKE THIS');
    expect(source).toContain('OUR PICTURE');
    expect(source).toContain('onPress={() => turn(-1)}');
    expect(source.match(/onPress=\{\(\) => turn\(1\)\}/g)).toHaveLength(2);
    expect(source).toContain('clockwise by 90 degrees');
    expect(source).toContain('anticlockwise by 90 degrees');
    expect(source).toContain('accessibilityRole="tablist"');
    expect(source).toContain('view.ownedSlots.map');
    expect(source).toContain('turns this');
    expect(source).toContain('minHeight: 50, minWidth: 44');
    expect(source).toContain('reducedMotion ? undefined');
    expect(source).not.toMatch(/Set this piece|set your slides|margin note/i);
  });
});
