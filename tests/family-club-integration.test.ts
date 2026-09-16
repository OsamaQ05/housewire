import { describe, expect, it, vi } from 'vitest';
import { createQuickFamilyTriviaSetup, generateOfflineFamilyTriviaPack, type FamilyTriviaAnswer } from '../src/domain/family-trivia';
import { leaderboard } from '../src/features/family-club/model';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return { getItem: vi.fn(async (key: string) => values.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }) };
});
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

describe('game completion to Family Club', () => {
  it('records a full real Frequency session and restores the same individual and team stats', async () => {
    const { useFamilyFrequencyStore: frequency } = await import('../src/store/use-family-frequency-store');
    const { useFamilyClubStore: club, createFamilyClubStore } = await import('../src/store/use-family-club-store');
    await vi.waitFor(() => expect(frequency.getState().hydrated && club.getState().hydrated).toBe(true));
    const setup = createQuickFamilyTriviaSetup(['Noor', 'Mara', 'Samir', 'Leen'], { teams: true });
    const pack = generateOfflineFamilyTriviaPack({ questionCount: 4, seed: 717, setup });
    frequency.getState().startGame(setup, pack);
    for (const question of pack.questions) {
      const answer: FamilyTriviaAnswer = question.answerKind === 'choice' ? { kind: 'choice', optionId: question.options[0].id }
        : question.answerKind === 'ordering' ? { kind: 'ordering', optionIds: question.options.map((o) => o.id) }
        : question.answerKind === 'text' ? { kind: 'text', value: 'Pizza' }
        : { kind: 'spectrum', value: 50 };
      expect(frequency.getState().submitReference(question.authorityPlayerId, answer)).toBe(true);
      question.respondentPlayerIds.forEach((id) => expect(frequency.getState().submitGuess(id, answer)).toBe(true));
      expect(frequency.getState().reveal()).toBe(true);
      expect(frequency.getState().advance()).toBe(true);
    }
    expect(club.getState().games).toHaveLength(1);
    expect(club.getState().games[0].durationSeconds).toBeTypeOf('number');
    expect(club.getState().games[0].standings).toHaveLength(2);
    const stats = leaderboard(club.getState());
    expect(stats).toHaveLength(4);
    expect(stats.every((p) => p.games === 1 && p.wins === 1)).toBe(true);
    expect(stats.reduce((n, p) => n + p.exact, 0)).toBe(4);
    expect(frequency.getState().advance()).toBe(false);
    expect(club.getState().games).toHaveLength(1);
    await vi.waitFor(() => expect(storage.setItem.mock.calls.some(([key]) => key === 'housewire-family-club-v1')).toBe(true));
    const restored = createFamilyClubStore(storage);
    await vi.waitFor(() => expect(restored.getState().hydrated).toBe(true));
    expect(leaderboard(restored.getState())).toEqual(stats);
  });
});
