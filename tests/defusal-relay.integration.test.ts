import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HousewireRelay } from '../server/relay';
import { LanWebSocketTransport, type WebSocketLike } from '../src/services/transport/lan-websocket';
import type { RelayResumeCredentials } from '../src/services/transport/types';
import { applyDefusalAction, createDefusalState, startDefusal, type DefusalView } from '../src/domain/defusal';
import { acceptDefusalSnapshot, defusalDeliveries, handleDefusalMessage } from '../src/features/defusal/coordinator';

const factory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for Last Light relay state.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

it('plays a complete three-phone defusal over real WebSockets, privately resyncing a disconnected Witness', async () => {
  const relay = new HousewireRelay({ host: '127.0.0.1', port: 0 });
  const address = await relay.start();
  const transports: LanWebSocketTransport[] = [];
  let witnessCredentials: RelayResumeCredentials | undefined;
  const makeTransport = (clientId: string, role: 'host' | 'guest', resumeCredentials?: RelayResumeCredentials) => {
    const transport = new LanWebSocketTransport({
      url: address.url, sessionId: 'last-light-network', clientId, role, reconnect: false, webSocketFactory: factory,
      resumeCredentials, onResumeCredentials: clientId === 'witness' ? (value) => { witnessCredentials = value; } : undefined,
    });
    transports.push(transport);
    return transport;
  };
  const host = makeTransport('local', 'host');
  const archivist = makeTransport('archivist', 'guest');
  let witness = makeTransport('witness', 'guest');
  let state = createDefusalState({ id: 'network-device', hostId: 'local', mode: 'live', seed: 345, players: [{ id: 'local', name: 'Operator' }] });
  const views = new Map<string, DefusalView>();
  const guestPackets: Record<string, unknown[]> = { archivist: [], witness: [] };
  const errors: unknown[] = [];
  let broadcastFrames = 0;
  const watch = (transport: LanWebSocketTransport, nodeId: string) => {
    transport.subscribe(() => { broadcastFrames++; });
    transport.subscribeDirect((frame) => {
      guestPackets[nodeId].push(frame.payload);
      const accepted = acceptDefusalSnapshot({ senderId: frame.senderId, localNodeId: nodeId, hostId: 'local', raw: frame.payload, current: views.get(nodeId) });
      if (accepted) views.set(nodeId, accepted.view);
    });
  };
  watch(archivist, 'archivist'); watch(witness, 'witness');
  host.subscribeDirect((frame) => {
    const result = handleDefusalMessage(state, frame.senderId, frame.payload, Date.now());
    state = result.state;
    for (const delivery of result.deliveries) void host.publishDirect(delivery.recipientId, delivery.message).catch((error) => errors.push(error));
  });
  const broadcast = async () => {
    for (const delivery of defusalDeliveries(state, Date.now())) await host.publishDirect(delivery.recipientId, delivery.message);
  };
  try {
    await host.connect(); await archivist.connect(); await witness.connect();
    await archivist.publishDirect('local', { channel: 'last-light-v1', type: 'join', name: 'Amina' });
    await waitFor(() => state.players.length === 2);
    await witness.publishDirect('local', { channel: 'last-light-v1', type: 'join', name: 'Omar' });
    await waitFor(() => state.players.length === 3);
    expect(state.players.map((player) => player.role)).toEqual(['operator', 'archivist', 'witness']);
    state = startDefusal(state, 'local', Date.now()).state;
    await broadcast();
    await waitFor(() => views.get('witness')?.status === 'playing' && views.get('archivist')?.status === 'playing');
    expect(views.get('archivist')?.module?.manual).toBeDefined(); expect(views.get('archivist')?.module?.witness).toBeUndefined();
    expect(views.get('witness')?.module?.witness).toBeDefined(); expect(views.get('witness')?.module?.manual).toBeUndefined();

    // Even knowing the complete answer, a reader cannot impersonate the Operator.
    await archivist.publishDirect('local', { channel: 'last-light-v1', type: 'action', action: { type: 'commit', actionId: 'reader-cheat', operationId: state.id, stageIndex: 0, answer: state.game.modules[0].solution } });
    await waitFor(() => JSON.stringify(guestPackets.archivist).includes('Only the Operator'));
    expect(state.stageIndex).toBe(0);

    for (let index = 0; index < 4; index++) {
      if (index === 1) {
        const resume = witnessCredentials;
        expect(resume).toBeDefined();
        await witness.disconnect();
        guestPackets.witness = [];
        witness = makeTransport('witness', 'guest', resume);
        watch(witness, 'witness'); await witness.connect();
        // Earlier private clues are not replayed. A targeted request restores only the current role.
        expect(guestPackets.witness).toHaveLength(0);
        await witness.publishDirect('local', { channel: 'last-light-v1', type: 'request' });
        await waitFor(() => guestPackets.witness.length === 1);
        expect(views.get('witness')?.stageIndex).toBe(1);
        expect(views.get('witness')?.module?.manual).toBeUndefined();
      }
      for (const [transport, actor] of [[archivist, 'archivist'], [witness, 'witness']] as const) await transport.publishDirect('local', {
        channel: 'last-light-v1', type: 'action', action: { type: 'ready', actionId: `ready-${actor}-${index}`, operationId: state.id, stageIndex: index },
      });
      await waitFor(() => state.readyNodeIds.length === 2);
      const result = applyDefusalAction(state, 'local', { type: 'commit', actionId: `solve-${index}`, operationId: state.id, stageIndex: index, answer: state.game.modules[index].solution }, Date.now());
      expect(result.accepted).toBe(true); state = result.state;
      await broadcast();
      await waitFor(() => views.get('archivist')?.stageIndex === index + 1 && views.get('witness')?.stageIndex === index + 1);
    }
    expect(state.status).toBe('defused');
    expect(views.get('archivist')?.status).toBe('defused'); expect(views.get('witness')?.status).toBe('defused');
    expect(state.strikes).toBe(0); expect(broadcastFrames).toBe(0); expect(errors).toEqual([]);
    for (const packets of Object.values(guestPackets)) { expect(JSON.stringify(packets)).not.toContain('"seed"'); expect(JSON.stringify(packets)).not.toContain('"solution"'); }
  } finally {
    await Promise.all(transports.map((transport) => transport.disconnect()));
    await relay.stop();
  }
});
