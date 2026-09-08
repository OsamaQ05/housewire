import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaseForgeAiServer } from '../server/case-forge-ai';
import {
  FAMILY_FREQUENCY_PROVIDER_ID,
  FamilyFrequencyAiClient,
  parseFamilyFrequencyPack,
  type FamilyFrequencyPackRequest,
} from '../src/features/trivia/family-frequency-ai-client';

const request: FamilyFrequencyPackRequest = {
  style: 'mixed',
  count: 4,
  seed: 0x7a11ce,
};

const generatedItems = [
  {
    kind: 'preference-match',
    prompt: 'An unexpected free hour opens up. Which activity gets picked first?',
    options: ['Watch something', 'Go outside', 'Make something', 'Take a quiet break'],
  },
  {
    kind: 'family-lore-ordering',
    prompt: 'Put these parts of a relaxed weekend in the order that feels most natural.',
    options: ['First shared food', 'An outside errand', 'A quiet hour', 'Last kitchen visit'],
  },
  {
    kind: 'spectrum-read',
    prompt: 'How ready are you to take a scenic detour during a relaxed family drive?',
    minLabel: 'Direct route',
    maxLabel: 'Take the detour',
  },
  {
    kind: 'same-wavelength',
    prompt: 'No options: name one snack you would reach for during a family film.',
    inputHint: 'One short snack name',
  },
] as const;

const running: CaseForgeAiServer[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.stop()));
});

function modelResponse(items: unknown = generatedItems): Response {
  return new Response(JSON.stringify({
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Family Frequency AI endpoint', () => {
  it('sends only safe style, count, and seed context to the Responses API', async () => {
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        input: string;
        model: string;
        store: boolean;
        text: { format: { type: string; schema: { properties: { items: { minItems: number; maxItems: number } } } } };
      };
      const context = JSON.parse(payload.input) as Record<string, unknown>;
      expect(context).toEqual({ style: 'mixed', count: 4, seed: 0x7a11ce });
      expect(Object.keys(context).sort()).toEqual(['count', 'seed', 'style']);
      expect(payload.input).not.toMatch(/name|player|familyData|Mara|Samir/i);
      expect(payload.model).toBe('gpt-5.4');
      expect(payload.store).toBe(false);
      expect(payload.text.format.type).toBe('json_schema');
      expect(payload.text.format.schema.properties.items).toMatchObject({ minItems: 4, maxItems: 4 });
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-only-key' });
      return modelResponse();
    });
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: upstream as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();
    const client = new FamilyFrequencyAiClient({ baseUrl: address.url });

    const result = await client.generatePack(request);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.pack).toMatchObject({
      providerId: FAMILY_FREQUENCY_PROVIDER_ID,
      style: 'mixed',
      count: 4,
      seed: 0x7a11ce,
    });
    expect(result.pack.items.map((item) => item.kind)).toEqual(generatedItems.map((item) => item.kind));
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('rejects extra identity or family fields before calling the model', async () => {
    const upstream = vi.fn();
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: upstream as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();

    const response = await fetch(`${address.url}/family-frequency/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocolVersion: 1,
        request: { ...request, playerNames: ['Mara'], familyData: 'private' },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects sensitive model content instead of passing it to a phone', async () => {
    const unsafe = generatedItems.map((item, index) => index === 0
      ? { ...item, prompt: 'Which family trauma caused the worst conflict at home?' }
      : item);
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: vi.fn(async () => modelResponse(unsafe)) as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();

    const response = await fetch(`${address.url}/family-frequency/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, request }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'PACK_GENERATION_FAILED' });
  });

  it('rejects a choice-shaped prompt mislabeled as an ordering round', async () => {
    const mislabeled = generatedItems.map((item, index) => index === 1
      ? { ...item, prompt: 'Which road trip stop would get picked first?' }
      : item);
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: vi.fn(async () => modelResponse(mislabeled)) as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();

    const response = await fetch(`${address.url}/family-frequency/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, request }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'PACK_GENERATION_FAILED' });
  });

  it('reports the built-in fallback when the server has no API key', async () => {
    const server = new CaseForgeAiServer({ host: '127.0.0.1', port: 0 });
    running.push(server);
    const address = await server.start();
    const client = new FamilyFrequencyAiClient({ baseUrl: address.url });

    await expect(client.generatePack(request)).resolves.toMatchObject({
      ok: false,
      reason: 'not-configured',
    });
  });
});

describe('FamilyFrequencyAiClient', () => {
  it('never sends a model key and returns a typed offline result on network failure', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).not.toHaveProperty('Authorization');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toEqual({ protocolVersion: 1, request });
      throw new TypeError('network unavailable');
    });
    const client = new FamilyFrequencyAiClient({
      baseUrl: 'http://192.168.1.20:8788',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.generatePack(request)).resolves.toEqual({
      ok: false,
      reason: 'offline',
      message: 'Family Frequency AI is unavailable. Use the built-in pack instead.',
    });
  });

  it('validates matching metadata, kind coverage, unique cards, prompts, and options', () => {
    const pack = {
      id: 'frequency-test-4',
      providerId: FAMILY_FREQUENCY_PROVIDER_ID,
      ...request,
      items: generatedItems.map((item, index) => ({ ...item, id: `frequency-test-${index + 1}` })),
    };
    expect(parseFamilyFrequencyPack(pack).items).toHaveLength(4);
    expect(() => parseFamilyFrequencyPack({
      ...pack,
      items: pack.items.map((item, index) => index === 1 ? { ...item, prompt: pack.items[0].prompt } : item),
    })).toThrow(/prompts must be unique/i);
    expect(() => parseFamilyFrequencyPack({
      ...pack,
      items: pack.items.map((item, index) => index === 1 ? { ...item, id: pack.items[0].id } : item),
    })).toThrow(/ids must be unique/i);
    expect(() => parseFamilyFrequencyPack({
      ...pack,
      items: pack.items.map((item, index) => index === 1
        ? { ...item, options: ['Same', 'same', 'Third', 'Fourth'] }
        : item),
    })).toThrow(/options must be unique/i);
    expect(() => parseFamilyFrequencyPack({
      ...pack,
      items: pack.items.map((item, index) => index === 1
        ? { ...item, prompt: 'Which road trip stop would get picked first?' }
        : item),
    })).toThrow(/ordering prompts must ask players to order all four/i);
    expect(() => parseFamilyFrequencyPack({
      ...pack,
      items: pack.items.map((item, index) => index === 2
        ? { ...item, maxLabel: item.kind === 'spectrum-read' ? item.minLabel : 'Same' }
        : item),
    })).toThrow(/anchors must differ/i);
  });
});
