import { describe, expect, it, vi } from 'vitest';

import { createQuickFamilyTriviaSetup, familyTriviaQuestionFingerprint } from '../src/domain/family-trivia';
import {
  FAMILY_FREQUENCY_PROVIDER_ID,
  parseFamilyFrequencyPack,
  type FamilyFrequencyPack,
  type FamilyFrequencyStyle,
} from '../src/features/trivia/family-frequency-ai-client';
import {
  adaptAiPack,
  buildFamilyFrequencyPack,
} from '../src/features/trivia/family-frequency-service';
import { parseFamilyFrequencyVarietyLedger } from '../src/features/trivia/family-frequency-variety';

const setup = createQuickFamilyTriviaSetup(['Mara', 'Samir', 'Noor']);

function aiPack(seed = 4242): FamilyFrequencyPack {
  return parseFamilyFrequencyPack({
    id: `frequency-${seed.toString(36)}-4`,
    providerId: FAMILY_FREQUENCY_PROVIDER_ID,
    style: 'mixed',
    count: 4,
    seed,
    items: [
      {
        id: 'frequency-choice-1',
        kind: 'preference-match',
        prompt: 'An unexpected free hour opens up. Which activity gets picked first?',
        options: ['Watch something', 'Go outside', 'Make something', 'Take a quiet break'],
      },
      {
        id: 'frequency-order-2',
        kind: 'family-lore-ordering',
        prompt: 'Put these parts of a relaxed weekend in the order that feels most natural.',
        options: ['First shared food', 'An outside errand', 'A quiet hour', 'Last kitchen visit'],
      },
      {
        id: 'frequency-spectrum-3',
        kind: 'spectrum-read',
        prompt: 'How ready are you to take a scenic detour during a relaxed family drive?',
        minLabel: 'Direct route',
        maxLabel: 'Take the detour',
      },
      {
        id: 'frequency-word-4',
        kind: 'same-wavelength',
        prompt: 'No options: name one snack you would reach for during a family film.',
        inputHint: 'One short snack name',
      },
    ],
  });
}

function expandedAiPack(seed = 4242, style: FamilyFrequencyStyle = 'mixed'): FamilyFrequencyPack {
  const base = aiPack(seed);
  const sources = [
    ...base.items,
    {
      id: 'frequency-pair-5',
      kind: 'who-knows-who' as const,
      prompt: 'Plans move forward by twenty minutes. What gets checked first?',
      options: ['The new time', 'The route', 'What to bring', 'Who is coming'] as const,
    },
    {
      id: 'frequency-memory-6',
      kind: 'shared-memory-detail' as const,
      prompt: 'Think of a recent meal somewhere new. Which detail stands out first?',
      options: ['The main dish', 'The music', 'The table', 'The trip there'] as const,
    },
  ];
  return parseFamilyFrequencyPack({
    ...base,
    id: `frequency-${seed.toString(36)}-12`,
    style,
    count: 12,
    items: Array.from({ length: 12 }, (_, index) => {
      const source = sources[index % sources.length];
      return {
        ...source,
        id: `frequency-candidate-${index + 1}`,
        prompt: `${source.prompt} Set ${index + 1}.`,
      };
    }),
  });
}

describe('Family Frequency AI adaptation', () => {
  it('keeps identities local and preserves each domain mechanic', () => {
    const pack = adaptAiPack(aiPack(), setup);
    const ordering = pack.questions.find((question) => question.kind === 'family-lore-ordering');
    const spectrum = pack.questions.find((question) => question.kind === 'spectrum-read');
    const wavelength = pack.questions.find((question) => question.kind === 'same-wavelength');

    expect(pack.source).toEqual({ kind: 'ai', providerId: FAMILY_FREQUENCY_PROVIDER_ID });
    expect(pack.questions.map((question) => question.authorityPlayerId)).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-1',
    ]);
    expect(ordering).toMatchObject({ answerKind: 'ordering', canSkip: true });
    expect(spectrum).toMatchObject({
      answerKind: 'spectrum',
      canSkip: true,
      scale: { min: 0, max: 100, step: 5, minLabel: 'Direct route', maxLabel: 'Take the detour' },
    });
    expect(wavelength).toMatchObject({ answerKind: 'text', canSkip: true, maxLength: 40 });
    expect(pack.questions.flatMap((question) => question.options).every((option) => option.id.length <= 64)).toBe(true);
  });

  it('keeps team role topology fair across selected lengths and seeds', () => {
    const teamSetup = createQuickFamilyTriviaSetup(['Mara', 'Samir', 'Noor', 'Leen'], { teams: true });
    for (const count of [4, 8, 12] as const) {
      for (let seed = 0; seed < 64; seed += 1) {
        const pack = adaptAiPack(expandedAiPack(seed), teamSetup, { count });
        expect(pack.questions).toHaveLength(count);
        expect(pack.questions.every((question) => question.canSkip)).toBe(true);
        for (const question of pack.questions) {
          expect(question.respondentPlayerIds).toHaveLength(1);
          const authorityTeam = teamSetup.teams.find((team) => team.memberPlayerIds.includes(question.authorityPlayerId))!;
          expect(authorityTeam.memberPlayerIds).toContain(question.respondentPlayerIds[0]);
        }
      }
    }
  });
});

describe('Family Frequency service fallback', () => {
  it('normalizes a trailing slash and adapts a validated remote pack', async () => {
    const generated = aiPack();
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/health')) {
        expect(String(url)).toBe('http://192.168.1.20:8788/health');
        return new Response(JSON.stringify({ status: 'ok', aiConfigured: true }), { status: 200 });
      }
      expect(String(url)).toBe('http://192.168.1.20:8788/family-frequency/pack');
      const envelope = JSON.parse(String(init?.body)) as { protocolVersion: number; request: Record<string, unknown> };
      expect(envelope).toEqual({
        protocolVersion: 1,
        request: { style: 'mixed', count: 4, seed: 4242 },
      });
      expect(JSON.stringify(envelope)).not.toMatch(/Mara|Samir|Noor|player-/);
      return new Response(JSON.stringify({ protocolVersion: 1, pack: generated }), { status: 200 });
    });

    const result = await buildFamilyFrequencyPack(
      { count: 4, seed: 4242, setup },
      { baseUrl: 'http://192.168.1.20:8788/', fetchImpl: fetchImpl as typeof fetch },
    );

    expect(result.source).toBe('ai');
    expect(result.fallbackReason).toBeUndefined();
    expect(result.pack.source.kind).toBe('ai');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('distinguishes not configured, offline, and invalid model responses', async () => {
    const notConfigured = await buildFamilyFrequencyPack(
      { count: 4, seed: 9, setup },
      {
        baseUrl: 'http://192.168.1.20:8788',
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({ aiConfigured: false }), { status: 200 })) as typeof fetch,
      },
    );
    expect(notConfigured).toMatchObject({ source: 'offline', fallbackReason: 'not-configured' });
    expect(notConfigured.pack.source.kind).toBe('offline');

    const offline = await buildFamilyFrequencyPack(
      { count: 4, seed: 10, setup },
      {
        baseUrl: 'http://192.168.1.20:8788',
        fetchImpl: vi.fn(async () => { throw new TypeError('offline'); }) as typeof fetch,
      },
    );
    expect(offline).toMatchObject({ source: 'offline', fallbackReason: 'offline' });

    let calls = 0;
    const invalid = await buildFamilyFrequencyPack(
      { count: 4, seed: 11, setup },
      {
        baseUrl: 'http://192.168.1.20:8788',
        fetchImpl: vi.fn(async () => {
          calls += 1;
          return calls === 1
            ? new Response(JSON.stringify({ aiConfigured: true }), { status: 200 })
            : new Response(JSON.stringify({ protocolVersion: 1, pack: { unsafe: true } }), { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(invalid).toMatchObject({ source: 'offline', fallbackReason: 'invalid-response' });
    expect(invalid.pack.source.kind).toBe('offline');
  });

  it('uses the local ledger to rotate style and filter repeats without transmitting it', async () => {
    const generated = expandedAiPack(7007, 'playful');
    const repeated = generated.items[0];
    const varietyLedger = parseFamilyFrequencyVarietyLedger({
      version: 1,
      recentPrompts: [{
        fingerprint: familyTriviaQuestionFingerprint(
          repeated.kind,
          repeated.prompt,
          repeated.kind === 'spectrum-read'
            ? [repeated.minLabel, repeated.maxLabel]
            : repeated.kind === 'same-wavelength'
              ? [repeated.inputHint]
              : repeated.options,
        ),
        kind: repeated.kind,
      }],
      recentStyles: ['mixed', 'everyday', 'mixed'],
    });
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok', aiConfigured: true }), { status: 200 });
      }
      const serialized = String(init?.body);
      const envelope = JSON.parse(serialized) as { request: Record<string, unknown> };
      expect(envelope.request).toEqual({ style: 'playful', count: 12, seed: 7007 });
      expect(serialized).not.toContain(repeated.prompt);
      expect(serialized).not.toContain(varietyLedger.recentPrompts[0].fingerprint);
      expect(serialized).not.toMatch(/recent|ledger|answer|guess|score|Mara|Samir|Noor/i);
      return new Response(JSON.stringify({ protocolVersion: 1, pack: generated }), { status: 200 });
    });

    const result = await buildFamilyFrequencyPack(
      { count: 4, seed: 7007, setup, varietyLedger },
      { baseUrl: 'http://192.168.1.20:8788', fetchImpl: fetchImpl as typeof fetch },
    );

    expect(result).toMatchObject({ source: 'ai', style: 'playful' });
    expect(result.pack.questions).toHaveLength(4);
    expect(result.pack.questions.map((question) => question.prompt)).not.toContain(repeated.prompt);
  });
});
