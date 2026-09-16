import { normalizeServiceUrl } from '../../domain/connection-settings';
import { RelayProtocolError } from '../../services/transport';
import { probeLanHouse } from '../session/join-room';
import { createRelayId } from '../session/relay-id';

export interface ServiceHealth { connected: boolean; message: string }

export async function inspectAiConnection(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<ServiceHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const url = normalizeServiceUrl(baseUrl, 'ai');
    if (!url) return { connected: false, message: 'Add an AI server address first.' };
    const response = await fetchImpl(`${url}/health`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) return { connected: false, message: 'The AI server did not respond correctly.' };
    const data = await response.json() as { status?: unknown; aiConfigured?: unknown };
    if (data?.status !== 'ok') return { connected: false, message: 'This does not look like the Housewire AI server.' };
    return data.aiConfigured === true
      ? { connected: true, message: 'AI ready for Case Forge, Family Frequency, and the guide.' }
      : { connected: false, message: 'Server connected. Add the API key on the laptop to enable AI.' };
  } catch { return { connected: false, message: 'AI unreachable. Check the address, Wi-Fi, and that the laptop server is running.' }; }
  finally { clearTimeout(timer); }
}

/** A non-admitting probe verifies the real protocol without creating or joining a room. */
export async function inspectRelayConnection(value: string): Promise<ServiceHealth> {
  try {
    const relayUrl = normalizeServiceUrl(value, 'relay');
    if (!relayUrl) return { connected: false, message: 'Add a multiplayer server address first.' };
    await probeLanHouse({ relayUrl, code: createRelayId('connection-check'), connectTimeoutMs: 4_500 });
    return { connected: true, message: 'Multiplayer connection ready.' };
  } catch (error) {
    // A healthy relay answers that our random, uncreated check room does not exist.
    if (error instanceof RelayProtocolError && error.code === 'ROOM_NOT_FOUND') {
      return { connected: true, message: 'Multiplayer connection ready.' };
    }
    return { connected: false, message: 'Multiplayer unreachable. Check the address, Wi-Fi, and that the laptop server is running.' };
  }
}
