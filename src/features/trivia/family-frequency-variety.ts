import {
  FAMILY_TRIVIA_ROUND_KINDS,
  familyTriviaQuestionFingerprint,
  familyTriviaSeed,
  type FamilyTriviaQuestionPack,
  type FamilyTriviaRoundKind,
} from '../../domain/family-trivia';

import {
  FAMILY_FREQUENCY_STYLES,
  type FamilyFrequencyPack,
  type FamilyFrequencyStyle,
} from './family-frequency-ai-client';

const MAXIMUM_RECENT_PROMPTS = 48;
const MAXIMUM_STYLE_HISTORY = 8;
const ACTIVE_REPEAT_WINDOW = 12;
const SAFE_FINGERPRINT = /^p[a-z0-9]{1,16}$/;

export interface FamilyFrequencyPromptLedgerEntry {
  fingerprint: string;
  kind: FamilyTriviaRoundKind;
}

/** Contains question metadata only: never answers, guesses, names, or scores. */
export interface FamilyFrequencyVarietyLedger {
  version: 1;
  recentPrompts: FamilyFrequencyPromptLedgerEntry[];
  recentStyles: FamilyFrequencyStyle[];
}

export function emptyFamilyFrequencyVarietyLedger(): FamilyFrequencyVarietyLedger {
  return { version: 1, recentPrompts: [], recentStyles: [] };
}

export function parseFamilyFrequencyVarietyLedger(value: unknown): FamilyFrequencyVarietyLedger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyFamilyFrequencyVarietyLedger();
  const record = value as Record<string, unknown>;
  const recentPrompts = Array.isArray(record.recentPrompts)
    ? record.recentPrompts.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const candidate = entry as Record<string, unknown>;
        return typeof candidate.fingerprint === 'string' && SAFE_FINGERPRINT.test(candidate.fingerprint) &&
          typeof candidate.kind === 'string' && FAMILY_TRIVIA_ROUND_KINDS.includes(candidate.kind as FamilyTriviaRoundKind)
          ? [{ fingerprint: candidate.fingerprint, kind: candidate.kind as FamilyTriviaRoundKind }]
          : [];
      }).slice(0, MAXIMUM_RECENT_PROMPTS)
    : [];
  const recentStyles = Array.isArray(record.recentStyles)
    ? record.recentStyles.filter((style): style is FamilyFrequencyStyle =>
        typeof style === 'string' && FAMILY_FREQUENCY_STYLES.includes(style as FamilyFrequencyStyle),
      ).slice(0, MAXIMUM_STYLE_HISTORY)
    : [];
  return { version: 1, recentPrompts, recentStyles };
}

export function recordFamilyFrequencyPack(
  current: FamilyFrequencyVarietyLedger,
  pack: FamilyTriviaQuestionPack,
  style: FamilyFrequencyStyle,
  playerNames: readonly string[] = [],
): FamilyFrequencyVarietyLedger {
  const safeCurrent = parseFamilyFrequencyVarietyLedger(current);
  const newest = pack.questions.map((question) => ({
    fingerprint: familyTriviaQuestionFingerprint(
      question.kind,
      question.prompt,
      question.answerKind === 'spectrum'
        ? [question.scale.minLabel, question.scale.maxLabel]
        : question.answerKind === 'text'
          ? [question.inputHint]
          : question.options.map((option) => option.label),
      playerNames,
    ),
    kind: question.kind,
  }));
  const seen = new Set<string>();
  const recentPrompts = [...newest, ...safeCurrent.recentPrompts]
    .filter((entry) => {
      if (seen.has(entry.fingerprint)) return false;
      seen.add(entry.fingerprint);
      return true;
    })
    .slice(0, MAXIMUM_RECENT_PROMPTS);
  return {
    version: 1,
    recentPrompts,
    recentStyles: [style, ...safeCurrent.recentStyles].slice(0, MAXIMUM_STYLE_HISTORY),
  };
}

/** Selects the least-used presentation style without exposing the ledger. */
export function chooseFamilyFrequencyStyle(
  ledger: FamilyFrequencyVarietyLedger,
  seed: number,
): FamilyFrequencyStyle {
  const safe = parseFamilyFrequencyVarietyLedger(ledger);
  if (!safe.recentStyles.length) return 'mixed';
  const counts = new Map(FAMILY_FREQUENCY_STYLES.map((style) => [style, 0]));
  safe.recentStyles.forEach((style) => counts.set(style, (counts.get(style) ?? 0) + 1));
  const lowest = Math.min(...FAMILY_FREQUENCY_STYLES.map((style) => counts.get(style) ?? 0));
  const candidates = FAMILY_FREQUENCY_STYLES.filter((style) => (counts.get(style) ?? 0) === lowest);
  return candidates[familyTriviaSeed(seed) % candidates.length];
}

export function recentFamilyFrequencyPromptFingerprints(
  ledger: FamilyFrequencyVarietyLedger,
): readonly string[] {
  return parseFamilyFrequencyVarietyLedger(ledger).recentPrompts
    .slice(0, ACTIVE_REPEAT_WINDOW)
    .map((entry) => entry.fingerprint);
}

/**
 * Keeps every mechanic, then fills the requested pack by preferring unseen
 * prompts and historically under-used categories. The ledger remains local.
 */
export function selectFreshFamilyFrequencyItems(
  pack: FamilyFrequencyPack,
  count: 4 | 8 | 12,
  ledger: FamilyFrequencyVarietyLedger,
): FamilyFrequencyPack['items'] {
  if (count > pack.items.length) throw new Error('The AI pack did not provide enough candidate cards.');
  const safeLedger = parseFamilyFrequencyVarietyLedger(ledger);
  const recent = new Set(recentFamilyFrequencyPromptFingerprints(safeLedger));
  const historicCounts = new Map(FAMILY_TRIVIA_ROUND_KINDS.map((kind) => [kind, 0]));
  safeLedger.recentPrompts.forEach((entry) =>
    historicCounts.set(entry.kind, (historicCounts.get(entry.kind) ?? 0) + 1));
  const selected: number[] = [];
  const selectedKinds = new Map(FAMILY_TRIVIA_ROUND_KINDS.map((kind) => [kind, 0]));

  const choose = (indexes: readonly number[]): number => {
    const candidates = indexes.filter((index) => !selected.includes(index));
    if (!candidates.length) throw new Error('The AI pack cannot cover every Family Frequency category.');
    return [...candidates].sort((left, right) => {
      const leftItem = pack.items[left];
      const rightItem = pack.items[right];
      const leftRepeat = recent.has(familyTriviaQuestionFingerprint(leftItem.kind, leftItem.prompt, itemFingerprintCopy(leftItem))) ? 1 : 0;
      const rightRepeat = recent.has(familyTriviaQuestionFingerprint(rightItem.kind, rightItem.prompt, itemFingerprintCopy(rightItem))) ? 1 : 0;
      if (leftRepeat !== rightRepeat) return leftRepeat - rightRepeat;
      const leftExposure = (historicCounts.get(leftItem.kind) ?? 0) + (selectedKinds.get(leftItem.kind) ?? 0);
      const rightExposure = (historicCounts.get(rightItem.kind) ?? 0) + (selectedKinds.get(rightItem.kind) ?? 0);
      if (leftExposure !== rightExposure) return leftExposure - rightExposure;
      return familyTriviaSeed(`${pack.seed}:${leftItem.id}`) - familyTriviaSeed(`${pack.seed}:${rightItem.id}`);
    })[0];
  };

  const requiredKindGroups: readonly (readonly FamilyTriviaRoundKind[])[] = count >= FAMILY_TRIVIA_ROUND_KINDS.length
    ? FAMILY_TRIVIA_ROUND_KINDS.map((kind) => [kind])
    : [
        ['spectrum-read'],
        ['same-wavelength'],
        ['family-lore-ordering'],
        ['preference-match', 'who-knows-who', 'shared-memory-detail'],
      ];
  for (const group of requiredKindGroups) {
    const selectedIndex = choose(pack.items.flatMap((item, index) => group.includes(item.kind) ? [index] : []));
    selected.push(selectedIndex);
    const kind = pack.items[selectedIndex].kind;
    selectedKinds.set(kind, (selectedKinds.get(kind) ?? 0) + 1);
  }
  while (selected.length < count) {
    const selectedIndex = choose(pack.items.map((_, index) => index));
    selected.push(selectedIndex);
    const kind = pack.items[selectedIndex].kind;
    selectedKinds.set(kind, (selectedKinds.get(kind) ?? 0) + 1);
  }
  return selected.sort((left, right) => left - right).map((index) => pack.items[index]);
}

function itemFingerprintCopy(item: FamilyFrequencyPack['items'][number]): readonly string[] {
  if (item.kind === 'spectrum-read') return [item.minLabel, item.maxLabel];
  if (item.kind === 'same-wavelength') return [item.inputHint];
  return item.options;
}
