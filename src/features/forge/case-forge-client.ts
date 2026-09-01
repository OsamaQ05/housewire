import {
  createAsyncStorageForgeCaseRepository,
  createCaseForgeService,
  HttpNarrativeCaseForgeProvider,
  type ForgeGenerateOptions,
} from '@/src/services/case-forge';
import { deriveLanRelayUrl } from '@/src/features/session/use-housewire-session';

function deriveDefaultNarrativeServiceUrl(): string {
  const relay = new URL(deriveLanRelayUrl());
  relay.protocol = relay.protocol === 'wss:' ? 'https:' : 'http:';
  relay.port = '8788';
  relay.pathname = '';
  relay.search = '';
  relay.hash = '';
  return relay.toString().replace(/\/$/, '');
}

function createNarrativeProvider(): HttpNarrativeCaseForgeProvider {
  const options = {
    healthTimeoutMs: 900,
    // The server's model request is capped at 35 seconds. Keep the phone alive
    // slightly longer so it can receive that result instead of paying for work it
    // has already abandoned.
    timeoutMs: 42_000,
  } as const;
  const explicit = process.env.EXPO_PUBLIC_HOUSEWIRE_FORGE_URL?.trim();
  if (explicit) {
    try {
      return new HttpNarrativeCaseForgeProvider({ ...options, baseUrl: explicit });
    } catch {
      // A malformed optional override must never stop the offline-first app from booting.
    }
  }
  return new HttpNarrativeCaseForgeProvider({ ...options, baseUrl: deriveDefaultNarrativeServiceUrl() });
}

const narrativeProvider = createNarrativeProvider();

/** One serialized service instance keeps library reads and writes ordered across routes. */
export const caseForgeClient = createCaseForgeService({
  repository: createAsyncStorageForgeCaseRepository(),
  providers: [narrativeProvider],
});

/**
 * A configured server may rewrite only the case narrative. Any outage, invalid model
 * output, or missing API key falls back to the fully playable local generator.
 */
export const caseForgeGenerationOptions: ForgeGenerateOptions = {
  allowOfflineFallback: true,
  providerId: narrativeProvider.id,
};
