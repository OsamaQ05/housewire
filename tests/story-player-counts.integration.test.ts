import { describe, expect, it } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { activitySolutionMoves } from './helpers/story-activity';
import { WebSocket } from 'ws';
import { HousewireRelay } from '../server/relay';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, projectStoryView, reduceStoryAction } from '../src/features/story-rooms/engine';
import { filmComposite, optionsForSlot } from '../src/features/story-rooms/interaction-rules';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, storyStateSchema, type StoryNetworkEvent } from '../src/features/story-rooms/story-protocol';
import { STORY_ROOM_IDS, type StoryAction, type StoryRoomId, type StoryState } from '../src/features/story-rooms/types';

const socket = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;
async function waitFor(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Player-count integration timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function playWithPhones(roomId: StoryRoomId, phoneCount: number) {
  const relay = new HousewireRelay({ host: '127.0.0.1', port: 0 });
  const address = await relay.start();
  const players = Array.from({ length: phoneCount }, (_, seat) => ({ id: `phone-${seat}`, name: `Family ${seat + 1}` }));
  const clients = players.map((player, seat) => new LanWebSocketTransport<StoryNetworkEvent>({
    url: address.url, sessionId: `party-${roomId}-${phoneCount}`, clientId: player.id,
    role: seat === 0 ? 'host' : 'guest', reconnect: false, webSocketFactory: socket,
  }));
  let authoritative = createStoryState(roomId, players, 9183, `party-${roomId}-${phoneCount}`, Date.now());
  const room = getStoryRoom(roomId, authoritative.seed);
  const snapshots: (StoryState | undefined)[] = players.map(() => undefined);
  const receivedActions = new Set<string>();
  const errors: unknown[] = [];
  let frame = 0;
  let action = 0;
  const packetOptions = () => ({ eventId: `party-frame-${++frame}`, clientSentAt: Date.now() });
  const nextId = () => `party-action-${++action}`;
  const broadcast = () => clients[0].publish(makeStorySnapshot(authoritative, Date.now()), packetOptions());
  const allSynced = () => snapshots.every(snapshot => snapshot?.revision === authoritative.revision);

  clients.forEach((client, seat) => client.subscribe(event => {
    const accepted = acceptStorySnapshot({ raw: event.payload, senderId: event.senderId, hostNodeId: players[0].id,
      localNodeId: players[seat].id, roomId, current: snapshots[seat] });
    if (accepted) snapshots[seat] = accepted.state;
  }));
  clients[0].subscribe(event => {
    if (event.payload.kind !== 'story.action') return;
    receivedActions.add(event.payload.action.id);
    const accepted = authenticateStoryAction(authoritative, event.payload, event.senderId);
    if (!accepted) return;
    const next = reduceStoryAction(authoritative, accepted, event.senderId, Date.now());
    if (next !== authoritative) {
      authoritative = next;
      void broadcast().catch(error => errors.push(error));
    }
  });
  const send = (seat: number, next: StoryAction) => clients[seat].publish({
    kind: 'story.action', roomId, operationId: authoritative.operationId,
    nodeId: players[seat].id, action: next, sentAt: Date.now(),
  }, packetOptions());
  const sendAndSync = async (seat: number, next: StoryAction) => {
    const revision = authoritative.revision;
    await send(seat, next);
    await waitFor(() => receivedActions.has(next.id) && authoritative.revision > revision && allSynced(), next.id);
    expect(errors).toEqual([]);
  };
  const expectEqualSnapshots = () => {
    const canonical = storyStateSchema.parse(authoritative);
    snapshots.forEach(snapshot => expect(snapshot).toEqual(canonical));
  };

  try {
    // Connect the host first so all subsequent phones join an existing room.
    await clients[0].connect();
    for (const client of clients.slice(1)) await client.connect();
    await broadcast();
    await waitFor(allSynced, 'initial shared board');
    expectEqualSnapshots();

    for (const [chapter, stage] of room.stages.entries()) {
      expect(authoritative.stageIndex).toBe(chapter);
      for (let seat = 0; seat < phoneCount; seat++) {
        const view = projectStoryView(snapshots[seat]!, players[seat].id);
        expect(view.ownedSlots.length).toBeGreaterThan(0);
        expect(view.ownedSlots.every(slot => stage.slots[slot].seat % phoneCount === seat)).toBe(true);
        expect(view.stage.clues.every(clue => clue.seat % phoneCount === seat)).toBe(true);
        if (stage.interaction?.kind !== 'lightbox' && !isActivityKind(stage.interaction?.kind)) expect(view.stage.clues.length).toBeGreaterThan(0);

        // Even the host cannot place pieces in another family member's controls.
        const forbiddenSlot = stage.slots.findIndex(slot => slot.seat % phoneCount !== seat);
        expect(forbiddenSlot).toBeGreaterThanOrEqual(0);
        const before = authoritative;
        const otherMove = isActivityKind(stage.interaction?.kind) ? activitySolutionMoves(stage.interaction.kind).find(move => stage.slots[move.control].seat % phoneCount !== seat)! : undefined;
        const invalid: StoryAction = otherMove ? { kind: 'act', id: nextId(), stageIndex: chapter, ...otherMove } : { kind: 'edit', id: nextId(), stageIndex: chapter,
          slot: forbiddenSlot, value: stage.answer[forbiddenSlot] };
        await send(seat, invalid);
        await waitFor(() => receivedActions.has(invalid.id), 'reject another phone’s control');
        expect(authoritative).toBe(before);
        expectEqualSnapshots();
      }

      if (stage.interaction?.kind === 'lightbox') {
        // Glass is already placed at 0 degrees: the very first tap really rotates.
        expect(authoritative.draft.every((value, slot) => optionsForSlot(stage, slot).find(option => option.id === value)?.turn === 0)).toBe(true);
        for (let seat = 0; seat < phoneCount; seat++) {
          const view = projectStoryView(snapshots[seat]!, players[seat].id);
          const glass = view.stage.interaction;
          expect(glass?.kind).toBe('lightbox');
          if (glass?.kind !== 'lightbox') throw new Error('Missing private glass projection');
          glass.films.forEach((film, slot) => {
            if (view.ownedSlots.includes(slot)) expect(film.length).toBeGreaterThan(0);
            else expect(film).toEqual([]);
          });
          expect(glass.preview).toEqual(filmComposite(stage, authoritative.draft));
        }
        for (let slot = 0; slot < stage.slots.length; slot++) {
          const owner = stage.slots[slot].seat % phoneCount;
          const beforeValue = authoritative.draft[slot];
          const beforePicture = filmComposite(stage, authoritative.draft);
          const quarterTurn = optionsForSlot(stage, slot).find(option => option.turn === 1)!;
          await sendAndSync(owner, { kind: 'edit', id: nextId(), stageIndex: chapter, slot, value: quarterTurn.id });
          expect(authoritative.draft[slot]).not.toBe(beforeValue);
          expect(filmComposite(stage, authoritative.draft)).not.toEqual(beforePicture);
          for (let seat = 0; seat < phoneCount; seat++) {
            const projected = projectStoryView(snapshots[seat]!, players[seat].id).stage.interaction;
            if (projected?.kind !== 'lightbox') throw new Error('Lost shared light picture');
            expect(projected.preview).toEqual(filmComposite(stage, authoritative.draft));
          }
        }
        expect(authoritative.attemptsUsed).toBe(0);
      }

      if (isActivityKind(stage.interaction?.kind)) {
        for (const move of activitySolutionMoves(stage.interaction.kind)) {
          await sendAndSync(stage.slots[move.control].seat % phoneCount, { kind: 'act', id: nextId(), stageIndex: chapter, ...move });
          expectEqualSnapshots();
        }
      }
      for (let slot = 0; !isActivityKind(stage.interaction?.kind) && slot < stage.slots.length; slot++) {
        const owner = stage.slots[slot].seat % phoneCount;
        await sendAndSync(owner, { kind: 'edit', id: nextId(), stageIndex: chapter, slot, value: stage.answer[slot] });
      }
      expect(authoritative.draft).toEqual(stage.answer);
      // A different guest submits each chapter; only progression is host-controlled.
      await sendAndSync(1 + chapter % (phoneCount - 1), { kind: 'submit', id: nextId(), stageIndex: chapter });
      expect(authoritative.status).toBe(chapter === room.stages.length - 1 ? 'won' : 'stage-solved');
      expectEqualSnapshots();
      if (chapter < room.stages.length - 1) {
        await sendAndSync(0, { kind: 'continue', id: nextId(), stageIndex: chapter });
        expect(authoritative.stageIndex).toBe(chapter + 1);
        expect(authoritative.status).toBe('playing');
        expectEqualSnapshots();
      }
    }
    expect(authoritative.status).toBe('won');
    expect(authoritative.solvedStages).toEqual(room.stages.map((_, index) => index));
    expect(authoritative.assistedStages).toEqual([]);
    expect(authoritative.attemptsUsed).toBe(0);
    expectEqualSnapshots();
    snapshots.forEach((snapshot, seat) => expect(projectStoryView(snapshot!, players[seat].id).room.ending).toBe(room.ending));
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(clients.map(client => client.disconnect()));
    await relay.stop();
  }
}

describe('every authored room across 2, 3, and 4 actual WebSocket clients', () => {
  for (const roomId of STORY_ROOM_IDS) {
    for (const phoneCount of [2, 3, 4]) {
      it(`${roomId}: ${phoneCount} phones finish together with private controls`, async () => {
        await playWithPhones(roomId, phoneCount);
      }, 20_000);
    }
  }
});
