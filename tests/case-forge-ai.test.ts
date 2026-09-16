import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateOfflineForgeCase, type ForgeGenerationRequest } from '../src/domain/case-forge';
import {
  createForgeNarrativeCandidates,
  preservesForgeMechanicalContract,
} from '../src/services/case-forge/providers';
import { CaseForgeAiServer } from '../server/case-forge-ai';

const request: ForgeGenerationRequest = {
  seed: 'server-test',
  generatedAt: 1_780_000_000_000,
  playerIds: ['player-1', 'player-2', 'player-3'],
  playerNames: { 'player-1': 'Mara', 'player-2': 'Samir', 'player-3': 'Leen' },
  difficulty: 4,
  targetMinutes: 30,
  tone: 'mystery',
  intensity: 'intense',
  safeMovement: true,
  noiseAllowed: true,
  customThemePrompt: 'A lighthouse receiving tomorrow’s weather reports',
};

const running: CaseForgeAiServer[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.stop()));
});

describe('CaseForgeAiServer', () => {
  it('reports an honest offline state and refuses paid generation without a key', async () => {
    const server = new CaseForgeAiServer({ host: '127.0.0.1', port: 0 });
    running.push(server);
    const address = await server.start();

    const health = await fetch(`${address.url}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'ok', aiConfigured: false });

    const response = await fetch(`${address.url}/case-forge/reskin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, request }),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('merges a structured narrative pass without changing any playable contract', async () => {
    const baseCase = generateOfflineForgeCase(request);
    const selectedMechanicalCase = createForgeNarrativeCandidates(request)[2]!;
    const skin = {
      candidateIndex: 2,
      title: 'THE WEATHER BELOW',
      tagline: 'A forecast is climbing the lighthouse from underneath the sea.',
      premise: 'A sealed lighthouse has begun broadcasting tomorrow’s storm through rooms that have no windows.',
      objective: 'Reconstruct the warning, route it through the lantern room, and close the impossible weather channel.',
      ending: 'The final forecast collapses into static as the real dawn reaches the glass.',
      roles: selectedMechanicalCase.roles.map((role, index) => ({
        id: role.id,
        title: ['Keeper', 'Barometer', 'Lamplighter'][index] ?? `Keeper ${index + 1}`,
        brief: `You hold one private layer of the lighthouse report for station ${index + 1}.`,
        responsibility: `Protect station ${index + 1} and reveal its evidence only when the crew needs it.`,
      })),
      stages: selectedMechanicalCase.stages.map((stage, index) => ({
        id: stage.id,
        title: `Forecast ${index + 1}`,
        storyBeat: `The false storm reaches lighthouse level ${index + 1}, changing the shape of the next room.`,
      })),
    };
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        input: string;
        model: string;
        store: boolean;
        text: { format: { type: string } };
      };
      expect(payload.model).toBe('gpt-5.4');
      expect(payload.store).toBe(false);
      expect(payload.text.format.type).toBe('json_schema');
      expect(payload.input).toContain('"candidates"');
      expect(JSON.parse(payload.input)).toMatchObject({ requestedTheme: request.customThemePrompt, customWorld: true });
      expect(payload.input).toContain('"instruction"');
      expect(payload.input).not.toContain('"solution"');
      expect(payload.input).not.toContain('"privateClues"');
      expect(payload.input).not.toContain('"playerName"');
      expect(payload.input).not.toContain('"visiblePieces"');
      expect(payload.input).not.toContain('"recipientPattern"');
      expect(payload.input).not.toContain('player-1');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-only-key' });
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(skin) }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: upstream as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();

    const response = await fetch(`${address.url}/case-forge/reskin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, request }),
    });
    expect(response.status).toBe(200);
    const envelope = await response.json() as { protocolVersion: number; case: typeof baseCase };
    expect(envelope.protocolVersion).toBe(1);
    expect(envelope.case.title).toBe('THE WEATHER BELOW');
    expect(envelope.case.stages[0]?.title).toBe('Forecast 1');
    expect(preservesForgeMechanicalContract(selectedMechanicalCase, envelope.case)).toBe(true);
    expect(preservesForgeMechanicalContract(baseCase, envelope.case)).toBe(false);
    expect(envelope.case.stages.map((stage) => stage.solution)).toEqual(selectedMechanicalCase.stages.map((stage) => stage.solution));
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects public-web origins before they can trigger a paid request', async () => {
    const upstream = vi.fn();
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: upstream as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();

    const response = await fetch(`${address.url}/case-forge/reskin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' },
      body: JSON.stringify({ protocolVersion: 1, request }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'ORIGIN_DENIED' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('normalizes multiline custom worlds and accepts shuffled but matching narrative ids', async () => {
    const input = { ...request, themeId: 'abyssal-relay' as const, customThemePrompt: ' A desert hotel\nwith a missing\tguest book ' };
    const mechanical = createForgeNarrativeCandidates(input)[0];
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(JSON.parse(body.input)).toMatchObject({ selectedWorld: 'abyssal-relay', requestedTheme: 'A desert hotel with a missing guest book', customWorld: true });
      expect(body.instructions).toContain('do not replace a custom setting');
      return new Response(JSON.stringify({ output_text: JSON.stringify({
        candidateIndex: 0, title: 'The Desert Guest Book', tagline: 'Recover the hotel’s vanished register.', premise: 'A sandstorm seals the hotel.', objective: 'Find the register and reopen the courtyard.', ending: 'The courtyard opens.',
        roles: [...mechanical.roles].reverse().map(({ id, title, brief, responsibility }) => ({ id, title, brief, responsibility })),
        stages: [...mechanical.stages].reverse().map(({ id, title, storyBeat }) => ({ id, title, storyBeat })),
      }) }), { status: 200 });
    });
    const server = new CaseForgeAiServer({ host: '127.0.0.1', port: 0, apiKey: 'test-key', fetchImpl: upstream as typeof fetch });
    running.push(server);
    const { url } = await server.start();
    const response = await fetch(url + '/case-forge/reskin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ protocolVersion: 1, request: input }) });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.case.recipe.customThemePrompt).toBe('A desert hotel with a missing guest book');
    expect(preservesForgeMechanicalContract(mechanical, result.case)).toBe(true);
  });

  it('cancels the model request when the phone disconnects', async () => {
    let markStarted: (() => void) | undefined;
    let markAborted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const aborted = new Promise<void>((resolve) => { markAborted = resolve; });
    const upstream = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      markStarted?.();
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = () => {
          markAborted?.();
          reject(new Error('upstream aborted'));
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
    });
    const server = new CaseForgeAiServer({
      apiKey: 'test-only-key',
      fetchImpl: upstream as typeof fetch,
      host: '127.0.0.1',
      port: 0,
    });
    running.push(server);
    const address = await server.start();
    const controller = new AbortController();
    const pending = fetch(`${address.url}/case-forge/reskin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, request }),
      signal: controller.signal,
    }).catch(() => undefined);

    await started;
    controller.abort();
    await aborted;
    await pending;
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('caps optional model calls globally instead of multiplying the budget per LAN address', async () => {
    const server = new CaseForgeAiServer({ host: '127.0.0.1', port: 0 });
    running.push(server);
    const address = await server.start();
    const statuses: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      const response = await fetch(`${address.url}/case-forge/reskin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocolVersion: 1, request }),
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(503));
    expect(statuses[8]).toBe(429);
  });
});
