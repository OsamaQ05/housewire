import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { normalizeServiceUrl, resolveAiServiceUrl } from '../domain/connection-settings';
import { resolveLanRelayUrl } from '../features/session/join-room';
import { useConnectionSettingsStore } from '../store/use-connection-settings-store';

export function defaultRelayServiceUrl(): string {
  const stored = useConnectionSettingsStore.getState().relayUrl;
  if (stored) return stored;
  const explicit = process.env.EXPO_PUBLIC_HOUSEWIRE_RELAY_URL;
  if (explicit?.trim()) {
    try { return normalizeServiceUrl(explicit, 'relay'); } catch { /* Ignore invalid build defaults. */ }
  }
  const webHostname = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : undefined;
  const expoHostUri = Constants.expoConfig?.hostUri;
  const expoDebuggerHost = Constants.expoGoConfig?.debuggerHost;
  // A standalone phone's loopback is the phone itself, not the development laptop.
  if (!webHostname && !expoHostUri && !expoDebuggerHost) return '';
  return resolveLanRelayUrl({ expoHostUri, expoDebuggerHost, webHostname });
}

export function defaultAiServiceUrl(sessionRelayUrl?: string | null): string {
  const stored = useConnectionSettingsStore.getState().aiUrl;
  const explicit = stored || process.env.EXPO_PUBLIC_HOUSEWIRE_FORGE_URL;
  return resolveAiServiceUrl(sessionRelayUrl || defaultRelayServiceUrl(), explicit);
}
