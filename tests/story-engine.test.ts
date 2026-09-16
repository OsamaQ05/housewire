import { describe, expect, it } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { performStoryActivity } from './helpers/story-activity';
import { BENCH_WIRING_SOLUTION_MOVES, createBenchWiringState } from '../src/features/story-rooms/activities/bench-wiring';

import { STORY_ROOMS, getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, expireStoryState, projectStoryView, reduceStoryAction, solveStage, validateStoryRoom } from '../src/features/story-rooms/engine';
import { initialStoryDraft, satisfiesInteraction } from '../src/features/story-rooms/interaction-rules';
import { LINE13_ROOM } from '../src/features/story-rooms/rooms/line13';
import type { StoryAction, StoryRoomId, StoryState } from '../src/features/story-rooms/types';

const NOW = 1_800_000_000_000;
const players = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `person-${index}`, name: `Person ${index + 1}` }));
let sequence = 0;
function action(state: StoryState, kind: 'submit' | 'continue' | 'abort'): StoryAction {
  sequence += 1;
  return { kind, id: `test-${sequence}`, stageIndex: state.stageIndex };
}
function fill(state: StoryState, draft: string[]): StoryState {
  const stage = getStoryRoom(state.roomId).stages[state.stageIndex];
  if (isActivityKind(stage.interaction?.kind)) return performStoryActivity(state, NOW + 1);
  return draft.reduce((current, value, slot) => reduceStoryAction(current, {
    kind: 'edit', id: `edit-${++sequence}`, stageIndex: state.stageIndex, slot, value,
  }, current.players[stage.slots[slot].seat % current.players.length].id, NOW + 1), state);
}
function begin(roomId: StoryRoomId = 'line-13', count = 4) {
  return createStoryState(roomId, players(count), 4294967295, 'operation-1', NOW);
}

describe('authored story catalog integrity', () => {
  it('contains three distinct authored rooms with five/four/four chapters and no hold-button opener', () => {
    expect(STORY_ROOMS.map((room) => room.id)).toEqual(['line-13', 'night-glass', 'long-table']);
    expect(STORY_ROOMS.map(room => room.stages.length)).toEqual([5, 4, 4]);
    expect(LINE13_ROOM.stages.map((stage) => stage.interaction?.kind)).toEqual(['patch-panel', 'route-map', 'bench-wiring', 'rescue-crane', 'clockwork-machine']);
    expect(LINE13_ROOM.stages[0].id).toBe('callers');
    expect(LINE13_ROOM.stages[0].interaction?.kind).toBe('patch-panel');
    expect(LINE13_ROOM.stages.find(stage => stage.id === 'intervention')?.interaction?.kind).toBe('bench-wiring');
  });
  it('removes coded audio and chronology rather than asking users to decode instructions', () => {
    const opener = LINE13_ROOM.stages[0];
    expect(opener.clues.every(clue => clue.medium === 'note' && !clue.beats && !clue.spokenText)).toBe(true);
    expect(LINE13_ROOM.stages.some(stage => stage.id === 'warning' || stage.kind === 'rhythm')).toBe(false);
    expect(JSON.stringify(opener)).not.toMatch(/warning-tape|warning-direction|WORD PACKETS|LONG–short/);
    expect(opener.answer).toEqual(['kitchen', 'porch', 'workshop', 'garden']);
    expect(LINE13_ROOM.stages.every(stage => stage.clues.every(clue => clue.medium === 'note' && !clue.beats))).toBe(true);
    expect(LINE13_ROOM.stages.some(stage => stage.id === 'cause' || stage.id === 'circuit')).toBe(false);
  });
  it('requires every caller and device note to uniquely choose those independent settings', () => {
    for (const stage of LINE13_ROOM.stages.filter(stage => stage.interaction?.kind !== 'route-map' && !isActivityKind(stage.interaction?.kind))) {
      // A drawn map deliberately offers public spatial information, so route
      // geometry can corroborate a missing note. Independent devices cannot.
      for (let missing = 0; missing < 4; missing += 1) {
        const without = { ...stage, constraints: stage.constraints.filter((_, index) => index !== missing) };
        expect(solveStage(without).length, `${stage.id}, missing evidence ${missing + 1}`).toBeGreaterThan(1);
      }
    }
  });
  it('uses an intuitive rescue route with actual corridors and unsafe alternatives', () => {
    const route = LINE13_ROOM.stages.find(stage => stage.id === 'rescue-route')!;
    expect(route.answer).toEqual(['platform', 'relay', 'workshop', 'gate']);
    expect(route.interaction?.kind).toBe('route-map');
    expect(satisfiesInteraction(route, ['platform', 'workshop', 'relay', 'gate'])).toBe(false);
    expect(satisfiesInteraction(route, ['platform', 'ticket', 'boiler', 'gate'])).toBe(true);
    expect(solveStage({ ...route, constraints: [] }).length).toBeGreaterThan(1);
    expect(route.clues.find(clue => clue.id === 'route-tool')!.lines.join(' ')).toContain('hand crank');
    expect(route.revelation).toContain('clock square');
  });
  it('gives each caller clue to someone other than the cable owner, including two-phone play', () => {
    const opener = LINE13_ROOM.stages[0];
    for (const count of [2, 3, 4]) {
      opener.clues.forEach(clue => {
        const color = clue.id.replace('caller-', '');
        const cable = opener.slots.find(slot => slot.label.toLowerCase().startsWith(color))!;
        expect(cable).toBeDefined();
        expect(clue.seat % count).not.toBe(cable.seat % count);
        expect(clue.lines.join(' ')).toContain(`person holding the ${color} cable`);
      });
    }
  });
  it('uses owned cable paths rather than repair-note answer choices', () => {
    const stageIndex = LINE13_ROOM.stages.findIndex(stage => stage.id === 'intervention');
    const stage = LINE13_ROOM.stages[stageIndex];
    expect(stage.interaction?.kind).toBe('bench-wiring');
    expect(stage.options).toEqual([]);
    for (const count of [2, 3, 4]) {
      const state = { ...begin('line-13', count), stageIndex, draft: [], activity: createBenchWiringState() };
      for (let slot = 0; slot < stage.slots.length; slot += 1) {
        const owner = state.players[stage.slots[slot].seat % count].id;
        const foreign = state.players[(stage.slots[slot].seat + 1) % count].id;
        const firstSegment = BENCH_WIRING_SOLUTION_MOVES.find(move => move.control === slot && move.command === 'place')!;
        const move = { kind: 'act' as const, id: `cable-${slot}`, stageIndex, ...firstSegment };
        expect(reduceStoryAction(state, move, foreign, NOW)).toBe(state);
        expect(reduceStoryAction(state, move, owner, NOW).activity).not.toEqual(state.activity);
      }
    }
  });
  for (const room of STORY_ROOMS) {
    it(`${room.title} is uniquely solvable with evidence and valid controls`, () => {
      expect(validateStoryRoom(room)).toEqual([]);
      for (const stage of room.stages) expect(solveStage(stage)).toEqual(isActivityKind(stage.interaction?.kind) ? [] : [stage.answer]);
    });
    for (const playerCount of [1, 2, 3, 4]) {
      it(`${room.title} finishes as ${playerCount} player(s) using distributed ownership`, () => {
        let state = begin(room.id, playerCount);
        for (const [index, stage] of room.stages.entries()) {
          state = fill(state, stage.answer);
          state = reduceStoryAction(state, action(state, 'submit'), state.players[playerCount - 1].id, NOW + 5);
          expect(state.attemptsUsed).toBe(0);
          expect(state.solvedStages).toEqual(Array.from({ length: index + 1 }, (_, position) => position));
          if (index < room.stages.length - 1) {
            expect(state.status).toBe('stage-solved');
            if (playerCount > 1) expect(reduceStoryAction(state, action(state, 'continue'), state.players[1].id, NOW + 5)).toBe(state);
            state = reduceStoryAction(state, action(state, 'continue'), state.players[0].id, NOW + 6);
            expect(state.stageIndex).toBe(index + 1);
            expect(state.draft).toEqual(initialStoryDraft(room.stages[index + 1]));
            expect(state.lastSubmittedDraft).toBeUndefined();
          } else {
            expect(state.status).toBe('won');
            expect(state.endedAt).toBe(NOW + 5);
            expect(projectStoryView(state, state.players[0].id).room.ending).toBe(room.ending);
          }
        }
      });
    }
  }
  it('stable shuffling changes presentation, not solution or source data', () => {
    const before = JSON.stringify(LINE13_ROOM);
    expect(getStoryRoom('line-13', 19)).toEqual(getStoryRoom('line-13', 19));
    const orders = new Set(Array.from({ length: 8 }, (_, seed) => getStoryRoom('line-13', seed).stages[0].options.map((option) => option.id).join(',')));
    expect(orders.size).toBeGreaterThan(1);
    const copy = getStoryRoom('line-13', 2);
    copy.stages[0].clues[0].lines[0] = 'changed';
    copy.stages[0].answer.reverse();
    expect(JSON.stringify(LINE13_ROOM)).toBe(before);
  });
  it('reports unsatisfiable, ambiguous, or mis-authored stages', () => {
    const room = getStoryRoom('line-13');
    room.stages[0].constraints = [];
    expect(validateStoryRoom(room).some((issue) => issue.includes('exactly one solution'))).toBe(true);
    room.stages[0].constraints = [{ kind: 'at', item: 'missing', slot: 99 }];
    expect(validateStoryRoom(room)).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown option'), expect.stringContaining('invalid slot'),
    ]));
    const mismatch = getStoryRoom('line-13');
    mismatch.stages[0].answer.reverse();
    expect(validateStoryRoom(mismatch)).toContain('callers: authored answer does not match evidence constraints.');
  });
  it('requires bounded attempts, four meaningful evidence seats, and readable sensory alternatives', () => {
    const room = getStoryRoom('line-13');
    room.attemptLimit = 99;
    room.stages[0].clues = room.stages[0].clues.filter((clue) => clue.seat !== 3);
    room.stages[0].clues[0].lines = [];
    expect(validateStoryRoom(room)).toEqual(expect.arrayContaining([
      expect.stringContaining('3–5'), expect.stringContaining('seat 3 needs private evidence'), expect.stringContaining('readable without sensors'),
    ]));
  });
  it('uses true orthogonal map adjacency instead of treating a floorplan as a line', () => {
    const stage = { ...LINE13_ROOM.stages[0], layout: 'grid' as const, constraints: [
      { kind: 'at' as const, item: 'kitchen', slot: 0 },
      { kind: 'at' as const, item: 'porch', slot: 2 },
      { kind: 'grid-adjacent' as const, first: 'kitchen', second: 'porch' },
    ] };
    expect(solveStage(stage).length).toBeGreaterThan(0);
    // NW–SW share a wall despite occupying indices 0 and 2.
    expect(solveStage({ ...stage, constraints: [...stage.constraints, { kind: 'adjacent', first: 'kitchen', second: 'porch' }] })).toEqual([]);
    // NE–SW are diagonal despite occupying consecutive indices 1 and 2.
    expect(solveStage({ ...stage, constraints: [
      { kind: 'at', item: 'kitchen', slot: 1 }, { kind: 'at', item: 'porch', slot: 2 },
      { kind: 'grid-adjacent', first: 'kitchen', second: 'porch' },
    ] })).toEqual([]);
    expect(solveStage({ ...stage, constraints: [{ kind: 'grid-adjacent', first: 'kitchen', second: 'missing' }] })).toEqual([]);
  });
});

describe('story action authority and state transitions', () => {
  it('normalizes an unsigned seed and does not mutate supplied players', () => {
    const roster = players(3);
    roster[0].name = '   A very long player name that needs trimming   ';
    const state = createStoryState('line-13', roster, 4294967295, 'session', NOW);
    expect(state.seed).toBe(4294967295);
    expect(state.players[0].name.length).toBe(24);
    expect(roster[0].name.startsWith('   ')).toBe(true);
    expect(state.deadlineAt).toBe(NOW + LINE13_ROOM.minutes * 60_000);
  });
  it('rejects malformed sessions', () => {
    expect(() => createStoryState('line-13', [], 1, 'x', NOW)).toThrow();
    expect(() => createStoryState('line-13', players(5), 1, 'x', NOW)).toThrow();
    expect(() => createStoryState('line-13', [players(1)[0], players(1)[0]], 1, 'x', NOW)).toThrow();
    expect(() => createStoryState('line-13', players(1), NaN, 'x', NOW)).toThrow();
    expect(() => createStoryState('line-13', players(1), 0.5, 'x', NOW)).toThrow();
    expect(() => createStoryState('line-13', players(1), 1, '', NOW)).toThrow();
    expect(() => createStoryState('line-13', players(1), 1, 'x', Infinity)).toThrow();
    expect(() => createStoryState('missing' as StoryRoomId, players(1), 1, 'x', NOW)).toThrow();
  });
  it('rejects outsiders, wrong owners, stale stages, invalid slots and options', () => {
    const state = begin();
    const edit: StoryAction = { kind: 'edit', id: 'edit', stageIndex: 0, slot: 0, value: 'kitchen' };
    expect(reduceStoryAction(state, edit, 'outsider', NOW)).toBe(state);
    expect(reduceStoryAction(state, edit, 'person-0', NaN)).toBe(state);
    expect(reduceStoryAction(state, edit, 'person-1', NOW)).toBe(state);
    expect(reduceStoryAction(state, { ...edit, stageIndex: 1 }, 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, { ...edit, slot: -1 }, 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, { ...edit, slot: 0.5 }, 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, { ...edit, value: 'not-in-stage' }, 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, { ...edit, id: '' }, 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, { ...edit, id: 'a'.repeat(161) }, 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, action(state, 'abort'), 'person-1', NOW)).toBe(state);
    expect(reduceStoryAction(state, action(state, 'continue'), 'person-0', NOW)).toBe(state);
  });
  it('permits teammates to edit only their assigned slots at 2/3/4 seats', () => {
    for (const count of [2, 3, 4]) {
      const state = begin('line-13', count);
      for (let slot = 0; slot < 4; slot += 1) {
        const owner = slot % count;
        const edit: StoryAction = { kind: 'edit', id: `owned-${slot}`, stageIndex: 0, slot, value: 'kitchen' };
        expect(reduceStoryAction(state, edit, `person-${owner}`, NOW).draft[slot]).toBe('kitchen');
        expect(reduceStoryAction(state, edit, `person-${(owner + 1) % count}`, NOW)).toBe(state);
      }
    }
  });
  it('replays a recent action exactly once and leaves previous state immutable', () => {
    const state = begin();
    const snapshot = JSON.stringify(state);
    const edit: StoryAction = { kind: 'edit', id: 'once', stageIndex: 0, slot: 0, value: 'kitchen' };
    const updated = reduceStoryAction(state, edit, 'person-0', NOW);
    expect(updated.revision).toBe(1);
    expect(reduceStoryAction(updated, edit, 'person-0', NOW)).toBe(updated);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
  it('keeps action history bounded under an edit flood', () => {
    let state = begin();
    for (let index = 0; index < 1000; index += 1) state = reduceStoryAction(state, { kind: 'edit', id: `flood-${index}`, stageIndex: 0, slot: 0, value: index % 2 ? 'kitchen' : '' }, 'person-0', NOW);
    expect(state.processedActionIds).toHaveLength(256);
    expect(state.processedActionIds.at(-1)).toBe('flood-999');
    expect(state.attemptsUsed).toBe(0);
  });
  it('does not spend attempts on incomplete or repeated-piece boards', () => {
    let state = begin();
    state = reduceStoryAction(state, action(state, 'submit'), 'person-2', NOW);
    expect(state.attemptsUsed).toBe(0);
    expect(state.feedback).toContain('No attempt used');
    state = fill(state, ['kitchen', 'kitchen', 'workshop', 'garden']);
    state = reduceStoryAction(state, action(state, 'submit'), 'person-3', NOW);
    expect(state.attemptsUsed).toBe(0);
    expect(state.feedback).toContain('used once');
  });
  it('charges one failed plan only once even when two players submit simultaneously', () => {
    let state = fill(begin(), ['porch', 'kitchen', 'workshop', 'garden']);
    state = reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW);
    const feedback = state.feedback;
    state = reduceStoryAction(state, action(state, 'submit'), 'person-3', NOW);
    expect(state.attemptsUsed).toBe(1);
    expect(state.feedback).toContain('already tested');
    expect(feedback).not.toMatch(/\b[0-4] (correct|right|wrong)\b/i);
    expect(feedback).not.toContain('porch');
  });
  it('ends after five different failed complete plans and reveals the actual explanation', () => {
    let state = begin();
    const wrong = [
      ['porch', 'kitchen', 'workshop', 'garden'], ['workshop', 'porch', 'kitchen', 'garden'],
      ['garden', 'porch', 'workshop', 'kitchen'], ['kitchen', 'workshop', 'porch', 'garden'],
      ['kitchen', 'garden', 'workshop', 'porch'],
    ];
    for (const [index, draft] of wrong.entries()) {
      state = fill(state, draft);
      state = reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW);
      expect(state.attemptsUsed).toBe(index + 1);
      expect(state.status).toBe(index === 4 ? 'failed' : 'playing');
    }
    expect(projectStoryView(state, 'person-0').stage.revelation).toContain('Bakery → Front porch → Workshop → Garden');
    expect(projectStoryView(state, 'person-0').stage.revelation).toContain('Blue describes bread and an oven');
    expect(reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW)).toBe(state);
    expect(reduceStoryAction(state, action(state, 'continue'), 'person-0', NOW)).toBe(state);
  });
  it('holds the discovery before progression and ignores late old-stage actions', () => {
    let state = fill(begin(), LINE13_ROOM.stages[0].answer);
    const stale = action(state, 'submit');
    state = reduceStoryAction(state, stale, 'person-2', NOW);
    expect(state.status).toBe('stage-solved');
    expect(projectStoryView(state, 'person-0').stage.revelation).toBe(LINE13_ROOM.stages[0].revelation);
    expect(reduceStoryAction(state, { kind: 'edit', id: 'late-edit', stageIndex: 0, slot: 0, value: 'porch' }, 'person-0', NOW)).toBe(state);
    state = reduceStoryAction(state, action(state, 'continue'), 'person-0', NOW);
    expect(reduceStoryAction(state, { ...stale, id: 'late-submit' }, 'person-0', NOW)).toBe(state);
  });
  it('keeps the five-attempt budget across stage transitions', () => {
    let state = fill(begin(), ['porch', 'kitchen', 'workshop', 'garden']);
    state = reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW);
    expect(state.attemptsUsed).toBe(1);
    state = fill(state, LINE13_ROOM.stages[0].answer);
    state = reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW);
    state = reduceStoryAction(state, action(state, 'continue'), 'person-0', NOW);
    expect(state.attemptsUsed).toBe(1);
    const wrong = [...LINE13_ROOM.stages[1].answer].reverse();
    state = fill(state, wrong);
    state = reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW);
    expect(state.attemptsUsed).toBe(2);
    expect(state.feedback).toContain('3 attempts left');
  });
  it('expires at the exact deadline, but never changes a completed or aborted room', () => {
    const state = begin();
    expect(expireStoryState(state, state.deadlineAt - 1)).toBe(state);
    expect(expireStoryState(state, state.deadlineAt).status).toBe('failed');
    expect(expireStoryState(state, state.deadlineAt + 9000).endedAt).toBe(state.deadlineAt);
    expect(expireStoryState(state, NaN)).toBe(state);
    expect(reduceStoryAction(state, { kind: 'edit', id: 'too-late', stageIndex: 0, slot: 0, value: 'kitchen' }, 'person-0', state.deadlineAt).status).toBe('failed');
    for (const status of ['won', 'failed', 'aborted'] as const) {
      const complete = { ...state, status };
      expect(expireStoryState(complete, state.deadlineAt + 1)).toBe(complete);
    }
    const aborted = reduceStoryAction(state, action(state, 'abort'), 'person-0', NOW);
    expect(aborted.status).toBe('aborted');
    expect(aborted.endedAt).toBe(NOW);
  });
});

describe('private evidence projection', () => {
  for (const count of [2, 3, 4]) {
    it(`keeps all evidence and controls private and complete for ${count} people`, () => {
      for (const room of STORY_ROOMS) {
        const state = begin(room.id, count);
        for (let stageIndex = 0; stageIndex < room.stages.length; stageIndex += 1) {
          const stageState = { ...state, stageIndex };
          const views = state.players.map((player) => projectStoryView(stageState, player.id));
          expect(views.flatMap((view) => view.ownedSlots).sort()).toEqual(room.stages[stageIndex].slots.map((_, index) => index));
          expect(new Set(views.flatMap((view) => view.stage.clues.map((clue) => clue.id))).size).toBe(room.stages[stageIndex].clues.length);
          views.forEach((view, playerIndex) => {
            if (view.stage.interaction?.kind === 'lightbox') {
              expect(view.stage.clues).toEqual([]);
              expect(view.stage.interaction.films.some(film => film.length > 0)).toBe(true);
            } else if (!isActivityKind(view.stage.interaction?.kind)) expect(view.stage.clues.length).toBeGreaterThan(0);
            expect(view.ownedSlots.length).toBeGreaterThan(0);
            expect(view.stage.clues.every((clue) => clue.seat % count === playerIndex)).toBe(true);
            expect(view.stage).not.toHaveProperty('answer');
            expect(view.stage).not.toHaveProperty('constraints');
            expect(view.stage).not.toHaveProperty('explanation');
            expect(view.room).not.toHaveProperty('stages');
            expect(view.stage.revelation).toBe('');
            expect(view.room.ending).toBe('');
          });
        }
      }
    });
  }
  it('does not issue a spectator an evidence view', () => expect(() => projectStoryView(begin(), 'outsider')).toThrow());
  it('rejects removed sound experiments without consuming an attempt', () => {
    for (const room of STORY_ROOMS) {
      room.stages.forEach((stage, stageIndex) => {
        expect(stage.experiments).toBeUndefined();
        const state = { ...begin(room.id), stageIndex, draft: stage.slots.map(() => '') };
        expect(reduceStoryAction(state, { kind: 'probe', id: 'removed-sound', stageIndex, probeId: 'tap' }, 'person-0', NOW)).toBe(state);
        expect(state.attemptsUsed).toBe(0);
      });
    }
  });
  it('keeps private physical pieces hidden until the chapter is solved', () => {
    for (const room of STORY_ROOMS) {
      for (const [stageIndex, stage] of room.stages.entries()) {
        if (stage.interaction?.kind !== 'pipe-grid' && stage.interaction?.kind !== 'lightbox') continue;
        let state = { ...begin(room.id), stageIndex, draft: stage.slots.map(() => '') };
        const view = projectStoryView(state, 'person-0');
        const model = view.stage.interaction;
        if (model?.kind === 'pipe-grid') {
          expect(model.tiles[0]).toEqual(stage.interaction.kind === 'pipe-grid' ? stage.interaction.tiles[0] : []);
          expect(model.tiles.slice(1)).toEqual([[-1, -1], [-1, -1], [-1, -1]]);
        } else if (model?.kind === 'lightbox') {
          expect(model.films[0]).toEqual(stage.interaction.kind === 'lightbox' ? stage.interaction.films[0] : []);
          expect(model.films.slice(1)).toEqual([[], [], []]);
        }
        state = fill(state, stage.answer);
        state = reduceStoryAction(state, action(state, 'submit'), 'person-0', NOW);
        // The lightbox may also carry its public, composited preview; every
        // original physical piece must be visible after solving the chapter.
        expect(projectStoryView(state, 'person-0').stage.interaction).toMatchObject(stage.interaction);
      }
    }
  });
});
