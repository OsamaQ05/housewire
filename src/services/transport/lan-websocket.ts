import { bestClockEstimate, estimateClock } from './clock-sync';
import type {
  ClientRelayMessage,
  ClockEstimate,
  DirectDeliveryAck,
  DirectPublishOptions,
  PublishOptions,
  RelayClientRole,
  RelayResumeCredentials,
  ServerRelayMessage,
  SessionTransport,
  TransportDirectFrame,
  TransportConnectionState,
  TransportFrame,
} from './types';
import { MAXIMUM_RELAY_MESSAGE_BYTES, utf8ByteLength } from './types';

interface MessageEventLike {
  data: unknown;
}

interface CloseEventLike {
  code?: number;
  reason?: string;
}

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
  addEventListener(type: 'close', listener: (event: CloseEventLike) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface LanWebSocketTransportOptions {
  url: string;
  sessionId: string;
  clientId: string;
  reconnect?: boolean;
  reconnectBaseDelayMs?: number;
  connectTimeoutMs?: number;
  directAckTimeoutMs?: number;
  role: RelayClientRole;
  resumeCredentials?: RelayResumeCredentials;
  onResumeCredentials?: (credentials: RelayResumeCredentials | undefined) => void;
  webSocketFactory?: WebSocketFactory;
}

const OPEN = 1;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESUME_CREDENTIAL = /^[a-zA-Z0-9_-]{43}$/;

interface PendingDirectDelivery {
  recipientId: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (ack: DirectDeliveryAck) => void;
  reject: (error: Error) => void;
}

export class RelayProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RelayProtocolError';
  }
}

export class LanWebSocketTransport<T = unknown, D = unknown> implements SessionTransport<T, D> {
  readonly sessionId: string;
  readonly clientId: string;
  private readonly frameListeners = new Set<(frame: TransportFrame<T>) => void>();
  private readonly directListeners = new Set<(frame: TransportDirectFrame<D>) => void>();
  private readonly stateListeners = new Set<(state: TransportConnectionState) => void>();
  private readonly pending: string[] = [];
  private readonly clockEstimates: ClockEstimate[] = [];
  private readonly pendingPings = new Map<string, number>();
  private readonly pendingDirect = new Map<string, PendingDirectDelivery>();
  private socket?: WebSocketLike;
  private connectionState: TransportConnectionState = 'idle';
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private lastSequence = 0;
  private roomEpoch?: string;
  private connectAttempt?: Promise<void>;
  private transportError?: Error;
  private supportsDirect = false;
  private relayMaximumMessageBytes = MAXIMUM_RELAY_MESSAGE_BYTES;
  private resumeCredentials?: RelayResumeCredentials;
  private credentialsIssuedOnThisInstance = false;

  constructor(private readonly options: LanWebSocketTransportOptions) {
    this.sessionId = options.sessionId;
    this.clientId = options.clientId;
    if (!SAFE_ID.test(options.sessionId) || !SAFE_ID.test(options.clientId)) {
      throw new RelayProtocolError('INVALID_ID', 'Session and client ids must be relay-safe.');
    }
    if (options.resumeCredentials) {
      if (!isRelayResumeCredentials(options.resumeCredentials)) {
        throw new RelayProtocolError('INVALID_RESUME', 'Stored reconnect credentials have an invalid shape.');
      }
      if (
        options.resumeCredentials.sessionId !== options.sessionId ||
        options.resumeCredentials.clientId !== options.clientId ||
        options.resumeCredentials.role !== options.role
      ) {
        throw new RelayProtocolError(
          'RESUME_IDENTITY_MISMATCH',
          'Reconnect credentials are bound to one exact room, phone, and role.',
        );
      }
      this.resumeCredentials = options.resumeCredentials;
      this.roomEpoch = options.resumeCredentials.roomEpoch;
    }
  }

  get state(): TransportConnectionState {
    return this.connectionState;
  }

  get clockEstimate(): ClockEstimate | undefined {
    return bestClockEstimate(this.clockEstimates);
  }

  get lastError(): Error | undefined {
    return this.transportError;
  }

  async connect(): Promise<void> {
    if (this.connectionState === 'connected') return;
    if (this.connectAttempt) return this.connectAttempt;
    this.supportsDirect = false;
    this.relayMaximumMessageBytes = MAXIMUM_RELAY_MESSAGE_BYTES;
    this.shouldReconnect = this.options.reconnect !== false;
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    const attempt = new Promise<void>((resolve, reject) => {
      const factory = this.options.webSocketFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
      let socket: WebSocketLike;
      try {
        socket = factory(this.options.url);
      } catch (cause: unknown) {
        const error = cause instanceof Error ? cause : new Error('The LAN relay address is invalid.');
        this.fail(error);
        reject(error);
        return;
      }
      this.socket = socket;
      let settled = false;
      const settleError = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => {
        if (settled || this.socket !== socket) return;
        const error = new Error('The house relay did not answer in time. Check Wi-Fi and the host address.');
        this.fail(error);
        settleError(error);
        socket.close(4_001, 'Connect timeout');
      }, this.options.connectTimeoutMs ?? 6_000);

      socket.addEventListener('open', () => {
        if (this.socket !== socket) return;
        socket.send(JSON.stringify({
          type: 'join',
          sessionId: this.sessionId,
          clientId: this.clientId,
          lastSequence: this.lastSequence,
          lastRoomEpoch: this.roomEpoch,
          role: this.options.role,
          resumeCredential: this.resumeCredentials?.credential,
          capabilities: ['direct-v1'],
        } satisfies ClientRelayMessage<T, D>));
      });
      socket.addEventListener('message', (event) => {
        if (this.socket !== socket) return;
        const message = this.parseMessage(event.data);
        if (!message) return;
        if (message.type === 'error') {
          if (
            message.code === 'ROOM_RESET' &&
            this.credentialsIssuedOnThisInstance &&
            this.resumeCredentials
          ) {
            this.resumeCredentials = undefined;
            this.credentialsIssuedOnThisInstance = false;
            this.lastSequence = 0;
            this.roomEpoch = undefined;
            this.notifyResumeCredentials(undefined);
          }
          const error = new RelayProtocolError(message.code, message.message);
          this.fail(error);
          settleError(error);
          socket.close(message.code === 'ROOM_NOT_FOUND' ? 4_404 : 4_400, message.code);
          return;
        }
        if (message.type === 'joined') {
          if (message.sessionId !== this.sessionId || message.clientId !== this.clientId) {
            const error = new RelayProtocolError('IDENTITY_MISMATCH', 'The relay acknowledged a different house identity.');
            this.fail(error);
            settleError(error);
            socket.close(4_400, 'Identity mismatch');
            return;
          }
          if (message.role !== this.options.role) {
            const error = new RelayProtocolError('ROLE_MISMATCH', 'The relay acknowledged a different room role.');
            this.fail(error);
            settleError(error);
            socket.close(4_400, 'Role mismatch');
            return;
          }
          if (this.roomEpoch && message.roomEpoch !== this.roomEpoch) {
            this.lastSequence = 0;
          }
          this.roomEpoch = message.roomEpoch;
          this.resumeCredentials = {
            clientId: this.clientId,
            credential: message.resumeCredential,
            role: this.options.role,
            roomEpoch: message.roomEpoch,
            sessionId: this.sessionId,
          };
          this.credentialsIssuedOnThisInstance = true;
          this.notifyResumeCredentials(this.resumeCredentials);
          this.supportsDirect = message.capabilities?.includes('direct-v1') ?? false;
          this.relayMaximumMessageBytes = Math.min(
            MAXIMUM_RELAY_MESSAGE_BYTES,
            message.maximumMessageBytes ?? MAXIMUM_RELAY_MESSAGE_BYTES,
          );
          clearTimeout(timeout);
          this.reconnectAttempts = 0;
          this.transportError = undefined;
          this.setState('connected');
          this.flush();
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }
        if (message.type === 'frame') {
          if (message.sessionId !== this.sessionId) return;
          if (message.sequence <= this.lastSequence) return;
          this.lastSequence = message.sequence;
          for (const listener of this.frameListeners) listener(message);
          return;
        }
        if (message.type === 'direct') {
          if (message.sessionId !== this.sessionId || message.recipientId !== this.clientId) return;
          for (const listener of this.directListeners) listener(message);
          return;
        }
        if (message.type === 'direct.ack') {
          const pending = this.pendingDirect.get(message.messageId);
          if (!pending || pending.recipientId !== message.recipientId) return;
          this.pendingDirect.delete(message.messageId);
          clearTimeout(pending.timeout);
          pending.resolve(message);
          return;
        }
        if (message.type === 'direct.nack') {
          const pending = this.pendingDirect.get(message.messageId);
          if (!pending || pending.recipientId !== message.recipientId) return;
          this.pendingDirect.delete(message.messageId);
          clearTimeout(pending.timeout);
          pending.reject(new RelayProtocolError(message.code, message.message));
          return;
        }
        if (message.type === 'pong') {
          const sentAt = this.pendingPings.get(message.pingId) ?? message.clientTime;
          this.pendingPings.delete(message.pingId);
          this.clockEstimates.push(
            estimateClock({ clientSentAt: sentAt, serverAt: message.serverTime, clientReceivedAt: Date.now() }),
          );
          if (this.clockEstimates.length > 8) this.clockEstimates.shift();
        }
      });
      socket.addEventListener('error', () => {
        if (this.socket !== socket) return;
        const error = new Error('Could not reach the house relay. Check that the host relay is running and both phones use the same Wi-Fi.');
        this.fail(error);
        settleError(error);
        socket.close(4_002, 'Connection failed');
      });
      socket.addEventListener('close', (event) => {
        if (this.socket !== socket) return;
        clearTimeout(timeout);
        this.socket = undefined;
        this.rejectPendingDirect(new Error('The house relay disconnected before direct delivery was acknowledged.'));
        if (!settled) {
          settled = true;
          const reason = event.reason ? ` (${event.reason})` : '';
          const error = this.transportError ?? new Error(`The house relay closed before the join completed${reason}.`);
          reject(error);
        }
        if (this.shouldReconnect) this.scheduleReconnect();
        else if (this.connectionState !== 'error') this.setState('closed');
      });
    });
    this.connectAttempt = attempt;
    try {
      await attempt;
    } finally {
      if (this.connectAttempt === attempt) this.connectAttempt = undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close(1_000, 'Client disconnect');
    this.pending.length = 0;
    this.pendingPings.clear();
    this.rejectPendingDirect(new Error('The direct delivery was cancelled because the transport disconnected.'));
    this.setState('closed');
  }

  async publish(payload: T, options: PublishOptions): Promise<void> {
    const raw = JSON.stringify({
      type: 'publish',
      sessionId: this.sessionId,
      clientId: this.clientId,
      eventId: options.eventId,
      clientSentAt: options.clientSentAt ?? Date.now(),
      payload,
    } satisfies ClientRelayMessage<T, D>);
    if (this.state === 'connected' && this.socket?.readyState === OPEN) this.socket.send(raw);
    else this.pending.push(raw);
  }

  async publishDirect(
    recipientId: string,
    payload: D,
    options: DirectPublishOptions = {},
  ): Promise<DirectDeliveryAck> {
    if (this.state !== 'connected' || this.socket?.readyState !== OPEN) {
      throw new RelayProtocolError('NOT_CONNECTED', 'The house relay is not connected for direct delivery.');
    }
    if (!this.supportsDirect) {
      throw new RelayProtocolError('DIRECT_UNSUPPORTED', 'This relay does not support private direct delivery.');
    }
    const messageId = options.messageId ?? createDirectMessageId();
    if (!SAFE_ID.test(recipientId) || !SAFE_ID.test(messageId)) {
      throw new RelayProtocolError('INVALID_DIRECT_ID', 'Direct recipient and message ids must be relay-safe.');
    }
    if (this.pendingDirect.has(messageId)) {
      throw new RelayProtocolError('DUPLICATE_DIRECT_ID', 'That direct message id is already awaiting delivery.');
    }

    let raw: string;
    try {
      const serialized = JSON.stringify({
        type: 'direct',
        sessionId: this.sessionId,
        clientId: this.clientId,
        recipientId,
        messageId,
        clientSentAt: options.clientSentAt ?? Date.now(),
        payload,
      } satisfies ClientRelayMessage<T, D>);
      if (typeof serialized !== 'string') throw new Error('Direct envelope was not serializable.');
      const encoded = JSON.parse(serialized) as unknown;
      if (!isRecord(encoded) || !Object.prototype.hasOwnProperty.call(encoded, 'payload')) {
        throw new Error('Direct payload was omitted during serialization.');
      }
      raw = serialized;
    } catch {
      throw new RelayProtocolError('INVALID_DIRECT_PAYLOAD', 'The direct payload must be JSON serializable.');
    }
    if (utf8ByteLength(raw) > this.relayMaximumMessageBytes) {
      throw new RelayProtocolError(
        'MESSAGE_TOO_LARGE',
        `Direct messages are limited to ${this.relayMaximumMessageBytes} encoded bytes.`,
      );
    }

    return new Promise<DirectDeliveryAck>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingDirect.get(messageId);
        if (!pending) return;
        this.pendingDirect.delete(messageId);
        pending.reject(new RelayProtocolError('DIRECT_ACK_TIMEOUT', 'The relay did not acknowledge direct delivery in time.'));
      }, this.options.directAckTimeoutMs ?? 5_000);
      this.pendingDirect.set(messageId, { recipientId, timeout, resolve, reject });
      try {
        this.socket!.send(raw);
      } catch {
        clearTimeout(timeout);
        this.pendingDirect.delete(messageId);
        reject(new RelayProtocolError('DIRECT_SEND_FAILED', 'The direct message could not be sent to the relay.'));
      }
    });
  }

  ping(pingId: string, now = Date.now()): void {
    this.pendingPings.set(pingId, now);
    this.sendRaw({ type: 'ping', sessionId: this.sessionId, clientId: this.clientId, pingId, clientTime: now });
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

  private sendRaw(message: ClientRelayMessage<T, D>): void {
    const raw = JSON.stringify(message);
    if (this.socket?.readyState === OPEN) this.socket.send(raw);
    else this.pending.push(raw);
  }

  private flush(): void {
    if (this.socket?.readyState !== OPEN) return;
    while (this.pending.length > 0) this.socket.send(this.pending.shift()!);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.setState('reconnecting');
    const delay = Math.min(8_000, (this.options.reconnectBaseDelayMs ?? 350) * 2 ** (this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private fail(error: Error): void {
    this.transportError = error;
    this.rejectPendingDirect(error);
    this.setState('error');
  }

  private rejectPendingDirect(error: Error): void {
    for (const pending of this.pendingDirect.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingDirect.clear();
  }

  private setState(state: TransportConnectionState): void {
    this.connectionState = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private notifyResumeCredentials(credentials: RelayResumeCredentials | undefined): void {
    try {
      this.options.onResumeCredentials?.(credentials);
    } catch {
      // Credential persistence must never tear down an otherwise valid relay connection.
    }
  }

  private parseMessage(data: unknown): ServerRelayMessage<T, D> | undefined {
    try {
      if (typeof data !== 'string') return undefined;
      const parsed = JSON.parse(data) as unknown;
      return isServerRelayMessage<T, D>(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isServerRelayMessage<T, D>(value: unknown): value is ServerRelayMessage<T, D> {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'error') {
    return typeof value.code === 'string' && value.code.length <= 64 && typeof value.message === 'string' && value.message.length <= 512;
  }
  if (value.type === 'joined') {
    return (
      typeof value.sessionId === 'string' && SAFE_ID.test(value.sessionId) &&
      typeof value.clientId === 'string' && SAFE_ID.test(value.clientId) &&
      isSafeCounter(value.latestSequence) &&
      isSafeCounter(value.serverTime) &&
      typeof value.roomEpoch === 'string' && SAFE_ID.test(value.roomEpoch) &&
      (value.role === 'host' || value.role === 'guest' || value.role === 'probe') &&
      typeof value.resumeCredential === 'string' && RESUME_CREDENTIAL.test(value.resumeCredential) &&
      (value.capabilities === undefined ||
        (Array.isArray(value.capabilities) && value.capabilities.every((capability) => capability === 'direct-v1'))) &&
      (value.maximumMessageBytes === undefined ||
        (isSafeCounter(value.maximumMessageBytes) && value.maximumMessageBytes >= 1_024 &&
          value.maximumMessageBytes <= MAXIMUM_RELAY_MESSAGE_BYTES))
    );
  }
  if (value.type === 'frame') {
    return (
      typeof value.sessionId === 'string' &&
      typeof value.senderId === 'string' &&
      typeof value.eventId === 'string' &&
      isSafeCounter(value.sequence) &&
      isSafeCounter(value.serverTime) &&
      Object.prototype.hasOwnProperty.call(value, 'payload')
    );
  }
  if (value.type === 'direct') {
    return (
      typeof value.sessionId === 'string' &&
      typeof value.senderId === 'string' &&
      typeof value.recipientId === 'string' &&
      typeof value.messageId === 'string' &&
      SAFE_ID.test(value.senderId) &&
      SAFE_ID.test(value.recipientId) &&
      SAFE_ID.test(value.messageId) &&
      isSafeCounter(value.serverTime) &&
      Object.prototype.hasOwnProperty.call(value, 'payload')
    );
  }
  if (value.type === 'direct.ack') {
    return (
      typeof value.messageId === 'string' &&
      typeof value.recipientId === 'string' &&
      SAFE_ID.test(value.messageId) &&
      SAFE_ID.test(value.recipientId) &&
      isSafeCounter(value.deliveredAt)
    );
  }
  if (value.type === 'direct.nack') {
    return (
      typeof value.messageId === 'string' &&
      typeof value.recipientId === 'string' &&
      typeof value.code === 'string' &&
      typeof value.message === 'string' &&
      SAFE_ID.test(value.messageId) &&
      SAFE_ID.test(value.recipientId) &&
      value.code.length <= 64 &&
      value.message.length <= 512
    );
  }
  if (value.type === 'pong') {
    return (
      typeof value.pingId === 'string' &&
      isSafeCounter(value.clientTime) &&
      isSafeCounter(value.serverTime)
    );
  }
  return false;
}

function createDirectMessageId(): string {
  return `direct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isRelayResumeCredentials(value: RelayResumeCredentials): boolean {
  return (
    SAFE_ID.test(value.sessionId) &&
    SAFE_ID.test(value.clientId) &&
    SAFE_ID.test(value.roomEpoch) &&
    (value.role === 'host' || value.role === 'guest' || value.role === 'probe') &&
    RESUME_CREDENTIAL.test(value.credential)
  );
}
