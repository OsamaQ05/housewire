import { expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { HousewireRelay } from '../server/relay';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import type { RelayResumeCredentials } from '../src/services/transport/types';
import { getStoryRoom } from '../src/features/story-rooms/catalog';
import { createStoryState, projectStoryView, reduceStoryAction } from '../src/features/story-rooms/engine';
import { acceptStorySnapshot, authenticateStoryAction, makeStorySnapshot, type StoryNetworkEvent } from '../src/features/story-rooms/story-protocol';
import type { StoryAction, StoryState } from '../src/features/story-rooms/types';

const socket = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;
async function waitFor(predicate: () => boolean) {
  const until = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('The revealed chapter did not synchronise.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

it('reveals only by host agreement, resumes the explanation, and restores private clues for the next chapter over real WebSockets', async () => {
  const relay = new HousewireRelay({ host: '127.0.0.1', port: 0 });
  const address = await relay.start();
  const transports: LanWebSocketTransport<StoryNetworkEvent>[] = [];
  let credentials: RelayResumeCredentials | undefined;
  const makeClient = (clientId: string, role: 'host' | 'guest', resumeCredentials?: RelayResumeCredentials) => {
    const client = new LanWebSocketTransport<StoryNetworkEvent>({
      url: address.url, sessionId: 'story-reveal-test', clientId, role,
      reconnect: false, webSocketFactory: socket, resumeCredentials,
      onResumeCredentials: clientId === 'guest' ? value => { credentials = value; } : undefined,
    });
    transports.push(client);
    return client;
  };
  const host = makeClient('host', 'host');
  let guest = makeClient('guest', 'guest');
  let state = createStoryState('line-13', [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Partner' }], 71, 'revealed-room', Date.now());
  let guestState: StoryState | undefined;
  const received: string[] = [];
  const errors: unknown[] = [];
  let serial = 0;
  const envelope = () => ({ eventId: `frame-${++serial}`, clientSentAt: Date.now() });
  const broadcast = () => host.publish(makeStorySnapshot(state, Date.now()), envelope());
  const watch = (client: LanWebSocketTransport<StoryNetworkEvent>) => client.subscribe(frame => {
    const accepted = acceptStorySnapshot({ raw: frame.payload, senderId: frame.senderId, hostNodeId: 'host', localNodeId: 'guest', roomId: 'line-13', current: guestState });
    if (accepted) guestState = accepted.state;
  });
  watch(guest);
  host.subscribe(frame => {
    if (frame.payload.kind !== 'story.action') return;
    received.push(frame.payload.action.id);
    const action = authenticateStoryAction(state, frame.payload, frame.senderId);
    if (!action) return;
    const next = reduceStoryAction(state, action, frame.senderId, Date.now());
    if (next !== state) { state = next; void broadcast().catch(error => errors.push(error)); }
  });
  const send = (client: LanWebSocketTransport<StoryNetworkEvent>, nodeId: string, action: StoryAction) => client.publish({
    kind: 'story.action', roomId: 'line-13', operationId: state.operationId, nodeId, action, sentAt: Date.now(),
  }, envelope());
  try {
    await host.connect(); await guest.connect(); await broadcast();
    await waitFor(() => Boolean(guestState));
    const reveal: StoryAction = { kind: 'reveal', id: 'reveal-chapter', stageIndex: 0 };
    await send(guest, 'guest', { ...reveal, id: 'guest-reveal' });
    await waitFor(() => received.includes('guest-reveal'));
    expect(state.assistedStages).toEqual([]);
    await send(guest, 'host', { ...reveal, id: 'forged-host' });
    await waitFor(() => received.includes('forged-host'));
    expect(state.status).toBe('playing');
    await send(host, 'host', reveal);
    await waitFor(() => guestState?.status === 'stage-solved');
    const stage = getStoryRoom('line-13', state.seed).stages[0];
    expect(guestState!.assistedStages).toEqual([0]);
    expect(guestState!.solvedStages).toEqual([]);
    expect(guestState!.draft).toEqual(stage.answer);
    expect(projectStoryView(guestState!, 'guest').stage.clues).toHaveLength(stage.clues.length);
    expect(projectStoryView(guestState!, 'guest').stage.revelation).toContain(stage.explanation);
    const revision = state.revision;
    await send(host, 'host', reveal);
    await waitFor(() => received.filter(id => id === reveal.id).length === 2);
    expect(state.revision).toBe(revision);

    expect(credentials).toBeDefined();
    await guest.disconnect(); guestState = undefined;
    guest = makeClient('guest', 'guest', credentials); watch(guest); await guest.connect(); await broadcast();
    await waitFor(() => guestState?.status === 'stage-solved');
    expect(guestState!.assistedStages).toEqual([0]);
    expect(guestState!.draft).toEqual(stage.answer);
    await send(guest, 'guest', { kind: 'continue', id: 'guest-next', stageIndex: 0 });
    await waitFor(() => received.includes('guest-next'));
    expect(state.stageIndex).toBe(0);
    await send(host, 'host', { kind: 'continue', id: 'host-next', stageIndex: 0 });
    await waitFor(() => guestState?.stageIndex === 1);
    expect(guestState!.status).toBe('playing');
    expect(guestState!.chapterAttemptsUsed).toBe(0);
    expect(guestState!.draft.every(value => value === '')).toBe(true);
    expect(projectStoryView(guestState!, 'guest').stage.clues.every(clue => clue.seat % 2 === 1)).toBe(true);
    expect(projectStoryView(guestState!, 'guest').stage.revelation).toBe('');
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(transports.map(client => client.disconnect()));
    await relay.stop();
  }
}, 20_000);
