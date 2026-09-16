import {
  createAsyncStorageForgeCaseRepository,
  createCaseForgeService,
  HttpNarrativeCaseForgeProvider,
  type ForgeCaseProvider,
  type ForgeGenerateOptions,
} from '@/src/services/case-forge';
import { defaultAiServiceUrl } from '@/src/services/runtime-connections';

function createNarrativeProvider(): HttpNarrativeCaseForgeProvider {
  const options = {
    healthTimeoutMs: 3_000,
    // Stay alive slightly longer than the server's 60-second model deadline.
    timeoutMs: 68_000,
  } as const;
  return new HttpNarrativeCaseForgeProvider({ ...options, baseUrl: defaultAiServiceUrl() });
}

// Resolve at request time, after persisted settings hydrate. Changing a laptop
// address must work immediately without rebuilding or restarting the app.
const narrativeProvider: ForgeCaseProvider = {
  id: 'housewire-remote-narrative-v1',
  mode: 'remote',
  async isAvailable() {
    try { return await createNarrativeProvider().isAvailable(); } catch { return false; }
  },
  async generate(request) { return createNarrativeProvider().generate(request); },
};

/** One serialized service instance keeps library reads and writes ordered across routes. */
export const caseForgeClient = createCaseForgeService({
  repository: createAsyncStorageForgeCaseRepository(),
  providers: [narrativeProvider],
});

/**
 * A configured server may rewrite only the case narrative. Any outage, invalid model
 * output, or missing API key falls back locally for presets. Custom descriptions
 * require a successful AI response unless the player explicitly chooses offline.
 */
export const caseForgeGenerationOptions: ForgeGenerateOptions = {
  providerId: narrativeProvider.id,
};
