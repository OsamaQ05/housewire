import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFamilyTriviaSession,
  createQuickFamilyTriviaSetup,
  generateOfflineFamilyTriviaPack,
} from '../src/domain/family-trivia';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));

beforeEach(() => {
  vi.resetModules();
  asyncStorage.getItem.mockReset();
  asyncStorage.setItem.mockReset();
  asyncStorage.setItem.mockResolvedValue(undefined);
});

function savedSession() {
  const setup = createQuickFamilyTriviaSetup(['Mara', 'Samir', 'Noor']);
  const pack = generateOfflineFamilyTriviaPack({ questionCount: 4, seed: 99, setup });
  return createFamilyTriviaSession(setup, pack, 'frequency-resume-test');
}

describe('Family Frequency store persistence', () => {
  it('uses real sample names so generated third-person copy stays grammatical', async () => {
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({
      version: 1,
      names: ['You', 'Mara', 'Samir'],
      format: 'everyone',
      questionCount: 8,
      history: [],
      source: 'offline',
    }));
    const { familyFrequencySetupIssue, useFamilyFrequencyStore } = await import('../src/store/use-family-frequency-store');
    await vi.waitFor(() => expect(useFamilyFrequencyStore.getState().hydrated).toBe(true));

    expect(useFamilyFrequencyStore.getState().names).toEqual(['Noor', 'Mara', 'Samir']);
    expect(useFamilyFrequencyStore.getState().names).not.toContain('You');
    expect(familyFrequencySetupIssue(['Noor', 'Mara', 'Samir'], 'teams')).toMatch(/4 players/i);
    expect(familyFrequencySetupIssue(['Noor', 'Mara'], 'teams')).toMatch(/4 players/i);
    expect(familyFrequencySetupIssue(['Noor', 'Mara', 'Samir', 'Leen'], 'teams')).toBeUndefined();
  });

  it('restores a validated active private-handoff session and salvages valid preferences', async () => {
    const session = savedSession();
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({
      version: 1,
      format: 'teams',
      history: [{
        id: 'past-round',
        playedAt: '2026-09-08T00:00:00.000Z',
        format: 'everyone',
        roundCount: 4,
        source: 'offline',
        winners: ['Mara'],
        scores: [{ label: 'Mara', points: 3 }],
      }, { malformed: true }],
      names: [' Mara ', 42, 'mara', 'Noor'],
      questionCount: 12,
      session,
      source: 'offline',
    }));

    const { useFamilyFrequencyStore } = await import('../src/store/use-family-frequency-store');
    await vi.waitFor(() => expect(useFamilyFrequencyStore.getState().hydrated).toBe(true));

    expect(useFamilyFrequencyStore.getState()).toMatchObject({
      format: 'teams',
      names: ['Mara', 'Noor'],
      questionCount: 12,
      source: 'offline',
    });
    expect(useFamilyFrequencyStore.getState().session?.id).toBe('frequency-resume-test');
    expect(useFamilyFrequencyStore.getState().history).toHaveLength(1);
  });

  it('does not let a late disk read overwrite newer in-app choices', async () => {
    let resolveRead: ((value: string) => void) | undefined;
    asyncStorage.getItem.mockImplementation(() => new Promise<string>((resolve) => {
      resolveRead = resolve;
    }));
    const { useFamilyFrequencyStore } = await import('../src/store/use-family-frequency-store');

    useFamilyFrequencyStore.getState().setNames(['Fresh', 'Choice']);
    useFamilyFrequencyStore.getState().setQuestionCount(4);
    resolveRead?.(JSON.stringify({
      version: 1,
      names: ['Old', 'Disk'],
      format: 'teams',
      questionCount: 12,
      history: [],
      source: 'offline',
    }));
    await vi.waitFor(() => expect(useFamilyFrequencyStore.getState().hydrated).toBe(true));

    expect(useFamilyFrequencyStore.getState().names).toEqual(['Fresh', 'Choice']);
    expect(useFamilyFrequencyStore.getState().questionCount).toBe(4);
    await vi.waitFor(() => expect(asyncStorage.setItem).toHaveBeenCalled());
    const persisted = JSON.parse(String(asyncStorage.setItem.mock.calls.at(-1)?.[1])) as { names: string[]; questionCount: number };
    expect(persisted).toMatchObject({ names: ['Fresh', 'Choice'], questionCount: 4 });
  });

  it('drops a tampered session instead of exposing broken handoff state', async () => {
    const session = savedSession();
    asyncStorage.getItem.mockResolvedValue(JSON.stringify({
      version: 1,
      names: ['Mara', 'Samir', 'Noor'],
      format: 'everyone',
      questionCount: 4,
      history: [],
      source: 'offline',
      session: {
        ...session,
        playerScores: session.playerScores.map((score, index) => index === 0 ? { ...score, points: 999 } : score),
      },
    }));

    const { useFamilyFrequencyStore } = await import('../src/store/use-family-frequency-store');
    await vi.waitFor(() => expect(useFamilyFrequencyStore.getState().hydrated).toBe(true));

    expect(useFamilyFrequencyStore.getState().session).toBeUndefined();
  });

  it('persists a normalized team score and a metadata-only variety ledger', async () => {
    asyncStorage.getItem.mockResolvedValue(null);
    let module = await import('../src/store/use-family-frequency-store');
    await vi.waitFor(() => expect(module.useFamilyFrequencyStore.getState().hydrated).toBe(true));
    const setup = createQuickFamilyTriviaSetup(['Noor', 'Mara', 'Samir', 'Leen'], { teams: true });
    const pack = generateOfflineFamilyTriviaPack({ questionCount: 4, seed: 717, setup });
    const ordinary = pack.questions.find((question) => question.kind === 'preference-match')!;
    const fairPack = { ...pack, questions: [ordinary, ...pack.questions.filter((question) => question.id !== ordinary.id)] };
    module.useFamilyFrequencyStore.getState().startGame(setup, fairPack, 'playful');
    const question = module.useFamilyFrequencyStore.getState().session!.pack.questions[0];
    const answer = question.answerKind === 'choice'
      ? { kind: 'choice' as const, optionId: question.options[0].id }
      : { kind: 'ordering' as const, optionIds: question.options.map((option) => option.id) };
    expect(module.useFamilyFrequencyStore.getState().submitReference(question.authorityPlayerId, answer)).toBe(true);
    question.respondentPlayerIds.forEach((playerId) =>
      expect(module.useFamilyFrequencyStore.getState().submitGuess(playerId, answer)).toBe(true));
    expect(module.useFamilyFrequencyStore.getState().reveal()).toBe(true);
    const scoredTeam = module.useFamilyFrequencyStore.getState().session?.teamScores.find((score) => score.opportunities === 1);
    const waitingTeam = module.useFamilyFrequencyStore.getState().session?.teamScores.find((score) => score.opportunities === 0);
    expect(scoredTeam).toMatchObject({ points: 10_000, exactMatches: 1, opportunities: 1 });
    expect(waitingTeam).toMatchObject({ points: 0, exactMatches: 0, opportunities: 0 });
    await vi.waitFor(() => {
      const candidate = JSON.parse(String(asyncStorage.setItem.mock.calls.at(-1)?.[1] ?? '{}')) as { session?: { phase?: string } };
      expect(candidate.session?.phase).toBe('revealed');
    });
    const serialized = String(asyncStorage.setItem.mock.calls.at(-1)?.[1]);
    const stored = JSON.parse(serialized) as { varietyLedger: unknown };
    expect(JSON.stringify(stored.varietyLedger)).not.toMatch(/Noor|Mara|Samir|Leen|answer|guess|score/i);

    vi.resetModules();
    asyncStorage.getItem.mockResolvedValue(serialized);
    module = await import('../src/store/use-family-frequency-store');
    await vi.waitFor(() => expect(module.useFamilyFrequencyStore.getState().hydrated).toBe(true));
    expect(module.useFamilyFrequencyStore.getState().session?.phase).toBe('revealed');
    expect(module.useFamilyFrequencyStore.getState().session?.teamScores).toEqual(expect.arrayContaining([
      expect.objectContaining({ points: 10_000, exactMatches: 1, opportunities: 1 }),
      expect.objectContaining({ points: 0, exactMatches: 0, opportunities: 0 }),
    ]));
    expect(module.useFamilyFrequencyStore.getState().varietyLedger.recentPrompts).toHaveLength(4);
    expect(module.useFamilyFrequencyStore.getState().activeStyle).toBe('playful');
  });
});
