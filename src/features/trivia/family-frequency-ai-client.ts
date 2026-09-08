import { z } from 'zod';

export const FAMILY_FREQUENCY_STYLES = ['everyday', 'playful', 'mixed'] as const;
export const FAMILY_FREQUENCY_ROUND_KINDS = [
  'preference-match',
  'family-lore-ordering',
  'who-knows-who',
  'shared-memory-detail',
  'spectrum-read',
  'same-wavelength',
] as const;

export const FAMILY_FREQUENCY_PROVIDER_ID = 'openai-responses-family-frequency-v2';

const MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SENSITIVE_COPY = /\b(?:abuse|affair|appearance|argument|bank account|body|confess\w*|debt|diagnos\w*|divorc\w*|embarrass\w*|favorite child|fertil\w*|fight|funeral|grief|health|illness|income|least favorite|medical|money|politic\w*|pregnan\w*|religio\w*|romantic|salary|secret|sex|therapy|trauma|violence|vote|weight|who is to blame|who do you love|worst parent)\b/i;
const NON_ANSWER_OPTION = /^(?:all(?: of (?:these|the above))?|none(?: of (?:these|the above))?|other)$/i;

const familyFrequencyRequestSchema = z.object({
  style: z.enum(FAMILY_FREQUENCY_STYLES),
  count: z.number().int().min(4).max(12),
  seed: z.number().int().min(0).max(0xffff_ffff),
}).strict();

const safePrompt = z.string().trim().min(12).max(112).refine(isSafeCopy, 'Prompt contains sensitive or unsafe copy.');
const safeOption = z.string().trim().min(1).max(40)
  .refine(isSafeCopy, 'Option contains sensitive or unsafe copy.')
  .refine((value) => !NON_ANSWER_OPTION.test(value), 'Options must be concrete choices.');
const optionsSchema = z.tuple([safeOption, safeOption, safeOption, safeOption])
  .refine((options) => new Set(options.map((option) => option.toLocaleLowerCase())).size === options.length, {
    message: 'Options must be unique.',
  });
const safeId = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const safeLabel = z.string().trim().min(2).max(40).refine(isSafeCopy, 'Label contains sensitive or unsafe copy.');
const commonItemShape = { id: safeId, prompt: safePrompt };
const choiceItemSchema = z.object({
  ...commonItemShape,
  kind: z.enum(['preference-match', 'who-knows-who', 'shared-memory-detail']),
  options: optionsSchema,
}).strict();
const orderingItemSchema = z.object({
  ...commonItemShape,
  kind: z.literal('family-lore-ordering'),
  options: optionsSchema,
}).strict();
const spectrumItemSchema = z.object({
  ...commonItemShape,
  kind: z.literal('spectrum-read'),
  minLabel: safeLabel,
  maxLabel: safeLabel,
}).strict().refine((item) => item.minLabel.toLocaleLowerCase() !== item.maxLabel.toLocaleLowerCase(), {
  message: 'Spectrum anchors must differ.',
});
const textItemSchema = z.object({
  ...commonItemShape,
  kind: z.literal('same-wavelength'),
  inputHint: safeLabel,
}).strict();
const familyFrequencyItemSchema = z.union([
  choiceItemSchema,
  orderingItemSchema,
  spectrumItemSchema,
  textItemSchema,
]);

const familyFrequencyPackSchema = z.object({
  id: safeId,
  providerId: z.literal(FAMILY_FREQUENCY_PROVIDER_ID),
  style: z.enum(FAMILY_FREQUENCY_STYLES),
  count: z.number().int().min(4).max(12),
  seed: z.number().int().min(0).max(0xffff_ffff),
  items: z.array(familyFrequencyItemSchema).min(4).max(12),
}).strict();

const familyFrequencyEnvelopeSchema = z.object({
  protocolVersion: z.literal(1),
  pack: familyFrequencyPackSchema,
}).strict();

export type FamilyFrequencyStyle = (typeof FAMILY_FREQUENCY_STYLES)[number];
export type FamilyFrequencyRoundKind = (typeof FAMILY_FREQUENCY_ROUND_KINDS)[number];
export type FamilyFrequencyPackRequest = z.infer<typeof familyFrequencyRequestSchema>;
export type FamilyFrequencyPack = z.infer<typeof familyFrequencyPackSchema>;

export type FamilyFrequencyAiFailureReason =
  | 'invalid-request'
  | 'not-configured'
  | 'rate-limited'
  | 'offline'
  | 'invalid-response'
  | 'service-error';

export type FamilyFrequencyAiResult =
  | { ok: true; pack: FamilyFrequencyPack }
  | { ok: false; reason: FamilyFrequencyAiFailureReason; message: string };

export interface FamilyFrequencyAiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function parseFamilyFrequencyPackRequest(value: unknown): FamilyFrequencyPackRequest {
  return familyFrequencyRequestSchema.parse(value);
}

export function parseFamilyFrequencyPack(value: unknown): FamilyFrequencyPack {
  const pack = familyFrequencyPackSchema.parse(value);
  if (pack.items.length !== pack.count) throw new Error('Family Frequency pack count does not match its items.');
  if (new Set(pack.items.map((item) => item.id)).size !== pack.items.length) {
    throw new Error('Family Frequency item ids must be unique.');
  }
  if (new Set(pack.items.map((item) => item.prompt.toLocaleLowerCase())).size !== pack.items.length) {
    throw new Error('Family Frequency prompts must be unique.');
  }
  const coveredKinds = new Set(pack.items.map((item) => item.kind));
  const formatCoverage = new Set(pack.items.map((item) => item.kind === 'spectrum-read'
    ? 'spectrum'
    : item.kind === 'same-wavelength'
      ? 'text'
      : item.kind === 'family-lore-ordering'
        ? 'ordering'
        : 'choice'));
  for (const answerKind of ['choice', 'ordering', 'spectrum', 'text'] as const) {
    if (!formatCoverage.has(answerKind)) throw new Error(`Family Frequency pack is missing ${answerKind}.`);
  }
  if (pack.items.length >= FAMILY_FREQUENCY_ROUND_KINDS.length) {
    for (const kind of FAMILY_FREQUENCY_ROUND_KINDS) {
      if (!coveredKinds.has(kind)) throw new Error(`Family Frequency pack is missing ${kind}.`);
    }
  }
  for (const item of pack.items) {
    if (item.kind === 'family-lore-ordering' && !isOrderingPrompt(item.prompt)) {
      throw new Error('Family Frequency ordering prompts must ask players to order all four options.');
    }
  }
  return pack;
}

export class FamilyFrequencyAiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: FamilyFrequencyAiClientOptions) {
    this.baseUrl = normalizeServiceUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(2_000, Math.min(options.timeoutMs ?? 42_000, 45_000));
  }

  async generatePack(input: FamilyFrequencyPackRequest): Promise<FamilyFrequencyAiResult> {
    let request: FamilyFrequencyPackRequest;
    try {
      request = parseFamilyFrequencyPackRequest(input);
    } catch {
      return failure('invalid-request', 'Choose a valid style and request between 4 and 12 cards.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/family-frequency/pack`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ protocolVersion: 1, request }),
        signal: controller.signal,
      });
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (Number.isFinite(contentLength) && contentLength > MAXIMUM_RESPONSE_BYTES) {
        return failure('invalid-response', 'The AI pack was too large. Use the built-in pack instead.');
      }
      const serialized = await response.text();
      if (utf8ByteLength(serialized) > MAXIMUM_RESPONSE_BYTES) {
        return failure('invalid-response', 'The AI pack was too large. Use the built-in pack instead.');
      }
      if (!response.ok) return httpFailure(response.status, serialized);
      try {
        const envelope = familyFrequencyEnvelopeSchema.parse(JSON.parse(serialized) as unknown);
        const pack = parseFamilyFrequencyPack(envelope.pack);
        if (pack.style !== request.style || pack.count !== request.count || pack.seed !== request.seed) {
          return failure('invalid-response', 'The AI pack did not match this round. Use the built-in pack instead.');
        }
        return { ok: true, pack };
      } catch {
        return failure('invalid-response', 'The AI pack was invalid. Use the built-in pack instead.');
      }
    } catch {
      return failure('offline', 'Family Frequency AI is unavailable. Use the built-in pack instead.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isSafeCopy(value: string): boolean {
  return !CONTROL_CHARACTERS.test(value) && !SENSITIVE_COPY.test(value);
}

function isOrderingPrompt(prompt: string): boolean {
  const orderingVerb = /^(?:order|rank|arrange|put)\b/i.test(prompt);
  const orderingCriterion = /\b(?:from|to|by|first|last|earliest|latest|oldest|newest|most|least|sequence|timeline)\b|\bin (?:the |your |their )?order\b/i.test(prompt);
  return orderingVerb && orderingCriterion;
}

function failure(reason: FamilyFrequencyAiFailureReason, message: string): FamilyFrequencyAiResult {
  return { ok: false, reason, message };
}

function httpFailure(status: number, serialized: string): FamilyFrequencyAiResult {
  const code = parseErrorCode(serialized);
  if (status === 400 || code === 'INVALID_REQUEST') {
    return failure('invalid-request', 'The AI pack request was not accepted. Use the built-in pack instead.');
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return failure('rate-limited', 'The AI pack limit has been reached. Use the built-in pack instead.');
  }
  if (status === 503 || code === 'AI_NOT_CONFIGURED') {
    return failure('not-configured', 'Family Frequency AI is not configured. Use the built-in pack instead.');
  }
  return failure('service-error', 'The AI pack could not be generated. Use the built-in pack instead.');
}

function parseErrorCode(serialized: string): string | undefined {
  try {
    const value = JSON.parse(serialized) as unknown;
    return value && typeof value === 'object' && typeof (value as { code?: unknown }).code === 'string'
      ? (value as { code: string }).code
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeServiceUrl(value: string): string {
  const parsed = new URL(value);
  const localHttp = parsed.protocol === 'http:' && (
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1' ||
    isPrivateIpv4(parsed.hostname)
  );
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('Family Frequency AI requires HTTPS, except on localhost or a private LAN.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Invalid Family Frequency AI service URL.');
  }
  return parsed.toString().replace(/\/$/, '');
}

function isPrivateIpv4(hostname: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const match = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
  return value.length;
}
