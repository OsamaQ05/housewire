import {
  assertPlayableForgeCase,
  forgeSeedFromValue,
  generateOfflineForgeCase,
  normalizeForgeThemePrompt,
  type ForgeCase,
  type ForgeGenerationRequest,
} from '../../domain/case-forge';
import { canonicalForgeJson, forgeUtf8ByteLength, parseSafeForgeJson } from './serialization';
import type { ForgeCaseProvider } from './types';

export class OfflineCaseForgeProvider implements ForgeCaseProvider {
  readonly id = 'housewire-local-forge-v1';
  readonly mode = 'offline' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(request: ForgeGenerationRequest): Promise<ForgeCase> {
    return assertPlayableForgeCase(generateOfflineForgeCase(request));
  }
}

export interface HttpNarrativeCaseForgeProviderOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  healthTimeoutMs?: number;
  timeoutMs?: number;
}

function isPrivateIpv4(hostname: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const match = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function normalizedBaseUrl(value: string): string {
  const parsed = new URL(value);
  const localHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || isPrivateIpv4(parsed.hostname));
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('Remote Case Forge requires HTTPS, except on localhost or a private LAN.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid Case Forge service URL.');
  return parsed.toString().replace(/\/$/, '');
}

function freezeMechanicalContract(game: ForgeCase): unknown {
  return {
    ...game,
    providerId: '__provider__',
    title: '__narrative__',
    tagline: '__narrative__',
    premise: '__narrative__',
    objective: '__narrative__',
    ending: '__narrative__',
    roles: game.roles.map((role) => ({
      ...role,
      title: '__narrative__',
      brief: '__narrative__',
      responsibility: '__narrative__',
    })),
    stages: game.stages.map((stage) => ({
      ...stage,
      title: '__narrative__',
      storyBeat: '__narrative__',
    })),
  };
}

/** True only when remote output changed allowlisted narrative copy and nothing playable or safety-related. */
export function preservesForgeMechanicalContract(baseCase: ForgeCase, candidate: ForgeCase): boolean {
  return canonicalForgeJson(freezeMechanicalContract(baseCase)) === canonicalForgeJson(freezeMechanicalContract(candidate));
}

export const FORGE_NARRATIVE_CANDIDATE_COUNT = 4;

/**
 * Produces a small, deterministic set of independently validated mechanical cuts.
 * The model may rank these cuts, but it never authors answers or executable clues.
 */
export function createForgeNarrativeCandidates(request: ForgeGenerationRequest): readonly ForgeCase[] {
  const fingerprint = forgeSeedFromValue(request.seed).toString(36).toUpperCase();
  return Array.from({ length: FORGE_NARRATIVE_CANDIDATE_COUNT }, (_, index) => {
    const candidateRequest = index === 0
      ? request
      : { ...request, seed: `FORGE-AI-${fingerprint}-${index}` };
    return assertPlayableForgeCase(generateOfflineForgeCase(candidateRequest));
  });
}

export class HttpNarrativeCaseForgeProvider implements ForgeCaseProvider {
  readonly id = 'housewire-remote-narrative-v1';
  readonly mode = 'remote' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly healthTimeoutMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpNarrativeCaseForgeProviderOptions) {
    this.baseUrl = normalizedBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.healthTimeoutMs = Math.max(250, Math.min(options.healthTimeoutMs ?? 900, 3_000));
    this.timeoutMs = Math.max(2_000, Math.min(options.timeoutMs ?? 68_000, 75_000));
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.healthTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const health = await response.json() as { aiConfigured?: unknown };
      return health.aiConfigured === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(request: ForgeGenerationRequest): Promise<ForgeCase> {
    request = { ...request, customThemePrompt: normalizeForgeThemePrompt(request.customThemePrompt) };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/case-forge/reskin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ protocolVersion: 1, request }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error('The shared AI generation limit has been reached. Try again later, or choose an offline case.');
        if (response.status === 503) throw new Error('AI is not configured on the relay. Your idea is saved here; try again after the relay is ready, or play offline.');
        if (response.status === 400) throw new Error('The case request was not accepted. Check your description and try again.');
        throw new Error('AI could not finish a valid case this time. Your idea is still here. Try again, or choose an offline case.');
      }
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (Number.isFinite(contentLength) && contentLength > 512 * 1_024) throw new Error('Narrative response is too large.');
      const serialized = await response.text();
      if (forgeUtf8ByteLength(serialized) > 512 * 1_024) throw new Error('Narrative response is too large.');
      const envelope = parseSafeForgeJson(serialized);
      if (!envelope || typeof envelope !== 'object' || (envelope as { protocolVersion?: unknown }).protocolVersion !== 1) {
        throw new Error('Narrative provider returned an unsupported response.');
      }
      const candidate = assertPlayableForgeCase((envelope as { case?: unknown }).case);
      const permittedCandidate = createForgeNarrativeCandidates(request)
        .some((mechanicalCut) => preservesForgeMechanicalContract(mechanicalCut, candidate));
      if (!permittedCandidate) {
        throw new Error('Narrative provider returned mechanics outside the validated candidate set.');
      }
      return { ...candidate, providerId: this.id };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('The AI story took too long. Your idea is still here. Try again, or choose an offline case.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
