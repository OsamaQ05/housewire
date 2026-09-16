import { expect, it } from 'vitest';
import { isActivityKind } from '../src/features/story-rooms/activities/contracts';
import { activitySolutionMoves } from './helpers/story-activity';
import { WebSocket } from 'ws';

import { HousewireRelay } from '../server/relay';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import type { RelayResumeCredentials } from '../src/services/transport/types';
import { housewireSessionEventSchema } from '../src/features/session/protocol';
import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, projectStoryView, reduceStoryAction } from '../src/features/story-rooms/engine';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, type StoryNetworkEvent } from '../src/features/story-rooms/story-protocol';
import { STORY_ROOM_IDS, type StoryAction, type StoryRoomId, type StoryState } from '../src/features/story-rooms/types';

const factory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for shared authored-room state.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function playOverNetwork(roomId: StoryRoomId, exhaustAttempts = false) {
  const relay = new HousewireRelay({ host: '127.0.0.1', port: 0 });
  const address = await relay.start();
  const transports: LanWebSocketTransport<StoryNetworkEvent>[] = [];
  let guestCredentials: RelayResumeCredentials | undefined;
  const createTransport = (clientId: string, role: 'host' | 'guest', resumeCredentials?: RelayResumeCredentials) => {
    const transport = new LanWebSocketTransport<StoryNetworkEvent>({ url: address.url, sessionId: 'story-two-phones', clientId, role,
      reconnect: false, webSocketFactory: factory, resumeCredentials,
      onResumeCredentials: clientId === 'guest' ? (value) => { guestCredentials = value; } : undefined });
    transports.push(transport); return transport;
  };
  const host = createTransport('local', 'host');
  let guest = createTransport('guest', 'guest');
  let state = createStoryState(roomId, [{ id: 'local', name: 'Host' }, { id: 'guest', name: 'Partner' }], 8871, `story-live-${roomId}`, Date.now());
  let guestState: StoryState | undefined;
  const readGuestState = (): StoryState | undefined => guestState;
  const packets: StoryNetworkEvent[] = [];
  const errors: unknown[] = [];
  let frameId = 0;
  const options = () => ({ eventId: `story-frame-${++frameId}`, clientSentAt: Date.now() });
  const broadcast = () => host.publish(makeStorySnapshot(state, Date.now()), options());
  const watchGuest = (transport: LanWebSocketTransport<StoryNetworkEvent>) => transport.subscribe((frame) => {
    const accepted = acceptStorySnapshot({ raw: frame.payload, senderId: frame.senderId, hostNodeId: 'local', localNodeId: 'guest', roomId, current: guestState });
    if (accepted) guestState = accepted.state;
  });
  watchGuest(guest);
  host.subscribe((frame) => {
    packets.push(frame.payload);
    if (!housewireSessionEventSchema.safeParse(frame.payload).success) return;
    const action = authenticateStoryAction(state, frame.payload, frame.senderId);
    if (action) {
      const next = reduceStoryAction(state, action, frame.senderId, Date.now());
      if (next !== state) { state = next; void broadcast().catch((error) => errors.push(error)); }
    } else if (frame.payload.kind === 'story.request' && frame.senderId === frame.payload.nodeId && state.players.some((player) => player.id === frame.senderId)) {
      void broadcast().catch((error) => errors.push(error));
    }
  });
  let actionCount = 0;
  const send = async (transport: LanWebSocketTransport<StoryNetworkEvent>, nodeId: string, action: StoryAction) => {
    await transport.publish({ kind: 'story.action', roomId, operationId: state.operationId, nodeId, sentAt: Date.now(), action }, options());
  };
  const nextId = () => `story-action-${++actionCount}`;
  try {
    await host.connect(); await guest.connect(); await broadcast();
    await waitFor(() => guestState?.operationId === state.operationId);
    const privateView = projectStoryView(guestState!, 'guest');
    expect(privateView.ownedSlots).not.toContain(0);
    expect(privateView.stage.clues.every((clue) => clue.seat % 2 === 1)).toBe(true);

    // A fabricated success and a forged host identity never modify the authoritative draft.
    await guest.publish(makeStorySnapshot({ ...state, revision: 99 }, Date.now()), options());
    const cheatId = nextId();
    await send(guest, 'local', { kind: 'edit', id: cheatId, stageIndex: 0, slot: 0, value: getStoryRoom(roomId).stages[0].answer[0] });
    await waitFor(() => packets.some((packet) => packet.kind === 'story.action' && packet.action.id === cheatId));
    expect(state.revision).toBe(0); expect(guestState?.revision).toBe(0);

    const room = getStoryRoom(roomId, state.seed);
    if (exhaustAttempts) {
      const stage = room.stages[0];
      const place = async (draft: string[]) => {
        for (let slot = 0; slot < stage.slots.length; slot++) {
          const owner = stage.slots[slot].seat % 2 === 0 ? 'local' : 'guest';
          const before = state.revision;
          await send(owner === 'local' ? host : guest, owner, { kind: 'edit', id: nextId(), stageIndex: 0, slot, value: draft[slot] });
          await waitFor(() => Boolean(guestState && guestState.revision > before && guestState.draft[slot] === draft[slot]));
        }
      };
      let before = state.revision;
      await send(guest, 'guest', { kind: 'submit', id: nextId(), stageIndex: 0 });
      await waitFor(() => Boolean(guestState && guestState.revision > before));
      expect(state.attemptsUsed).toBe(0);
      expect(state.feedback).toContain('No attempt used');

      await place(stage.answer.map(() => stage.answer[0]));
      before = state.revision;
      await send(guest, 'guest', { kind: 'submit', id: nextId(), stageIndex: 0 });
      await waitFor(() => Boolean(guestState && guestState.revision > before));
      expect(state.attemptsUsed).toBe(0);
      expect(state.feedback).toContain('used once');

      const incorrectPlans: string[][] = [];
      for (let first = 0; first < stage.answer.length; first++) {
        for (let second = first + 1; second < stage.answer.length; second++) {
          const plan = [...stage.answer];
          [plan[first], plan[second]] = [plan[second], plan[first]];
          incorrectPlans.push(plan);
        }
      }
      for (let attempt = 0; attempt < room.attemptLimit; attempt++) {
        await place(incorrectPlans[attempt]);
        await send(guest, 'guest', { kind: 'submit', id: nextId(), stageIndex: 0 });
        await waitFor(() => guestState?.attemptsUsed === attempt + 1);
        expect(state.attemptsUsed).toBe(attempt + 1);
        expect(state.status).toBe(attempt === room.attemptLimit - 1 ? 'failed' : 'playing');
        expect(state.feedback!.length).toBeLessThan(200);
        expect(state.feedback).not.toMatch(/\b[0-4] (correct|right|wrong)\b/i);
        for (const option of stage.options) expect(state.feedback).not.toContain(option.label);

        if (state.status === 'playing') {
          // A second phone submitting the same complete plan does not consume another try.
          before = state.revision;
          await send(host, 'local', { kind: 'submit', id: nextId(), stageIndex: 0 });
          await waitFor(() => Boolean(guestState && guestState.revision > before));
          expect(state.attemptsUsed).toBe(attempt + 1);
          expect(state.feedback).toContain('already tested');
        }
      }
      expect(guestState?.status).toBe('failed');
      expect(guestState?.endedAt).toBe(state.endedAt);
      expect(state.endedAt).toBeTypeOf('number');
      const failedView = projectStoryView(guestState!, 'guest');
      expect(failedView.stage.revelation).toContain(stage.explanation);
      for (const optionId of stage.answer) expect(failedView.stage.revelation).toContain(stage.options.find(option => option.id === optionId)!.label);
      expect(failedView.stage).not.toHaveProperty('answer');
      expect(failedView.stage).not.toHaveProperty('constraints');

      const failedRevision = state.revision;
      const late = nextId();
      await send(guest, 'guest', { kind: 'edit', id: late, stageIndex: 0, slot: 1, value: stage.answer[1] });
      await waitFor(() => packets.some(packet => packet.kind === 'story.action' && packet.action.id === late));
      expect(state.revision).toBe(failedRevision);
      expect(errors).toEqual([]);
      for (const packet of packets) if (packet.kind === 'story.snapshot') expect(JSON.stringify(packet)).not.toMatch(/"(?:answer|constraints|clues|stages|explanation)"/);
      return;
    }
    for (let chapter = 0; chapter < room.stages.length; chapter++) {
      if (chapter === 1) {
        const credentials = guestCredentials;
        expect(credentials).toBeDefined();
        await guest.disconnect(); guestState = undefined;
        guest = createTransport('guest', 'guest', credentials); watchGuest(guest); await guest.connect();
        await guest.publish({ kind: 'story.request', roomId, nodeId: 'guest', sentAt: Date.now(), knownOperationId: state.operationId }, options());
        await waitFor(() => guestState?.stageIndex === 1);
        expect(readGuestState()?.players).toEqual(state.players);
        expect(readGuestState()?.deadlineAt).toBe(state.deadlineAt);
      }
      const stage = room.stages[chapter];
      if (roomId === 'night-glass' && chapter === 0) {
        expect(stage.interaction?.kind).toBe('lightbox');
        expect(stage.constraints).toEqual([]);
        expect(stage.clues).toEqual([]);
        const privatePipes = projectStoryView(guestState!, 'guest').stage.interaction;
        expect(privatePipes?.kind).toBe('lightbox');
        if (privatePipes?.kind === 'lightbox') {
          expect(privatePipes.films[0]).toEqual([]);
          expect(privatePipes.films[1].length).toBeGreaterThan(0);
        }
        const badRotation = nextId();
        const originalRevision = state.revision;
        await send(guest, 'guest', { kind: 'edit', id: badRotation, stageIndex: 0, slot: 1, value: stage.answer[0] });
        await waitFor(() => packets.some(packet => packet.kind === 'story.action' && packet.action.id === badRotation));
        expect(state.revision).toBe(originalRevision);
      }
      for (const [index, experiment] of (stage.experiments ?? []).entries()) {
        const sender = index % 2 === 0 ? guest : host;
        const senderId = index % 2 === 0 ? 'guest' : 'local';
        await send(sender, senderId, { kind: 'probe', id: nextId(), stageIndex: chapter, probeId: experiment.id });
        await waitFor(() => guestState?.activeProbe === experiment.id);
        expect(state.activeProbe).toBe(experiment.id);
        expect(state.attemptsUsed).toBe(0);
        const observations = [projectStoryView(state, 'local'), projectStoryView(guestState!, 'guest')]
          .flatMap(view => view.stage.clues.flatMap(clue => clue.observations ?? []));
        expect(observations.length).toBeGreaterThan(0);
        expect(observations.every(observation => observation.probeId === experiment.id)).toBe(true);
      }
      if (isActivityKind(stage.interaction?.kind)) {
        for (const move of activitySolutionMoves(stage.interaction.kind)) {
          const player = state.players[stage.slots[move.control].seat % state.players.length].id;
          const physical: StoryAction = { kind: 'act', id: nextId(), stageIndex: chapter, ...move };
          const before = state.revision;
          await send(player === 'local' ? host : guest, player, physical);
          await waitFor(() => Boolean(guestState && guestState.revision > before && state.processedActionIds.includes(physical.id)));
          expect(guestState!.activity).toEqual(state.activity);
        }
      }
      for (let slot = 0; !isActivityKind(stage.interaction?.kind) && slot < stage.slots.length; slot++) {
        const id = stage.slots[slot].seat % 2 === 0 ? 'local' : 'guest';
        const action: StoryAction = { kind: 'edit', id: nextId(), stageIndex: chapter, slot, value: stage.answer[slot] };
        const beforeEdit = state.revision;
        await send(id === 'local' ? host : guest, id, action);
        // Glass starts with real zero-turn values. A matching draft alone can
        // already be true before this edit reaches the host; await its receipt
        // before testing duplicate-action idempotency.
        await waitFor(() => Boolean(guestState && guestState.revision > beforeEdit && state.processedActionIds.includes(action.id) && guestState.draft[slot] === stage.answer[slot]));
        expect(state.revision).toBe(beforeEdit + 1);
        const revision = state.revision;
        await send(id === 'local' ? host : guest, id, action);
        await waitFor(() => packets.filter((packet) => packet.kind === 'story.action' && packet.action.id === action.id).length === 2);
        expect(state.revision).toBe(revision);
      }
      await send(guest, 'guest', { kind: 'submit', id: nextId(), stageIndex: chapter });
      await waitFor(() => guestState?.status === (chapter === room.stages.length - 1 ? 'won' : 'stage-solved'));
      if (chapter < room.stages.length - 1) {
        await send(host, 'local', { kind: 'continue', id: nextId(), stageIndex: chapter });
        await waitFor(() => guestState?.stageIndex === chapter + 1 && guestState.status === 'playing');
        expect(state.activeProbe).toBeUndefined();
      }
    }
    expect(state.status).toBe('won'); expect(guestState?.status).toBe('won');
    expect(state.attemptsUsed).toBe(0); expect(errors).toEqual([]);
    expect(state.solvedStages).toEqual(room.stages.map((_, index) => index));
    expect(guestState?.endedAt).toBe(state.endedAt);
    expect(projectStoryView(guestState!, 'guest').room.ending).toBe(room.ending);
    for (const packet of packets) if (packet.kind === 'story.snapshot') expect(JSON.stringify(packet)).not.toMatch(/"(?:answer|constraints|clues|stages|explanation)"/);
  } finally {
    await Promise.all(transports.map((transport) => transport.disconnect())); await relay.stop();
  }
}

it.each(STORY_ROOM_IDS)('completes every %s chapter across real WebSockets, including role resume and private physical pieces', async roomId => {
  await playOverNetwork(roomId);
}, 20_000);

it('exhausts the bounded shared attempt budget without a correctness oracle, then reveals the failed solution', async () => {
  await playOverNetwork('line-13', true);
}, 20_000);
