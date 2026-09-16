export interface ConnectionSettings {
  relayUrl: string;
  aiUrl: string;
}

export const EMPTY_CONNECTION_SETTINGS: ConnectionSettings = { relayUrl: '', aiUrl: '' };

export function isLocalServiceHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  const parts = hostname.split('.').map(Number);
  if (!parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) return false;
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

/** Addresses only: credentials and query tokens must never be stored on a phone. */
export function normalizeServiceUrl(value: string, kind: 'relay' | 'ai'): string {
  const text = value.trim();
  if (!text) return '';
  if (text.length > 240 || /\s/.test(text)) throw new Error('Enter a valid server address.');
  const shorthand = !text.includes('://');
  let url: URL;
  try { url = new URL(shorthand ? `http://${text}` : text); }
  catch { throw new Error('Enter a valid server address.'); }
  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a server address only, without passwords, keys, or query parameters.');
  }
  if (kind === 'relay') {
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('Use ws:// or wss:// for multiplayer.');
  } else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Use http:// or https:// for the AI server.');
  }
  const insecure = url.protocol === 'ws:' || url.protocol === 'http:';
  if (insecure && !isLocalServiceHost(url.hostname)) throw new Error('An online server needs a secure HTTPS or WSS address. A laptop can use its local IP address.');
  if (shorthand && !url.port) url.port = kind === 'relay' ? '8787' : '8788';
  return url.toString().replace(/\/+$/, '');
}

export function connectionSettingsForLaptop(address: string): ConnectionSettings {
  const text = address.trim();
  const url = new URL(text.includes('://') ? text : `http://${text}`);
  if (!isLocalServiceHost(url.hostname) || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname.startsWith('127.')) {
    throw new Error('Enter your laptop’s Wi-Fi IP address, such as 192.168.1.8—not localhost.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Enter just your laptop’s Wi-Fi IP address.');
  return {
    relayUrl: normalizeServiceUrl(`ws://${url.hostname}:8787`, 'relay'),
    aiUrl: normalizeServiceUrl(`http://${url.hostname}:8788`, 'ai'),
  };
}

/** AI and multiplayer can live on completely different secure hosts. Never invent a public AI port. */
export function resolveAiServiceUrl(relayUrl: string, explicit?: string): string {
  if (explicit?.trim()) return normalizeServiceUrl(explicit, 'ai');
  const relay = new URL(normalizeServiceUrl(relayUrl, 'relay'));
  if (!isLocalServiceHost(relay.hostname)) throw new Error('Set the AI server address in Settings → Phone connection.');
  relay.protocol = relay.protocol === 'wss:' ? 'https:' : 'http:';
  relay.port = '8788';
  relay.pathname = '';
  return normalizeServiceUrl(relay.toString(), 'ai');
}

export function parseConnectionSettings(raw: string | null): ConnectionSettings {
  if (!raw || raw.length > 1_024) return { ...EMPTY_CONNECTION_SETTINGS };
  try {
    const value = JSON.parse(raw) as { version?: unknown; relayUrl?: unknown; aiUrl?: unknown };
    if (!value || value.version !== 1) return { ...EMPTY_CONNECTION_SETTINGS };
    const read = (input: unknown, kind: 'relay' | 'ai') => {
      try { return typeof input === 'string' ? normalizeServiceUrl(input, kind) : ''; } catch { return ''; }
    };
    return { relayUrl: read(value.relayUrl, 'relay'), aiUrl: read(value.aiUrl, 'ai') };
  } catch { return { ...EMPTY_CONNECTION_SETTINGS }; }
}
