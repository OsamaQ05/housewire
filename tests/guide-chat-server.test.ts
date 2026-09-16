import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseForgeAiServer } from '../server/case-forge-ai';
import { makeGuideRequest } from '../src/features/director/guide-domain';

const running: CaseForgeAiServer[] = [];
afterEach(async () => { await Promise.all(running.splice(0).map(server => server.stop())); });
async function boot(options: ConstructorParameters<typeof CaseForgeAiServer>[0] = {}) {
  const server = new CaseForgeAiServer({ host: '127.0.0.1', port: 0, ...options });
  running.push(server); return (await server.start()).url;
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => fetch(url + '/guide/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const output = (text: string) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text }] }] }));
const context = { title: 'Last Light', objective: 'Restore the light', role: 'Witness', clues: ['I speak without a mouth.'], progress: 'Module 1, no strikes' };

describe('conversational GPT guide', () => {
  it('labels offline coaching honestly when no key is present', async () => {
    const result = await post(await boot(), makeGuideRequest('How do we compare clues?', 'defusal'));
    expect(await result.json()).toMatchObject({ source: 'local', fallbackReason: 'not-configured', reply: expect.any(String) });
  });
  it('validates limits and rejects unapproved payload fields', async () => {
    const upstream = vi.fn(); const url = await boot({ apiKey: 'test-only', fetchImpl: upstream });
    for (const request of [
      { ...makeGuideRequest('How?', 'route'), solution: 'SECRET' },
      { ...makeGuideRequest('How?', 'route'), question: 'a'.repeat(281) },
      { ...makeGuideRequest('How?', 'route'), context: { ...context, seed: 123 } },
    ]) expect((await post(url, request)).status).toBe(400);
    expect((await post(url, { question: 'a'.repeat(66000) })).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('writes free text with actual clues/history, then reviews it before returning', async () => {
    const reply = 'Look at how the clue uses “speak”. Does that word have to mean a living speaker?';
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('gpt-5.4'); expect(body.store).toBe(false);
      if (body.text) {
        expect(body.text.format.name).toBe('spoiler_review');
        expect(JSON.parse(body.input).proposedReply).toBe(reply);
        return output('{"safe":true}');
      }
      expect(body.instructions).toContain('NO SPOILERS');
      expect(JSON.parse(body.input)).toMatchObject({ context, recentConversation: [{ question: 'Where do we start?', reply: 'Read the clue aloud.' }] });
      return output(reply);
    });
    const url = await boot({ apiKey: 'test-only', fetchImpl: upstream });
    const result = await post(url, makeGuideRequest('What does speaking mean here?', 'riddle', [], context, [{ question: 'Where do we start?', reply: 'Read the clue aloud.' }]));
    expect(await result.json()).toMatchObject({ source: 'ai', reply });
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('screens a solution disclosure instead of displaying it', async () => {
    let call = 0;
    const url = await boot({ apiKey: 'test-only', fetchImpl: async () => output(++call === 1 ? 'The answer is ECHO.' : '{"safe":false}') });
    const result = await (await post(url, makeGuideRequest('Help me', 'riddle', [], context))).json();
    expect(result).toMatchObject({ source: 'local', fallbackReason: 'safety' });
    expect(result.reply).not.toContain('ECHO');
  });
  it('lets GPT respond naturally to requests for answers, under no-spoiler instructions', async () => {
    let call = 0;
    const url = await boot({ apiKey: 'test-only', fetchImpl: async () => output(++call === 1 ? 'I won’t solve it for you, but which line is confusing you?' : '{"safe":true}') });
    expect(await (await post(url, makeGuideRequest('Reveal the answer', 'riddle'))).json()).toMatchObject({ source: 'ai', reply: expect.stringContaining('which line') });
    expect(call).toBe(2);
  });
  it.each(['not json', '{"safe":true,"answer":"secret"}', '{"safe":"true"}'])('fails closed on malformed reviewer output %s', async verdict => {
    let call = 0;
    const url = await boot({ apiKey: 'test-only', fetchImpl: async () => output(++call === 1 ? 'Read the clue carefully.' : verdict) });
    expect(await (await post(url, makeGuideRequest('How?', 'riddle'))).json()).toMatchObject({ source: 'local' });
  });
  it('reports upstream rate limiting without exposing the provider response', async () => {
    const url = await boot({ apiKey: 'test-only', fetchImpl: async () => new Response('PRIVATE_PROVIDER_ERROR', { status: 429 }) });
    const response = await (await post(url, makeGuideRequest('How?', 'riddle'))).json();
    expect(response).toMatchObject({ source: 'local', fallbackReason: 'busy' });
    expect(JSON.stringify(response)).not.toContain('PRIVATE_PROVIDER_ERROR');
  });
  it('times out with an explicit fallback', async () => {
    const url = await boot({ apiKey: 'test-only', requestTimeoutMs: 100, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))) });
    expect(await (await post(url, makeGuideRequest('How?', 'riddle'))).json()).toMatchObject({ source: 'local', fallbackReason: 'unavailable' });
  });
  it('rate limits requests', async () => {
    let now = 1000; const url = await boot({ now: () => now });
    for (let i = 0; i < 12; i += 1) expect((await post(url, makeGuideRequest('How?', 'route'))).status).toBe(200);
    expect((await post(url, makeGuideRequest('How?', 'route'))).status).toBe(429);
    now += 60_001;
    expect((await post(url, makeGuideRequest('How?', 'route'))).status).toBe(200);
  });
  it('rejects non-LAN browser origins', async () => {
    expect((await post(await boot(), makeGuideRequest('How?', 'route'), { Origin: 'https://attacker.example' })).status).toBe(403);
  });
});
