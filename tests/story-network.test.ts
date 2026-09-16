import { describe, expect, it, vi } from 'vitest';

import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, expireStoryState, projectStoryView, reduceStoryAction } from '../src/features/story-rooms/engine';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, storyEventSchema, storyStateSchema } from '../src/features/story-rooms/story-protocol';
import { pruneStoryCheckpoints, storyCheckpointKey } from '../src/features/story-rooms/story-store';
import { housewireSessionEventSchema } from '../src/features/session/protocol';
import type { StoryAction, StoryState } from '../src/features/story-rooms/types';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) } }));

const now = 1_800_000_000_000;
const players = [{ id: 'local', name: 'Host' }, { id: 'guest', name: 'Guest' }];
const create = (operationId = 'story-one', startedAt = now) => createStoryState('line-13', players, 4294967295, operationId, startedAt);
const event = (state: StoryState, action: StoryAction, nodeId = 'guest') => ({ kind: 'story.action', roomId: state.roomId, operationId: state.operationId, nodeId, action, sentAt: now });
const accept = (raw: unknown, current?: StoryState, senderId = 'local') => acceptStorySnapshot({ raw, current, senderId, roomId: 'line-13', hostNodeId: 'local', localNodeId: 'guest' });

describe('authored room network authority', () => {
  it('passes unsigned seeds and public state through the same strict protocol as the live session', () => {
    const state = create();
    expect(state.seed).toBe(4294967295);
    const snapshot = makeStorySnapshot(state, now);
    expect(housewireSessionEventSchema.safeParse(snapshot).success).toBe(true);
    expect(storyEventSchema.safeParse(snapshot).success).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/"(?:answer|clues|constraints|stages|explanation)"/);
  });

  it('accepts only the relay-authenticated host, not a guest claiming to be host', () => {
    const state = create();
    expect(accept(makeStorySnapshot(state, now))?.state).toEqual(state);
    expect(accept(makeStorySnapshot(state, now), undefined, 'guest')).toBeUndefined();
    expect(accept({ ...makeStorySnapshot(state, now), hostNodeId: 'guest' })).toBeUndefined();
  });

  it('rejects snapshots for a different room, recipient or mismatched operation', () => {
    const packet = makeStorySnapshot(create(), now);
    expect(accept({ ...packet, operationId: 'other' })).toBeUndefined();
    expect(accept({ ...packet, roomId: 'dead-air' })).toBeUndefined();
    expect(accept({ ...packet, state: { ...packet.state, players: [{ id: 'local', name: 'H' }, { id: 'outsider', name: 'O' }] } })).toBeUndefined();
  });

  it('rejects stale revisions and older games while accepting clock-only same-revision snapshots', () => {
    const start = create();
    const next = reduceStoryAction(start, { kind: 'edit', id: 'edit-one', stageIndex: 0, slot: 0, value: getStoryRoom('line-13').stages[0].answer[0] }, 'local', now + 10);
    expect(next.revision).toBeGreaterThan(start.revision);
    expect(accept(makeStorySnapshot(start, now), next)).toBeUndefined();
    expect(accept(makeStorySnapshot(next, now + 20), next)?.state.revision).toBe(next.revision);
    expect(accept(makeStorySnapshot(create('older', now - 1), now), next)).toBeUndefined();
    expect(accept(makeStorySnapshot(create('newer', now + 1), now + 1), next)?.operationId).toBe('newer');
  });

  it('cannot mutate the board or participants without a new revision and cannot extend the clock', () => {
    const state = create();
    const packet = makeStorySnapshot(state, now);
    const draft = [...state.draft]; draft[0] = getStoryRoom('line-13').stages[0].answer[0];
    expect(accept({ ...packet, state: { ...state, draft } }, state)).toBeUndefined();
    expect(accept({ ...packet, state: { ...state, deadlineAt: state.deadlineAt + 1, revision: 1 } }, state)).toBeUndefined();
    expect(accept({ ...packet, state: { ...state, seed: 1, revision: 1 } }, state)).toBeUndefined();
  });

  it('requires exact actor, operation and chapter before reducing a guest action', () => {
    const state = create();
    const action: StoryAction = { kind: 'submit', id: 'commit', stageIndex: 0 };
    expect(authenticateStoryAction(state, event(state, action), 'guest')).toEqual(action);
    expect(authenticateStoryAction(state, event(state, action), 'local')).toBeUndefined();
    expect(authenticateStoryAction(state, { ...event(state, action), operationId: 'old-game' }, 'guest')).toBeUndefined();
    expect(authenticateStoryAction(state, event(state, { ...action, stageIndex: 1 }), 'guest')).toBeUndefined();
    expect(authenticateStoryAction(state, event(state, action, 'outsider'), 'outsider')).toBeUndefined();
    expect(authenticateStoryAction(state, event(state, { ...action, kind: 'continue' }), 'guest')).toBeUndefined();
    expect(authenticateStoryAction(state, event(state, { ...action, kind: 'abort' }), 'guest')).toBeUndefined();
  });

  it('never trusts a fake completed flag or lets one player edit another role', () => {
    const state = create();
    const action: StoryAction = { kind: 'edit', id: 'steal-slot', stageIndex: 0, slot: 0, value: getStoryRoom('line-13').stages[0].answer[0] };
    expect(storyEventSchema.safeParse({ ...event(state, action), completed: true }).success).toBe(false);
    const allowedToReachEngine = authenticateStoryAction(state, event(state, action), 'guest');
    expect(allowedToReachEngine).toBeDefined();
    expect(reduceStoryAction(state, allowedToReachEngine!, 'guest', now)).toBe(state);
  });

  it('deduplicates re-delivery after an interrupted connection and expires at the original deadline', () => {
    const state = create();
    const action: StoryAction = { kind: 'edit', id: 'one-move', stageIndex: 0, slot: 0, value: getStoryRoom('line-13').stages[0].answer[0] };
    const next = reduceStoryAction(state, action, 'local', now);
    expect(reduceStoryAction(next, action, 'local', now + 500)).toBe(next);
    const expired = expireStoryState(next, next.deadlineAt + 1000);
    expect(expired.status).toBe('failed');
    expect(expired.deadlineAt).toBe(state.deadlineAt);
    expect(storyStateSchema.safeParse(expired).success).toBe(true);
  });

  it('synchronises private glass rotations without accepting another station’s choices', () => {
    const state = createStoryState('night-glass', players, 321, 'story-glass', now);
    const stage = getStoryRoom('night-glass', state.seed).stages[0];
    expect(stage.interaction?.kind).toBe('lightbox');
    const next = reduceStoryAction(state, { kind: 'edit', id: 'rotate-pipe', stageIndex: 0, slot: 1, value: stage.answer[1] }, 'guest', now);
    expect(next.draft[1]).toBe(stage.answer[1]);
    expect(makeStorySnapshot(next, now).state.draft[1]).toBe(stage.answer[1]);
    expect(reduceStoryAction(next, { kind: 'edit', id: 'wrong-pipe', stageIndex: 0, slot: 1, value: stage.answer[0] }, 'guest', now)).toBe(next);
    expect(reduceStoryAction(next, { kind: 'probe', id: 'removed-sound', stageIndex: 0, probeId: 'tap' }, 'guest', now)).toBe(next);
    const guestModel = projectStoryView(next, 'guest').stage.interaction;
    expect(guestModel?.kind).toBe('lightbox');
    if (guestModel?.kind === 'lightbox') {
      expect(guestModel.films[0]).toEqual([]);
      expect(guestModel.films[1].length).toBeGreaterThan(0);
    }
  });

  it.each([2, 3, 4])('retains a frozen %i-phone cast and allows every owner to contribute', (count) => {
    const cast = Array.from({ length: count }, (_, index) => ({ id: index === 0 ? 'local' : `guest-${index}`, name: `Player ${index + 1}` }));
    let state = createStoryState('line-13', cast, 23, 'story-cast', now);
    const stage = getStoryRoom('line-13', state.seed).stages[0];
    const contributed = new Set<string>();
    stage.slots.forEach((slot, index) => {
      const owner = cast[slot.seat % count].id;
      const action: StoryAction = { kind: 'edit', id: `owned-${index}`, stageIndex: 0, slot: index, value: stage.answer[index] };
      const accepted = authenticateStoryAction(state, event(state, action, owner), owner);
      expect(accepted).toBeDefined();
      state = reduceStoryAction(state, accepted!, owner, now);
      contributed.add(owner);
    });
    expect(contributed.size).toBe(count);
    state = reduceStoryAction(state, { kind: 'submit', id: 'cast-submit', stageIndex: 0 }, cast[count - 1].id, now);
    expect(state.status).toBe('stage-solved');
    expect(makeStorySnapshot(state, now).state.players).toEqual(cast);
  });

  it('rejects malformed persisted boards and overlong or fractional network values', () => {
    const state = create();
    for (const patch of [{ stageIndex: 8 }, { draft: ['made-up'] }, { attemptsUsed: 99 }, { processedActionIds: ['repeat', 'repeat'] }, { activeProbe: 'absent' }, { status: 'won' }, { seed: -1 }]) {
      expect(storyStateSchema.safeParse({ ...state, ...patch }).success).toBe(false);
    }
    const packet = makeStorySnapshot(state, now);
    expect(storyEventSchema.safeParse({ ...packet, sentAt: 12.5 }).success).toBe(false);
    expect(storyEventSchema.safeParse({ ...packet, operationId: 'a'.repeat(65) }).success).toBe(false);
  });
});

describe('authored room checkpoints', () => {
  it('separates rooms, relay sessions, practice and phones', () => {
    const keys = [storyCheckpointKey('line-13', 'AB123', 'local'), storyCheckpointKey('night-glass', 'AB123', 'local'), storyCheckpointKey('line-13', 'CD123', 'local'), storyCheckpointKey('line-13', 'AB123', 'guest'), storyCheckpointKey('line-13', 'practice', 'local')];
    expect(new Set(keys).size).toBe(5);
  });
  it('bounds saved games to the most recent twelve and ignores corrupt or expired entries', () => {
    const entries = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`room-${index}`, { state: create(`op-${index}`), savedAt: now - index }]));
    entries.expired = { state: create(), savedAt: now - 8 * 24 * 60 * 60_000 };
    entries.future = { state: create(), savedAt: now + 2 * 60_000 };
    const kept = pruneStoryCheckpoints({ ...entries, corrupt: { state: {}, savedAt: now } }, now);
    expect(Object.keys(kept)).toHaveLength(12);
    expect(kept['room-0']).toBeDefined(); expect(kept['room-11']).toBeDefined();
    expect(kept['room-12']).toBeUndefined(); expect(kept.expired).toBeUndefined(); expect(kept.future).toBeUndefined();
  });
});
