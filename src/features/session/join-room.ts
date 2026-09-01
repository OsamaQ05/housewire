import {
  LanWebSocketTransport,
  RelayProtocolError,
  type WebSocketFactory,
} from '../../services/transport';
import { createRelayId } from './relay-id';

export interface ProbeLanHouseOptions {
  code: string;
  relayUrl: string;
  connectTimeoutMs?: number;
  webSocketFactory?: WebSocketFactory;
}

export interface LanRelayUrlSources {
  explicit?: string;
  expoHostUri?: string;
  expoDebuggerHost?: string;
  webHostname?: string;
}

/**
 * Completes the same relay admission handshake as a guest before the app
 * commits local session state. A probe does not publish presence and therefore
 * never appears as a player in the host lobby.
 */
export async function probeLanHouse(options: ProbeLanHouseOptions): Promise<void> {
  const transport = new LanWebSocketTransport({
    clientId: createRelayId('probe'),
    connectTimeoutMs: options.connectTimeoutMs ?? 4_500,
    reconnect: false,
    role: 'probe',
    sessionId: options.code,
    url: options.relayUrl,
    webSocketFactory: options.webSocketFactory,
  });
  try {
    await transport.connect();
  } finally {
    await transport.disconnect();
  }
}

export function normaliseRelayUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice(8)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice(7)}`;
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  return `ws://${trimmed}`;
}

export function resolveLanRelayUrl(sources: LanRelayUrlSources): string {
  const explicit = validRelayUrl(sources.explicit);
  if (explicit) return explicit;

  const webHost = hostFromUri(sources.webHostname);
  if (webHost && !isLoopbackHost(webHost)) return relayUrlForHost(webHost);

  const expoHost = hostFromUri(sources.expoHostUri) ?? hostFromUri(sources.expoDebuggerHost);
  if (expoHost) return relayUrlForHost(expoHost);
  if (webHost) return relayUrlForHost(webHost);
  return 'ws://127.0.0.1:8787';
}

export function describeJoinFailure(cause: unknown): string {
  if (cause instanceof RelayProtocolError) {
    if (cause.code === 'ROOM_NOT_FOUND') {
      return 'No active host has that code. Keep the host lobby open and check that both phones use the same Wi-Fi.';
    }
    if (cause.code === 'HOST_EXISTS') return 'That code belongs to a different active host.';
    if (cause.code === 'ROOM_FULL') return 'That house already has four active phones.';
    return cause.message;
  }
  if (cause instanceof Error) return cause.message;
  return 'This phone could not reach the host relay. Check Wi-Fi and the host address.';
}

function validRelayUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const normalised = normaliseRelayUrl(value);
    const url = new URL(normalised);
    if ((url.protocol === 'ws:' || url.protocol === 'wss:') && url.hostname) return normalised;
  } catch {
    // Fall through to Expo's development host.
  }
  return undefined;
}

function hostFromUri(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const withScheme = value.includes('://') ? value : `http://${value}`;
    return new URL(withScheme).hostname.replace(/^\[|\]$/g, '') || undefined;
  } catch {
    return undefined;
  }
}

function relayUrlForHost(host: string): string {
  return `ws://${host.includes(':') ? `[${host}]` : host}:8787`;
}

function isLoopbackHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'localhost' || lower === '::1' || lower.startsWith('127.');
}
