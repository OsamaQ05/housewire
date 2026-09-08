import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { MAXIMUM_RELAY_MESSAGE_BYTES } from '../src/services/transport/types';
import type {
  ClientRelayMessage,
  RelayCapability,
  RelayClientRole,
  ServerRelayMessage,
  TransportDirectFrame,
  TransportFrame,
} from '../src/services/transport/types';

interface ClientIdentity {
  sessionId: string;
  clientId: string;
  role: RelayClientRole;
  supportsDirect: boolean;
}

interface RelayRoom<T> {
  sequence: number;
  epoch: string;
  clients: Map<string, WebSocket>;
  hostClientId?: string;
  identities: Map<string, RelayIdentityClaim>;
  history: TransportFrame<T>[];
  events: Map<string, TransportFrame<T>>;
}

interface RelayIdentityClaim {
  credentialDigest: Buffer;
  role: RelayClientRole;
}

export interface HousewireRelayOptions {
  port?: number;
  host?: string;
  historyLimit?: number;
  maximumMessageBytes?: number;
  now?: () => number;
}

export interface RelayAddress {
  host: string;
  port: number;
  url: string;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESUME_CREDENTIAL = /^[a-zA-Z0-9_-]{43}$/;

export class HousewireRelay<T = unknown, D = unknown> {
  private readonly options: HousewireRelayOptions;
  private server?: WebSocketServer;
  private readonly rooms = new Map<string, RelayRoom<T>>();
  private readonly identities = new WeakMap<WebSocket, ClientIdentity>();
  private readonly historyLimit: number;
  private readonly maximumMessageBytes: number;
  private readonly now: () => number;

  constructor(options: HousewireRelayOptions = {}) {
    this.options = options;
    this.historyLimit = Math.max(16, options.historyLimit ?? 512);
    this.maximumMessageBytes = Math.min(
      MAXIMUM_RELAY_MESSAGE_BYTES,
      Math.max(1_024, options.maximumMessageBytes ?? MAXIMUM_RELAY_MESSAGE_BYTES),
    );
    this.now = options.now ?? Date.now;
  }

  async start(): Promise<RelayAddress> {
    if (this.server) throw new Error('Relay is already running.');
    const host = this.options.host ?? '0.0.0.0';
    const server = new WebSocketServer({ port: this.options.port ?? 0, host, maxPayload: this.maximumMessageBytes });
    this.server = server;
    server.on('connection', (socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Relay did not expose a TCP address.');
    const publicHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    return { host: publicHost, port: address.port, url: `ws://${publicHost}:${address.port}` };
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    for (const client of server.clients) client.close(1_001, 'Relay shutting down');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.server = undefined;
    this.rooms.clear();
  }

  private handleConnection(socket: WebSocket): void {
    socket.on('message', (data) => this.handleRawMessage(socket, data));
    socket.on('close', () => this.leave(socket));
    socket.on('error', () => this.leave(socket));
  }

  private handleRawMessage(socket: WebSocket, raw: RawData): void {
    const byteLength = Array.isArray(raw)
      ? raw.reduce((total, part) => total + part.byteLength, 0)
      : raw.byteLength;
    if (byteLength > this.maximumMessageBytes) {
      this.send(socket, { type: 'error', code: 'MESSAGE_TOO_LARGE', message: 'Relay message exceeds the size limit.' });
      socket.close(1_009, 'Message too large');
      return;
    }
    let parsed: unknown;
    try {
      const serialized = Array.isArray(raw) ? Buffer.concat(raw).toString() : raw.toString();
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      this.send(socket, { type: 'error', code: 'INVALID_JSON', message: 'Relay messages must be valid JSON.' });
      return;
    }

    if (!isClientRelayMessage<T, D>(parsed)) {
      this.send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Relay message has an invalid shape.' });
      return;
    }
    const message = parsed;

    if (!this.isValidIdentity(message.sessionId, message.clientId)) {
      this.send(socket, { type: 'error', code: 'INVALID_ID', message: 'Session and client ids have an invalid format.' });
      return;
    }

    if (message.type === 'join') {
      this.join(
        socket,
        message.sessionId,
        message.clientId,
        message.lastSequence,
        message.lastRoomEpoch,
        message.role,
        message.resumeCredential,
        message.capabilities,
      );
      return;
    }
    const identity = this.identities.get(socket);
    const activeSocket = identity
      ? this.rooms.get(identity.sessionId)?.clients.get(identity.clientId)
      : undefined;
    if (
      !identity ||
      identity.sessionId !== message.sessionId ||
      identity.clientId !== message.clientId ||
      activeSocket !== socket
    ) {
      this.send(socket, { type: 'error', code: 'NOT_JOINED', message: 'Join the requested room before sending events.' });
      return;
    }
    if (message.type === 'ping') {
      this.send(socket, {
        type: 'pong',
        pingId: message.pingId,
        clientTime: message.clientTime,
        serverTime: this.now(),
      });
      return;
    }
    if (message.type === 'publish') this.publish(socket, message);
    if (message.type === 'direct') this.publishDirect(socket, identity, message);
  }

  private join(
    socket: WebSocket,
    sessionId: string,
    clientId: string,
    lastSequence: number,
    lastRoomEpoch?: string,
    requestedRole?: RelayClientRole,
    resumeCredential?: string,
    requestedCapabilities?: RelayCapability[],
  ): void {
    this.leave(socket);
    const existingRoom = this.rooms.get(sessionId);
    if (!requestedRole) {
      this.rejectJoin(socket, 'ROLE_REQUIRED', 'Choose a host, guest, or probe role before joining.');
      return;
    }
    const role = requestedRole;
    const existingClaim = existingRoom?.identities.get(clientId);

    if (existingClaim) {
      if (existingClaim.role !== role) {
        this.rejectJoin(socket, 'ROLE_MISMATCH', 'A reconnect cannot change this phone\'s room role.');
        return;
      }
      if (!resumeCredential) {
        this.rejectJoin(socket, 'RESUME_REQUIRED', 'This phone identity already exists and requires its private reconnect proof.');
        return;
      }
      if (!matchesResumeCredential(existingClaim.credentialDigest, resumeCredential)) {
        this.rejectJoin(socket, 'INVALID_RESUME', 'The reconnect proof does not match this phone identity.');
        return;
      }
    } else if (resumeCredential) {
      const roomWasReset = Boolean(lastRoomEpoch) && (!existingRoom || existingRoom.epoch !== lastRoomEpoch);
      this.rejectJoin(
        socket,
        roomWasReset ? 'ROOM_RESET' : 'INVALID_RESUME',
        roomWasReset
          ? 'The relay restarted and no longer recognizes this private reconnect proof.'
          : 'A reconnect proof cannot claim a different room or phone identity.',
      );
      return;
    }

    if (!existingClaim && role !== 'host' && (!existingRoom || !this.hasActiveHost(existingRoom))) {
      this.send(socket, {
        type: 'error',
        code: 'ROOM_NOT_FOUND',
        message: 'No active host is using that house code on this relay.',
      });
      socket.close(4_404, 'House not found');
      return;
    }

    if (
      !existingClaim &&
      role === 'guest' &&
      existingRoom &&
      this.claimedPlayerCount(existingRoom) >= 4
    ) {
      this.send(socket, {
        type: 'error',
        code: 'ROOM_FULL',
        message: 'This house already has four active phones.',
      });
      socket.close(4_413, 'House full');
      return;
    }

    const room = existingRoom ?? this.room(sessionId);
    if (!existingClaim && role === 'host') {
      if (room.hostClientId !== undefined) {
        this.rejectJoin(socket, 'HOST_EXISTS', 'That house code is permanently bound to its original host phone.');
        return;
      }
      room.hostClientId = clientId;
    }

    const issuedCredential = existingClaim ? undefined : createResumeCredential();
    const claim = existingClaim ?? {
      credentialDigest: digestResumeCredential(issuedCredential!),
      role,
    };
    if (!existingClaim) room.identities.set(clientId, claim);

    const previousSocket = room.clients.get(clientId);
    room.clients.set(clientId, socket);
    this.identities.set(socket, {
      sessionId,
      clientId,
      role,
      supportsDirect: requestedCapabilities?.includes('direct-v1') ?? false,
    });
    if (previousSocket && previousSocket !== socket) previousSocket.close(4_001, 'Connection replaced');

    this.send(socket, {
      type: 'joined',
      sessionId,
      clientId,
      latestSequence: room.sequence,
      roomEpoch: room.epoch,
      role,
      resumeCredential: resumeCredential ?? issuedCredential!,
      capabilities: ['direct-v1'],
      maximumMessageBytes: this.maximumMessageBytes,
      serverTime: this.now(),
    });
    const replayFrom = lastRoomEpoch === undefined || lastRoomEpoch === room.epoch
      ? Math.max(0, lastSequence)
      : 0;
    for (const frame of room.history) {
      if (frame.sequence > replayFrom) this.send(socket, frame);
    }
  }

  private publish(
    socket: WebSocket,
    message: Extract<ClientRelayMessage<T, D>, { type: 'publish' }>,
  ): void {
    if (!SAFE_ID.test(message.eventId)) {
      this.send(socket, { type: 'error', code: 'INVALID_EVENT_ID', message: 'Event id has an invalid format.' });
      return;
    }
    const room = this.room(message.sessionId);
    const existing = room.events.get(message.eventId);
    if (existing) {
      this.send(socket, existing);
      return;
    }
    const frame: TransportFrame<T> = {
      type: 'frame',
      sessionId: message.sessionId,
      sequence: ++room.sequence,
      senderId: message.clientId,
      eventId: message.eventId,
      serverTime: this.now(),
      payload: message.payload,
    };
    room.events.set(frame.eventId, frame);
    room.history.push(frame);
    while (room.history.length > this.historyLimit) {
      const removed = room.history.shift();
      if (removed) room.events.delete(removed.eventId);
    }
    for (const client of room.clients.values()) this.send(client, frame);
  }

  private publishDirect(
    socket: WebSocket,
    sender: ClientIdentity,
    message: Extract<ClientRelayMessage<T, D>, { type: 'direct' }>,
  ): void {
    if (!SAFE_ID.test(message.recipientId) || !SAFE_ID.test(message.messageId)) {
      this.send(socket, {
        type: 'direct.nack',
        messageId: message.messageId,
        recipientId: message.recipientId,
        code: 'INVALID_DIRECT_ID',
        message: 'Direct recipient and message ids must be relay-safe.',
      });
      return;
    }
    if (sender.role === 'probe') {
      this.send(socket, {
        type: 'direct.nack',
        messageId: message.messageId,
        recipientId: message.recipientId,
        code: 'DIRECT_FORBIDDEN',
        message: 'Probe connections cannot send direct messages.',
      });
      return;
    }

    const room = this.rooms.get(message.sessionId);
    const recipient = room?.clients.get(message.recipientId);
    const recipientIdentity = recipient ? this.identities.get(recipient) : undefined;
    if (
      !recipient ||
      recipient.readyState !== WebSocket.OPEN ||
      recipientIdentity?.sessionId !== message.sessionId ||
      recipientIdentity.clientId !== message.recipientId ||
      recipientIdentity.role === 'probe'
    ) {
      this.send(socket, {
        type: 'direct.nack',
        messageId: message.messageId,
        recipientId: message.recipientId,
        code: 'RECIPIENT_UNAVAILABLE',
        message: 'The selected player is not connected to this house.',
      });
      return;
    }
    if (!recipientIdentity.supportsDirect) {
      this.send(socket, {
        type: 'direct.nack',
        messageId: message.messageId,
        recipientId: message.recipientId,
        code: 'RECIPIENT_UNSUPPORTED',
        message: 'The selected player must update before receiving private direct messages.',
      });
      return;
    }

    const deliveredAt = this.now();
    const frame: TransportDirectFrame<D> = {
      type: 'direct',
      sessionId: message.sessionId,
      senderId: message.clientId,
      recipientId: message.recipientId,
      messageId: message.messageId,
      serverTime: deliveredAt,
      payload: message.payload,
    };
    if (!this.send(recipient, frame)) {
      this.send(socket, {
        type: 'direct.nack',
        messageId: message.messageId,
        recipientId: message.recipientId,
        code: 'RECIPIENT_UNAVAILABLE',
        message: 'The selected player disconnected before delivery.',
      });
      return;
    }
    this.send(socket, {
      type: 'direct.ack',
      messageId: message.messageId,
      recipientId: message.recipientId,
      deliveredAt,
    });
  }

  private leave(socket: WebSocket): void {
    const identity = this.identities.get(socket);
    if (!identity) return;
    const room = this.rooms.get(identity.sessionId);
    if (room?.clients.get(identity.clientId) === socket) {
      room.clients.delete(identity.clientId);
      // Probes are one-shot admission checks, not durable player identities.
      if (identity.role === 'probe') room.identities.delete(identity.clientId);
    }
    this.identities.delete(socket);
  }

  private room(sessionId: string): RelayRoom<T> {
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = {
        sequence: 0,
        epoch: `room-${randomUUID().replaceAll('-', '')}`,
        clients: new Map(),
        identities: new Map(),
        history: [],
        events: new Map(),
      };
      this.rooms.set(sessionId, room);
    }
    return room;
  }

  private hasActiveHost(room: RelayRoom<T>): boolean {
    if (!room.hostClientId) return false;
    return room.clients.get(room.hostClientId)?.readyState === WebSocket.OPEN;
  }

  private claimedPlayerCount(room: RelayRoom<T>): number {
    let count = 0;
    for (const claim of room.identities.values()) if (claim.role !== 'probe') count += 1;
    return count;
  }

  private rejectJoin(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { type: 'error', code, message });
    socket.close(4_403, code);
  }

  private send(socket: WebSocket, message: ServerRelayMessage<T, D>): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  private isValidIdentity(sessionId: string, clientId: string): boolean {
    return SAFE_ID.test(sessionId) && SAFE_ID.test(clientId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalSafeString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && SAFE_ID.test(value));
}

function isClientRelayMessage<T, D>(value: unknown): value is ClientRelayMessage<T, D> {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (typeof value.sessionId !== 'string' || typeof value.clientId !== 'string') return false;
  if (value.type === 'join') {
    return (
      isSafeCounter(value.lastSequence) &&
      isOptionalSafeString(value.lastRoomEpoch) &&
      (value.role === 'host' || value.role === 'guest' || value.role === 'probe') &&
      (value.resumeCredential === undefined ||
        (typeof value.resumeCredential === 'string' && RESUME_CREDENTIAL.test(value.resumeCredential))) &&
      (value.capabilities === undefined ||
        (Array.isArray(value.capabilities) && value.capabilities.length <= 4 &&
          value.capabilities.every((capability) => capability === 'direct-v1')))
    );
  }
  if (value.type === 'ping') {
    return typeof value.pingId === 'string' && SAFE_ID.test(value.pingId) && isSafeCounter(value.clientTime);
  }
  if (value.type === 'publish') {
    return (
      typeof value.eventId === 'string' &&
      isSafeCounter(value.clientSentAt) &&
      Object.prototype.hasOwnProperty.call(value, 'payload')
    );
  }
  if (value.type === 'direct') {
    return (
      typeof value.recipientId === 'string' && SAFE_ID.test(value.recipientId) &&
      typeof value.messageId === 'string' && SAFE_ID.test(value.messageId) &&
      isSafeCounter(value.clientSentAt) &&
      Object.prototype.hasOwnProperty.call(value, 'payload')
    );
  }
  return false;
}

function createResumeCredential(): string {
  return randomBytes(32).toString('base64url');
}

function digestResumeCredential(credential: string): Buffer {
  return createHash('sha256').update(credential, 'utf8').digest();
}

function matchesResumeCredential(expectedDigest: Buffer, credential: string): boolean {
  if (!RESUME_CREDENTIAL.test(credential)) return false;
  const candidateDigest = digestResumeCredential(credential);
  return candidateDigest.length === expectedDigest.length && timingSafeEqual(candidateDigest, expectedDigest);
}
