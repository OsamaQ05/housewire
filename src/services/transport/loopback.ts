import type {
  ClientRelayMessage,
  DirectDeliveryAck,
  DirectPublishOptions,
  PublishOptions,
  SessionTransport,
  TransportConnectionState,
  TransportDirectFrame,
  TransportFrame,
} from './types';
import { MAXIMUM_RELAY_MESSAGE_BYTES, utf8ByteLength } from './types';

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

interface LoopbackRoom<T, D> {
  sequence: number;
  eventIds: Map<string, TransportFrame<T>>;
  clients: Map<string, LoopbackTransport<T, D>>;
}

export class LoopbackNetwork<T = unknown, D = unknown> {
  private readonly rooms = new Map<string, LoopbackRoom<T, D>>();

  createTransport(sessionId: string, clientId: string): LoopbackTransport<T, D> {
    return new LoopbackTransport(this, sessionId, clientId);
  }

  join(transport: LoopbackTransport<T, D>): void {
    const room = this.room(transport.sessionId);
    const previous = room.clients.get(transport.clientId);
    room.clients.set(transport.clientId, transport);
    if (previous && previous !== transport) previous.replace();
  }

  leave(transport: LoopbackTransport<T, D>): void {
    const room = this.rooms.get(transport.sessionId);
    if (room?.clients.get(transport.clientId) === transport) room.clients.delete(transport.clientId);
  }

  publish(transport: LoopbackTransport<T, D>, payload: T, options: PublishOptions): TransportFrame<T> {
    const room = this.room(transport.sessionId);
    const duplicate = room.eventIds.get(options.eventId);
    if (duplicate) return duplicate;
    const frame: TransportFrame<T> = {
      type: 'frame',
      sessionId: transport.sessionId,
      sequence: ++room.sequence,
      senderId: transport.clientId,
      eventId: options.eventId,
      serverTime: options.clientSentAt ?? Date.now(),
      payload,
    };
    room.eventIds.set(options.eventId, frame);
    queueMicrotask(() => {
      for (const client of room.clients.values()) client.deliver(frame);
    });
    return frame;
  }

  publishDirect(
    transport: LoopbackTransport<T, D>,
    recipientId: string,
    messageId: string,
    payload: D,
  ): DirectDeliveryAck {
    const room = this.rooms.get(transport.sessionId);
    const recipient = room?.clients.get(recipientId);
    if (!recipient || recipient.state !== 'connected') {
      throw new LoopbackProtocolError('RECIPIENT_UNAVAILABLE', 'The selected player is not connected to this house.');
    }
    const deliveredAt = Date.now();
    const frame: TransportDirectFrame<D> = {
      type: 'direct',
      sessionId: transport.sessionId,
      senderId: transport.clientId,
      recipientId,
      messageId,
      serverTime: deliveredAt,
      payload,
    };
    recipient.deliverDirect(frame);
    return { type: 'direct.ack', messageId, recipientId, deliveredAt };
  }

  private room(sessionId: string): LoopbackRoom<T, D> {
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = { sequence: 0, eventIds: new Map(), clients: new Map() };
      this.rooms.set(sessionId, room);
    }
    return room;
  }
}

export class LoopbackTransport<T = unknown, D = unknown> implements SessionTransport<T, D> {
  private frameListeners = new Set<(frame: TransportFrame<T>) => void>();
  private directListeners = new Set<(frame: TransportDirectFrame<D>) => void>();
  private stateListeners = new Set<(state: TransportConnectionState) => void>();
  private connectionState: TransportConnectionState = 'idle';

  constructor(
    private readonly network: LoopbackNetwork<T, D>,
    readonly sessionId: string,
    readonly clientId: string,
  ) {}

  get state(): TransportConnectionState {
    return this.connectionState;
  }

  async connect(): Promise<void> {
    if (this.connectionState === 'connected') return;
    this.setState('connecting');
    this.network.join(this);
    this.setState('connected');
  }

  async disconnect(): Promise<void> {
    this.network.leave(this);
    this.setState('closed');
  }

  async publish(payload: T, options: PublishOptions): Promise<void> {
    if (this.connectionState !== 'connected') throw new Error('Loopback transport is not connected.');
    this.network.publish(this, payload, options);
  }

  async publishDirect(
    recipientId: string,
    payload: D,
    options: DirectPublishOptions = {},
  ): Promise<DirectDeliveryAck> {
    if (this.connectionState !== 'connected') throw new Error('Loopback transport is not connected.');
    const messageId = options.messageId ?? createDirectMessageId();
    if (!SAFE_ID.test(recipientId) || !SAFE_ID.test(messageId)) {
      throw new LoopbackProtocolError('INVALID_DIRECT_ID', 'Direct recipient and message ids must be relay-safe.');
    }
    let encodedPayload: D;
    try {
      const raw = JSON.stringify({
        type: 'direct',
        sessionId: this.sessionId,
        clientId: this.clientId,
        recipientId,
        messageId,
        clientSentAt: options.clientSentAt ?? Date.now(),
        payload,
      } satisfies ClientRelayMessage<T, D>);
      if (typeof raw !== 'string' || utf8ByteLength(raw) > MAXIMUM_RELAY_MESSAGE_BYTES) {
        throw new LoopbackProtocolError('MESSAGE_TOO_LARGE', 'The direct payload exceeds the relay limit.');
      }
      const encoded = JSON.parse(raw) as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(encoded, 'payload')) {
        throw new LoopbackProtocolError('INVALID_DIRECT_PAYLOAD', 'The direct payload must be JSON serializable.');
      }
      encodedPayload = encoded.payload as D;
    } catch (cause) {
      if (cause instanceof LoopbackProtocolError) throw cause;
      throw new LoopbackProtocolError('INVALID_DIRECT_PAYLOAD', 'The direct payload must be JSON serializable.');
    }
    return this.network.publishDirect(this, recipientId, messageId, encodedPayload);
  }

  subscribe(listener: (frame: TransportFrame<T>) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  subscribeDirect(listener: (frame: TransportDirectFrame<D>) => void): () => void {
    this.directListeners.add(listener);
    return () => this.directListeners.delete(listener);
  }

  subscribeState(listener: (state: TransportConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  deliver(frame: TransportFrame<T>): void {
    for (const listener of this.frameListeners) listener(frame);
  }

  deliverDirect(frame: TransportDirectFrame<D>): void {
    for (const listener of this.directListeners) listener(frame);
  }

  replace(): void {
    this.setState('closed');
  }

  private setState(state: TransportConnectionState): void {
    this.connectionState = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

function createDirectMessageId(): string {
  return `direct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

class LoopbackProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LoopbackProtocolError';
  }
}
