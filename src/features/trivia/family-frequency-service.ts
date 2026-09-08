import {
  generateOfflineFamilyTriviaPack,
  planFamilyTriviaRespondents,
  parseFamilyTriviaSetup,
  parseSafeFamilyTriviaPack,
  validateFamilyTriviaPackForSetup,
  type FamilyTriviaChoiceQuestion,
  type FamilyTriviaOrderingQuestion,
  type FamilyTriviaQuestion,
  type FamilyTriviaQuestionPack,
  type FamilyTriviaSetup,
  type FamilyTriviaSpectrumQuestion,
  type FamilyTriviaTextQuestion,
} from '../../domain/family-trivia';

import {
  FamilyFrequencyAiClient,
  parseFamilyFrequencyPack,
  type FamilyFrequencyAiFailureReason,
  type FamilyFrequencyPack,
  type FamilyFrequencyStyle,
} from './family-frequency-ai-client';
import {
  chooseFamilyFrequencyStyle,
  emptyFamilyFrequencyVarietyLedger,
  parseFamilyFrequencyVarietyLedger,
  recentFamilyFrequencyPromptFingerprints,
  selectFreshFamilyFrequencyItems,
  type FamilyFrequencyVarietyLedger,
} from './family-frequency-variety';

export interface FamilyFrequencyBuildResult {
  pack: FamilyTriviaQuestionPack;
  source: 'ai' | 'offline';
  fallbackReason?: FamilyFrequencyAiFailureReason;
  style: FamilyFrequencyStyle;
}

export interface BuildFamilyFrequencyPackOptions {
  count: 4 | 8 | 12;
  seed: number;
  setup: FamilyTriviaSetup;
  style?: FamilyFrequencyStyle;
  varietyLedger?: FamilyFrequencyVarietyLedger;
}

export interface FamilyFrequencyServiceDependencies {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  healthTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export async function buildFamilyFrequencyPack({
  count,
  seed,
  setup,
  style,
  varietyLedger = emptyFamilyFrequencyVarietyLedger(),
}: BuildFamilyFrequencyPackOptions, dependencies: FamilyFrequencyServiceDependencies = {}): Promise<FamilyFrequencyBuildResult> {
  const safeLedger = parseFamilyFrequencyVarietyLedger(varietyLedger);
  const selectedStyle = style ?? chooseFamilyFrequencyStyle(safeLedger, seed);
  const fallback = () => generateOfflineFamilyTriviaPack({
    avoidPromptFingerprints: recentFamilyFrequencyPromptFingerprints(safeLedger),
    questionCount: count,
    seed,
    setup,
  });
  let client: FamilyFrequencyAiClient;
  try {
    const baseUrl = normalizeFamilyFrequencyServiceUrl(
      dependencies.baseUrl ?? await familyFrequencyServiceUrl(),
    );
    const health = await inspectFamilyFrequencyAi(
      baseUrl,
      dependencies.fetchImpl ?? fetch,
      dependencies.healthTimeoutMs,
    );
    if (!health.configured) {
      return { pack: fallback(), source: 'offline', fallbackReason: health.reason, style: selectedStyle };
    }
    client = new FamilyFrequencyAiClient({
      baseUrl,
      fetchImpl: dependencies.fetchImpl,
      timeoutMs: dependencies.requestTimeoutMs ?? 42_000,
    });
  } catch {
    return { pack: fallback(), source: 'offline', fallbackReason: 'not-configured', style: selectedStyle };
  }
  const candidateCount = safeLedger.recentPrompts.length > 0 ? 12 : count;
  const result = await client.generatePack({ count: candidateCount, seed, style: selectedStyle });
  if (!result.ok) return { pack: fallback(), source: 'offline', fallbackReason: result.reason, style: selectedStyle };
  try {
    return {
      pack: adaptAiPack(result.pack, setup, { count, varietyLedger: safeLedger }),
      source: 'ai',
      style: selectedStyle,
    };
  } catch {
    return { pack: fallback(), source: 'offline', fallbackReason: 'invalid-response', style: selectedStyle };
  }
}

async function inspectFamilyFrequencyAi(
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs = 1_200,
): Promise<{ configured: true } | { configured: false; reason: FamilyFrequencyAiFailureReason }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 3_000)));
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { configured: false, reason: 'service-error' };
    const value = await response.json() as unknown;
    if (!value || typeof value !== 'object') return { configured: false, reason: 'invalid-response' };
    return (value as { aiConfigured?: unknown }).aiConfigured === true
      ? { configured: true }
      : { configured: false, reason: 'not-configured' };
  } catch {
    return { configured: false, reason: 'offline' };
  } finally {
    clearTimeout(timeout);
  }
}

export function adaptAiPack(
  generated: FamilyFrequencyPack,
  setup: FamilyTriviaSetup,
  options: {
    count?: 4 | 8 | 12;
    varietyLedger?: FamilyFrequencyVarietyLedger;
  } = {},
): FamilyTriviaQuestionPack {
  const safeGenerated = parseFamilyFrequencyPack(generated);
  const safeSetup = parseFamilyTriviaSetup(setup);
  const selectedCount = options.count ?? (safeGenerated.count === 4 || safeGenerated.count === 8 || safeGenerated.count === 12
    ? safeGenerated.count
    : undefined);
  if (!selectedCount) throw new Error('Family Frequency supports 4, 8, or 12 selected cards.');
  const items = selectFreshFamilyFrequencyItems(
    safeGenerated,
    selectedCount,
    options.varietyLedger ?? emptyFamilyFrequencyVarietyLedger(),
  );
  const authorities = items.map((_, index) => safeSetup.players[index % safeSetup.players.length]);
  const respondentPlan = planFamilyTriviaRespondents({
    authorityPlayerIds: authorities.map((authority) => authority.id),
    kinds: items.map((item) => item.kind),
    seed: safeGenerated.seed,
    setup: safeSetup,
  });
  const questions: FamilyTriviaQuestion[] = items.map((item, index) => {
    const owner = authorities[index];
    const respondents = respondentPlan[index];
    const common = {
      id: item.id,
      authorityPlayerId: owner.id,
      respondentPlayerIds: respondents,
      prompt: item.prompt,
      canSkip: true,
    };
    if (item.kind === 'spectrum-read') {
      return {
        ...common,
        kind: item.kind,
        answerKind: 'spectrum',
        afterRevealPrompt: 'Compare the distance between the dials, then tune the next signal.',
        options: [],
        scale: { min: 0, max: 100, step: 5, minLabel: item.minLabel, maxLabel: item.maxLabel },
      } satisfies FamilyTriviaSpectrumQuestion;
    }
    if (item.kind === 'same-wavelength') {
      return {
        ...common,
        kind: item.kind,
        answerKind: 'text',
        afterRevealPrompt: 'Close wording scores locally; no typed answer leaves this phone.',
        options: [],
        inputHint: item.inputHint,
        maxLength: 40,
      } satisfies FamilyTriviaTextQuestion;
    }
    const questionOptions = item.options.map((label, optionIndex) => ({
      id: `freq-${safeGenerated.seed.toString(36)}-${index + 1}-o${optionIndex + 1}`,
      label,
    }));
    if (item.kind === 'family-lore-ordering') {
      return {
        ...common,
        options: questionOptions,
        kind: item.kind,
        answerKind: 'ordering',
        afterRevealPrompt: 'Compare the family order, then pass the dial on.',
      } satisfies FamilyTriviaOrderingQuestion;
    }
    return {
      ...common,
      options: questionOptions,
      kind: item.kind,
      answerKind: 'choice',
      afterRevealPrompt: item.kind === 'shared-memory-detail'
        ? 'Name the ordinary memory if it helps; no explanation is required.'
        : 'Compare the predictions, then tune the next signal.',
    } satisfies FamilyTriviaChoiceQuestion;
  });
  const pack = parseSafeFamilyTriviaPack({
    protocolVersion: 1,
    id: `frequency-${safeGenerated.seed.toString(36)}-${items.length}`,
    title: 'Tonight on Family Frequency',
    seed: safeGenerated.seed,
    source: { kind: 'ai', providerId: safeGenerated.providerId },
    questions,
  });
  validateFamilyTriviaPackForSetup(pack, safeSetup);
  return pack;
}

async function familyFrequencyServiceUrl(): Promise<string> {
  const explicit = process.env.EXPO_PUBLIC_HOUSEWIRE_FORGE_URL?.trim();
  if (explicit) return explicit;
  // Keep the Expo/native dependency out of this pure service boundary until the
  // app actually needs automatic LAN discovery. Tests and cloud builds can pass
  // an explicit HTTPS base URL without loading React Native modules.
  const { deriveLanRelayUrl } = await import('../session/use-housewire-session');
  const relay = new URL(deriveLanRelayUrl());
  relay.protocol = relay.protocol === 'wss:' ? 'https:' : 'http:';
  relay.port = '8788';
  relay.pathname = '';
  relay.search = '';
  relay.hash = '';
  return relay.toString().replace(/\/$/, '');
}

function normalizeFamilyFrequencyServiceUrl(value: string): string {
  const parsed = new URL(value);
  const privateHttp = parsed.protocol === 'http:' && (
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname) ||
    isPrivate172Address(parsed.hostname)
  );
  if (parsed.protocol !== 'https:' && !privateHttp) {
    throw new Error('Family Frequency AI requires HTTPS, except on a private LAN.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Invalid Family Frequency AI service URL.');
  }
  return parsed.toString().replace(/\/$/, '');
}

function isPrivate172Address(hostname: string): boolean {
  const match = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}
