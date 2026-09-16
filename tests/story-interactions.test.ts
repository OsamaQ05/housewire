import { describe, expect, it } from 'vitest';
import { STORY_ROOMS, getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, projectStoryView, reduceStoryAction, solveStage, validateStoryRoom } from '../src/features/story-rooms/engine';
import { allowsStoryChoice, filmComposite, optionsForSlot, rotateFilm, satisfiesInteraction } from '../src/features/story-rooms/interaction-rules';

const players = [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Guest' }];

describe('different authored board mechanics', () => {
  it('removes the broken audio warning, including its reversed packet rule', () => {
    const first = getStoryRoom('line-13').stages[0];
    expect(first.id).toBe('callers');
    expect(first.interaction?.kind).toBe('patch-panel');
    expect(first.clues.every(clue => clue.medium !== 'audio' && !clue.beats)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/WORD PACKETS|LONG.short|reverse order/i);
  });

  it('uses three distinct complete room signatures, not the same mechanic sequence reskinned', () => {
    const signatures = Object.fromEntries(STORY_ROOMS.map(room => [room.id, room.stages.map(stage => {
      const interaction = stage.interaction;
      return interaction?.kind === 'table-scene' ? `${interaction.kind}:${interaction.mode}` : interaction?.kind ?? stage.kind;
    })]));
    expect(signatures).toEqual({
      'line-13': ['patch-panel', 'route-map', 'bench-wiring', 'rescue-crane', 'clockwork-machine'],
      'night-glass': ['lightbox', 'tool-search', 'time-house', 'patch-panel'],
      'long-table': ['table-scene:seating', 'marble-machine', 'serving-tray', 'shadow-play'],
    });
    for (const room of STORY_ROOMS) expect(validateStoryRoom(room)).toEqual([]);
    expect(new Set(Object.values(signatures).map(signature => signature.join('/'))).size).toBe(3);
    expect(new Set(STORY_ROOMS.map(room => room.stages[0].interaction?.kind)).size).toBe(3);
  });

  it('checks real map corridors independently of private route clues', () => {
    const stage = getStoryRoom('line-13').stages[1];
    expect(stage.interaction?.kind).toBe('route-map');
    expect(satisfiesInteraction(stage, stage.answer)).toBe(true);
    expect(satisfiesInteraction(stage, ['platform', 'workshop', 'relay', 'gate'])).toBe(false);
    expect(satisfiesInteraction(stage, ['', '', '', ''])).toBe(false);
    // A connected detour is physically possible but lacks the rescue equipment.
    expect(satisfiesInteraction(stage, ['platform', 'ticket', 'boiler', 'gate'])).toBe(true);
    expect(solveStage(stage)).toEqual([stage.answer]);
    expect(solveStage({ ...stage, constraints: [] }).length).toBeGreaterThan(1);
  });

  it('rotates actual glass geometry and checks its union rather than an arbitrary answer key', () => {
    expect(rotateFilm([0, 1, 6], 1)).toEqual([4, 8, 9]);
    expect(rotateFilm([0, 1, 6], 4)).toEqual([0, 1, 6]);
    const stage = getStoryRoom('night-glass').stages[0];
    if (stage.interaction?.kind !== 'lightbox') throw new Error('Missing lightbox');
    expect(filmComposite(stage, stage.answer)).toEqual([...stage.interaction.target].sort((a, b) => a - b));
    expect(solveStage(stage)).toEqual([stage.answer]);
    for (let slot = 0; slot < 4; slot++) {
      const changed = [...stage.answer];
      changed[slot] = optionsForSlot(stage, slot).find(option => option.id !== changed[slot])!.id;
      expect(satisfiesInteraction(stage, changed)).toBe(false);
      const withoutLayer = { ...stage, interaction: { ...stage.interaction, films: stage.interaction.films.map((film, index) => index === slot ? [] : film) } };
      expect(filmComposite(withoutLayer, stage.answer)).not.toEqual(stage.interaction.target);
    }
  });

  it('starts with every glass layer placed at zero, without clues or a hidden setup gate', () => {
    const stage = getStoryRoom('night-glass').stages[0];
    const state = createStoryState('night-glass', players, 1, 'glass-start', 1_000);
    expect(stage.clues).toEqual([]);
    expect(stage.constraints).toEqual([]);
    expect(state.draft).toEqual(stage.slots.map((_, slot) => optionsForSlot(stage, slot).find(option => option.turn === 0)!.id));
    expect(filmComposite(stage, state.draft).length).toBeGreaterThan(0);
    const checked = reduceStoryAction(state, { kind: 'submit', stageIndex: 0, id: 'look-at-picture' }, 'host', 1_001);
    expect(checked.status).toBe('playing');
    expect(checked.attemptsUsed).toBe(0);
    expect(checked.chapterAttemptsUsed).toBe(0);
    expect(checked.feedback).toBeTruthy();
  });

  it('restricts each rotary value to its own station, including malicious network edits', () => {
    const stage = getStoryRoom('night-glass').stages[0];
    const state = createStoryState('night-glass', players, 1, 'glass-edits', 1_000);
    const otherSlotOption = optionsForSlot(stage, 1)[0].id;
    expect(allowsStoryChoice(stage, 0, otherSlotOption)).toBe(false);
    expect(reduceStoryAction(state, { kind: 'edit', stageIndex: 0, id: 'bad', slot: 0, value: otherSlotOption }, 'host', 1_001)).toBe(state);
    expect(reduceStoryAction(state, { kind: 'edit', stageIndex: 0, id: 'foreign', slot: 1, value: otherSlotOption }, 'host', 1_001)).toBe(state);
    expect(allowsStoryChoice(stage, 0, '')).toBe(true);
  });

  it('keeps other glass layers private while sharing the combined image and reveals all when requested', () => {
    const fullStage = getStoryRoom('night-glass').stages[0];
    const state = { ...createStoryState('night-glass', players, 1, 'private-glass', 1_000), draft: [...fullStage.answer] };
    const host = projectStoryView(state, 'host').stage.interaction;
    const guest = projectStoryView(state, 'guest').stage.interaction;
    if (host?.kind !== 'lightbox' || guest?.kind !== 'lightbox') throw new Error('Expected glass boards');
    expect(host.films[1]).toEqual([]); expect(guest.films[0]).toEqual([]);
    expect(host.films[0].length).toBeGreaterThan(0);
    expect(host.preview).toEqual(filmComposite(fullStage, state.draft));
    expect(host.preview).toEqual(guest.preview);
    const revealed = projectStoryView({ ...state, status: 'stage-solved', assistedStages: [0] }, 'host').stage.interaction;
    expect(revealed?.kind).toBe('lightbox');
    if (revealed?.kind === 'lightbox') expect(revealed.films.every(film => film.length)).toBe(true);
  });

  it('clones glass and map metadata without modifying the authored original', () => {
    const original = JSON.stringify(STORY_ROOMS);
    const glass = getStoryRoom('night-glass');
    if (glass.stages[0].interaction?.kind === 'lightbox') {
      glass.stages[0].interaction.films[0][0] = 99;
      glass.stages[0].interaction.target.reverse();
    }
    glass.stages[0].slots[0].optionIds!.reverse();
    const route = getStoryRoom('line-13').stages[1];
    if (route.interaction?.kind === 'route-map') {
      route.interaction.nodes[0].label = 'Changed';
      route.interaction.edges[0][0] = 'invalid';
    }
    expect(JSON.stringify(STORY_ROOMS)).toBe(original);
  });

  it('bounds search before unscoped option lists can explode', () => {
    const stage = getStoryRoom('night-glass').stages[0];
    expect(solveStage({ ...stage, slots: stage.slots.map(slot => ({ ...slot, optionIds: undefined })) })).toEqual([]);
  });
});
