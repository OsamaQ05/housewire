import { describe, expect, it, vi } from 'vitest';

import {
  generateOfflineForgeCase,
  type ForgeCase,
  type ForgeGenerationRequest,
} from '../src/domain/case-forge';
import {
  AsyncStorageForgeCaseRepository,
  createForgeNarrativeCandidates,
  HttpNarrativeCaseForgeProvider,
  MemoryForgeCaseRepository,
  OfflineCaseForgeProvider,
  createCaseForgeService,
  exportForgeCaseBackup,
  exportForgeCasePreview,
  importForgeCaseBackup,
  preservesForgeMechanicalContract,
  type ForgeCaseProvider,
  type KeyValueStorage,
} from '../src/services/case-forge';

function request(overrides: Partial<ForgeGenerationRequest> = {}): ForgeGenerationRequest {
  return {
    seed: 'SERVICE-TEST',
    generatedAt: 1_800_000_000_000,
    playerIds: ['a', 'b', 'c'],
    difficulty: 3,
    targetMinutes: 30,
    tone: 'mystery',
    intensity: 'balanced',
    safeMovement: true,
    noiseAllowed: true,
    ...overrides,
  };
}

class FakeStorage implements KeyValueStorage {
  values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe('Case Forge repositories and exports', () => {
  it('round-trips a private backup with integrity and exports an answer-free preview', () => {
    const game = generateOfflineForgeCase(request());
    expect(importForgeCaseBackup(exportForgeCaseBackup(game, 1_900_000_000_000))).toEqual(game);

    const backup = JSON.parse(exportForgeCaseBackup(game)) as Record<string, unknown>;
    (backup.case as ForgeCase).title = 'Tampered';
    expect(() => importForgeCaseBackup(JSON.stringify(backup))).toThrow(/integrity/i);

    const preview = JSON.parse(exportForgeCasePreview(game)) as { case: Record<string, unknown> };
    expect(preview.case).not.toHaveProperty('stages');
    expect(preview.case).not.toHaveProperty('solution');
    expect(preview.case).not.toHaveProperty('recipe');
    expect(preview.case).toHaveProperty('stageTitles');
  });

  it('rejects oversized, polluted, and invalid imports', () => {
    expect(() => importForgeCaseBackup('x'.repeat(512 * 1_024 + 1))).toThrow(/limit/i);
    expect(() => importForgeCaseBackup('{"__proto__":{},"format":"housewire-forge-backup"}')).toThrow(/forbidden/i);
    expect(() => importForgeCaseBackup('{}')).toThrow(/unsupported/i);
  });

  it('persists validated cases across repository instances and serializes concurrent writes', async () => {
    const storage = new FakeStorage();
    const first = new AsyncStorageForgeCaseRepository(storage, 'test-library');
    const cases = Array.from({ length: 5 }, (_, replayIndex) =>
      generateOfflineForgeCase(request({ replayIndex, generatedAt: 1_800_000_000_000 + replayIndex })),
    );
    await Promise.all(cases.map((game) => first.save(game)));
    const second = new AsyncStorageForgeCaseRepository(storage, 'test-library');
    expect(await second.list()).toHaveLength(5);
    expect(await second.get(cases[3].id)).toEqual(cases[3]);
    expect(await second.remove(cases[3].id)).toBe(true);
    expect(await second.remove(cases[3].id)).toBe(false);
    expect(await second.list()).toHaveLength(4);
  });

  it('repairs a library with one damaged record without losing playable cases', async () => {
    const storage = new FakeStorage();
    const game = generateOfflineForgeCase(request());
    storage.values.set('repair-library', JSON.stringify([game, { id: 'damaged-case' }]));
    const repository = new AsyncStorageForgeCaseRepository(storage, 'repair-library');

    await expect(repository.list()).resolves.toHaveLength(1);
    await expect(repository.get(game.id)).resolves.toEqual(game);
    expect(JSON.parse(storage.values.get('repair-library') ?? '[]')).toEqual([game]);
  });

  it('clones values at the in-memory repository boundary', async () => {
    const repository = new MemoryForgeCaseRepository();
    const game = generateOfflineForgeCase(request());
    await repository.save(game);
    const loaded = await repository.get(game.id);
    if (!loaded) throw new Error('Missing saved case.');
    (loaded as { title: string }).title = 'Mutation';
    expect((await repository.get(game.id))?.title).toBe(game.title);
  });
});

describe('Case Forge providers and service', () => {
  it('allows only narrative reskin fields to change', () => {
    const base = generateOfflineForgeCase(request());
    const narrative = JSON.parse(JSON.stringify(base)) as ForgeCase;
    narrative.title = 'A Better Title';
    narrative.tagline = 'A new but bounded hook.';
    (narrative.roles[0] as { title: string }).title = 'Chronologist';
    (narrative.stages[0] as { storyBeat: string }).storyBeat = 'The mechanism opens with a new story beat.';
    expect(preservesForgeMechanicalContract(base, narrative)).toBe(true);

    const unsafe = JSON.parse(JSON.stringify(narrative)) as ForgeCase;
    (unsafe.stages[0] as { instruction: string }).instruction = 'Skip the puzzle.';
    expect(preservesForgeMechanicalContract(base, unsafe)).toBe(false);

    const answerChange = JSON.parse(JSON.stringify(narrative)) as ForgeCase;
    const riddleStage = answerChange.stages.find((stage) => stage.solution.kind === 'word');
    if (!riddleStage || riddleStage.solution.kind !== 'word' || riddleStage.mechanic.kind !== 'split-riddle') {
      throw new Error('Expected a generated split-riddle stage.');
    }
    const originalAnswer = riddleStage.solution.answer;
    (riddleStage.solution as { answer: string }).answer = riddleStage.mechanic.candidates
      .find((candidate) => candidate.id !== originalAnswer)!.id;
    expect(preservesForgeMechanicalContract(base, answerChange)).toBe(false);
  });

  it('calls the remote reskin protocol without placing a model API key in the case', async () => {
    const input = request({ customThemePrompt: 'an old family observatory' });
    const local = generateOfflineForgeCase(input);
    const remote = JSON.parse(JSON.stringify(local)) as ForgeCase;
    remote.title = 'The Family Observatory';
    remote.premise = 'A dormant observatory divides one celestial mechanism across the crew.';
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { protocolVersion: number; baseCase?: ForgeCase };
      expect(body.protocolVersion).toBe(1);
      expect(body.baseCase).toBeUndefined();
      expect(init?.headers).not.toHaveProperty('Authorization');
      return new Response(JSON.stringify({ protocolVersion: 1, case: remote }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const provider = new HttpNarrativeCaseForgeProvider({
      baseUrl: 'http://192.168.1.20:8788',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await provider.generate(input);
    expect(result.title).toBe('The Family Observatory');
    expect(result.providerId).toBe(provider.id);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('offers the model distinct validated cuts and rejects mechanics outside that set', async () => {
    const input = request({ customThemePrompt: 'a lighthouse receiving tomorrow’s weather' });
    const candidates = createForgeNarrativeCandidates(input);
    expect(candidates).toHaveLength(4);
    expect(candidates.every((candidate) => candidate.validation.status === 'playable')).toBe(true);
    expect(new Set(candidates.map((candidate) => JSON.stringify(candidate.stages.map((stage) => stage.solution)))).size)
      .toBeGreaterThan(1);

    const rogue = generateOfflineForgeCase({ ...input, seed: 'not-a-permitted-cut' });
    const provider = new HttpNarrativeCaseForgeProvider({
      baseUrl: 'http://192.168.1.20:8788',
      fetchImpl: vi.fn(async () => new Response(
        JSON.stringify({ protocolVersion: 1, case: rogue }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch,
    });
    await expect(provider.generate(input)).rejects.toThrow(/outside the validated candidate set/i);
  });

  it('uses the narrative service only when its health endpoint confirms an API key', async () => {
    const configuredFetch = vi.fn(async () => new Response(
      JSON.stringify({ status: 'ok', aiConfigured: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const configured = new HttpNarrativeCaseForgeProvider({
      baseUrl: 'http://192.168.1.20:8788',
      fetchImpl: configuredFetch as typeof fetch,
    });
    await expect(configured.isAvailable()).resolves.toBe(true);
    expect(configuredFetch).toHaveBeenCalledWith(
      'http://192.168.1.20:8788/health',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );

    const offline = new HttpNarrativeCaseForgeProvider({
      baseUrl: 'http://192.168.1.20:8788',
      fetchImpl: vi.fn(async () => new Response(
        JSON.stringify({ status: 'ok', aiConfigured: false }),
        { status: 200 },
      )) as typeof fetch,
    });
    await expect(offline.isAvailable()).resolves.toBe(false);
  });

  it('rejects a remote puzzle mutation and the service falls back offline', async () => {
    const remoteProvider: ForgeCaseProvider = {
      id: 'broken-remote',
      mode: 'remote',
      async isAvailable() { return true; },
      async generate() { throw new Error('Remote validation failed.'); },
    };
    const repository = new MemoryForgeCaseRepository();
    const service = createCaseForgeService({ repository, providers: [remoteProvider] });
    const result = await service.generate(request(), { providerId: remoteProvider.id });
    expect(result.providerId).toBe(new OfflineCaseForgeProvider().id);
    expect(await repository.get(result.id)).toEqual(result);
    await expect(service.generate(request(), {
      providerId: remoteProvider.id,
      allowOfflineFallback: false,
    })).rejects.toThrow(/validation failed/i);
  });

  it('regenerates with a new replay, persists it, and supports service backup import', async () => {
    const repository = new MemoryForgeCaseRepository();
    let now = 1_800_000_000_000;
    const service = createCaseForgeService({ repository, now: () => ++now });
    const first = await service.generate(request());
    const replay = await service.regenerate(first.id, { difficulty: 5 });
    expect(replay.replayIndex).toBe(first.replayIndex + 1);
    expect(replay.difficulty).toBe(5);
    expect(replay.effectiveSeed).not.toBe(first.effectiveSeed);
    expect(await service.list()).toHaveLength(2);
    const serialized = await service.exportBackup(replay.id);
    await service.remove(replay.id);
    expect(await service.get(replay.id)).toBeNull();
    expect((await service.importBackup(serialized)).id).toBe(replay.id);
  });
});
