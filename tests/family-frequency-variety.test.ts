import { describe, expect, it } from 'vitest';

import {
  createQuickFamilyTriviaSetup,
  familyTriviaQuestionFingerprint,
  generateOfflineFamilyTriviaPack,
  type FamilyTriviaRoundKind,
} from '../src/domain/family-trivia';
import {
  FAMILY_FREQUENCY_PROVIDER_ID,
  parseFamilyFrequencyPack,
} from '../src/features/trivia/family-frequency-ai-client';
import {
  chooseFamilyFrequencyStyle,
  emptyFamilyFrequencyVarietyLedger,
  parseFamilyFrequencyVarietyLedger,
  recordFamilyFrequencyPack,
  selectFreshFamilyFrequencyItems,
} from '../src/features/trivia/family-frequency-variety';

const kinds: readonly FamilyTriviaRoundKind[] = [
  'preference-match',
  'family-lore-ordering',
  'who-knows-who',
  'shared-memory-detail',
  'spectrum-read',
  'same-wavelength',
];

function aiCandidates() {
  return parseFamilyFrequencyPack({
    id: 'frequency-variety-candidates',
    providerId: FAMILY_FREQUENCY_PROVIDER_ID,
    style: 'mixed',
    count: 12,
    seed: 9191,
    items: Array.from({ length: 12 }, (_, index) => {
      const kind = kinds[index % kinds.length];
      const common = {
        id: `candidate-${index + 1}`,
        kind,
        prompt: kind === 'family-lore-ordering'
          ? `Order these four weekend stops from first to last for route ${index + 1}.`
          : kind === 'spectrum-read'
            ? `How ready are you for an unplanned family stop in scenario ${index + 1}?`
            : kind === 'same-wavelength'
              ? `No options: name one family-film snack for scenario ${index + 1}.`
              : `For everyday scenario ${index + 1}, which practical option gets picked first?`,
      };
      if (kind === 'spectrum-read') return { ...common, kind, minLabel: 'Stay on route', maxLabel: 'Take a detour' };
      if (kind === 'same-wavelength') return { ...common, kind, inputHint: 'One short snack name' };
      return { ...common, kind, options: [`Option A${index}`, `Option B${index}`, `Option C${index}`, `Option D${index}`] };
    }),
  });
}

describe('Family Frequency local variety ledger', () => {
  it('normalizes player names while keeping only compact metadata', () => {
    const normalized = familyTriviaQuestionFingerprint('preference-match', 'What would Noor choose first?', ['Tea', 'Walk'], ['Noor']);
    expect(normalized)
      .toBe(familyTriviaQuestionFingerprint('preference-match', 'What would Mara choose first?', ['Walk', 'Tea'], ['Mara']));
    expect(normalized).not.toBe(familyTriviaQuestionFingerprint('who-knows-who', 'What would Noor choose first?', ['Tea', 'Walk'], ['Noor']));
    expect(normalized).not.toBe(familyTriviaQuestionFingerprint('preference-match', 'What would Noor choose first?', ['Tea', 'Drive'], ['Noor']));

    const setup = createQuickFamilyTriviaSetup(['Noor', 'Mara']);
    const pack = generateOfflineFamilyTriviaPack({ setup, seed: 4, questionCount: 4 });
    const ledger = recordFamilyFrequencyPack(emptyFamilyFrequencyVarietyLedger(), pack, 'mixed', ['Noor', 'Mara']);
    expect(ledger.recentPrompts).toHaveLength(4);
    expect(JSON.stringify(ledger)).not.toMatch(/Noor|Mara|option|score|answer|guess/i);
  });

  it('rotates away from recently used styles without any setup choice', () => {
    const empty = emptyFamilyFrequencyVarietyLedger();
    expect(chooseFamilyFrequencyStyle(empty, 1)).toBe('mixed');
    const ledger = parseFamilyFrequencyVarietyLedger({
      version: 1,
      recentPrompts: [],
      recentStyles: ['mixed', 'everyday', 'mixed'],
    });
    expect(chooseFamilyFrequencyStyle(ledger, 1)).toBe('playful');
  });

  it('selects every input format while filtering recently seen AI prompts', () => {
    const pack = aiCandidates();
    const recentPrompts = kinds.map((kind) => {
      const item = pack.items.find((candidate) => candidate.kind === kind)!;
      return { fingerprint: familyTriviaQuestionFingerprint(item.kind, item.prompt, itemParts(item)), kind };
    });
    const ledger = parseFamilyFrequencyVarietyLedger({ version: 1, recentPrompts, recentStyles: ['mixed'] });
    const selected = selectFreshFamilyFrequencyItems(pack, 4, ledger);
    const selectedFingerprints = new Set(selected.map((item) =>
      familyTriviaQuestionFingerprint(item.kind, item.prompt, itemParts(item))));
    expect(selected.some((item) => item.kind === 'spectrum-read')).toBe(true);
    expect(selected.some((item) => item.kind === 'same-wavelength')).toBe(true);
    expect(selected.some((item) => item.kind === 'family-lore-ordering')).toBe(true);
    expect(selected.some((item) => ['preference-match', 'who-knows-who', 'shared-memory-detail'].includes(item.kind))).toBe(true);
    expect(recentPrompts.every((entry) => !selectedFingerprints.has(entry.fingerprint))).toBe(true);
  });

  it('rotates the offline pack away from the most recent local prompts', () => {
    const setup = createQuickFamilyTriviaSetup(['Noor', 'Mara', 'Samir', 'Leen']);
    const first = generateOfflineFamilyTriviaPack({ setup, seed: 31, questionCount: 4 });
    const ledger = recordFamilyFrequencyPack(emptyFamilyFrequencyVarietyLedger(), first, 'mixed',
      setup.players.map((player) => player.name));
    const second = generateOfflineFamilyTriviaPack({
      avoidPromptFingerprints: ledger.recentPrompts.map((entry) => entry.fingerprint),
      setup,
      seed: 32,
      questionCount: 4,
    });
    const firstFingerprints = new Set(ledger.recentPrompts.map((entry) => entry.fingerprint));
    expect(second.questions.every((question) =>
      !firstFingerprints.has(familyTriviaQuestionFingerprint(
        question.kind,
        question.prompt,
        question.options.map((option) => option.label),
        setup.players.map((player) => player.name),
      )))).toBe(true);
  });

  it('bounds and salvages malformed persisted entries', () => {
    const valid = { fingerprint: 'pabc123', kind: 'preference-match' };
    const parsed = parseFamilyFrequencyVarietyLedger({
      version: 99,
      recentPrompts: [...Array.from({ length: 60 }, () => valid), { fingerprint: 'raw prompt', kind: 'nope' }],
      recentStyles: ['mixed', 'bad-style', ...Array.from({ length: 12 }, () => 'playful')],
      answers: ['must not survive'],
    });
    expect(parsed.recentPrompts).toHaveLength(48);
    expect(parsed.recentStyles).toHaveLength(8);
    expect(parsed.recentStyles).not.toContain('bad-style');
    expect(parsed).not.toHaveProperty('answers');
  });
});

function itemParts(item: ReturnType<typeof aiCandidates>['items'][number]): readonly string[] {
  if (item.kind === 'spectrum-read') return [item.minLabel, item.maxLabel];
  if (item.kind === 'same-wavelength') return [item.inputHint];
  return item.options;
}
