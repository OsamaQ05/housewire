import {
  FAMILY_TRIVIA_ROUND_KINDS,
  type FamilyTriviaAiPackRequest,
  type FamilyTriviaChoiceQuestion,
  type FamilyTriviaOrderingQuestion,
  type FamilyTriviaPackLoadResult,
  type FamilyTriviaQuestion,
  type FamilyTriviaQuestionPack,
  type FamilyTriviaQuestionPackProvider,
  type FamilyTriviaRoundKind,
  type FamilyTriviaSetup,
  type FamilyTriviaSpectrumQuestion,
  type FamilyTriviaTextQuestion,
} from './family-trivia-types';
import {
  parseFamilyTriviaSetup,
  parseSafeFamilyTriviaPack,
  validateFamilyTriviaPackForSetup,
} from './family-trivia-schema';

export interface QuickFamilyTriviaSetupOptions {
  teams?: boolean;
}

export interface OfflineFamilyTriviaPackOptions {
  avoidPromptFingerprints?: readonly string[];
  questionCount?: number;
  seed: number | string;
  setup: FamilyTriviaSetup;
}

export interface FamilyTriviaRespondentPlanOptions {
  authorityPlayerIds: readonly string[];
  kinds: readonly FamilyTriviaRoundKind[];
  seed: number | string;
  setup: FamilyTriviaSetup;
}

interface ChoiceTemplate {
  prompt(targetName: string, setup: FamilyTriviaSetup): string;
  afterRevealPrompt: string;
  options(targetName: string, setup: FamilyTriviaSetup): readonly string[];
}

interface OrderingTemplate {
  prompt: string;
  afterRevealPrompt: string;
  options: readonly string[];
}

interface SpectrumTemplate {
  prompt(targetName: string): string;
  afterRevealPrompt: string;
  minLabel: string;
  maxLabel: string;
}

interface TextTemplate {
  prompt(targetName: string): string;
  afterRevealPrompt: string;
  inputHint: string;
}

const PREFERENCE_TEMPLATES: readonly ChoiceTemplate[] = [
  {
    prompt: (name) => `If ${name} chooses the shared snack tonight, what reaches the table?`,
    afterRevealPrompt: 'The answer owner can give the practical reason, then deal the next card.',
    options: () => ['Something salty', 'Something sweet', 'Fresh fruit', 'No snack'],
  },
  {
    prompt: (name) => `${name} gets an unexpected free hour at home. What do they choose first?`,
    afterRevealPrompt: 'Compare the guesses with the choice, without ranking anybody’s answer.',
    options: () => ['Watch something', 'Go outside', 'Make or fix something', 'Take a quiet break'],
  },
  {
    prompt: (name) => `${name} controls the route for a short family drive. Which route wins?`,
    afterRevealPrompt: 'The answer owner can name one real route that fits the choice.',
    options: () => ['Fastest route', 'Quiet streets', 'Scenic route', 'Stop somewhere useful'],
  },
  {
    prompt: (name) => `${name} picks a low-effort shared breakfast. What is the move?`,
    afterRevealPrompt: 'Reveal the pick and continue; no explanation is required.',
    options: () => ['Toast or pastries', 'Eggs', 'Cereal or oats', 'Order from outside'],
  },
  {
    prompt: (name) => `${name} chooses the background sound while everyone tidies up. What plays?`,
    afterRevealPrompt: 'Try the winning sound next time the room needs a quick reset.',
    options: () => ['A familiar playlist', 'A podcast', 'The television', 'Nothing at all'],
  },
  {
    prompt: (name) => `${name} adds one easy stop to a free afternoon. What sounds best?`,
    afterRevealPrompt: 'The answer can become a real low-effort plan later.',
    options: () => ['A small café', 'A park', 'A bookshop', 'A quick market'],
  },
  {
    prompt: (name) => `${name} chooses a ten-minute kitchen task. Which one feels easiest?`,
    afterRevealPrompt: 'Compare the practical pick and keep the signal moving.',
    options: () => ['Make drinks', 'Cut fruit', 'Clear a surface', 'Pack leftovers'],
  },
  {
    prompt: (name) => `${name} gets first pick of a shared screen. What goes on?`,
    afterRevealPrompt: 'The answer owner can name one example, but does not have to.',
    options: () => ['A comedy', 'A documentary', 'A live event', 'A short video'],
  },
];

const WHO_KNOWS_TEMPLATES: readonly ChoiceTemplate[] = [
  {
    prompt: (name) => `Plans change with twenty minutes’ notice. What does ${name} check first?`,
    afterRevealPrompt: 'Only the assigned guesser scores; the others can compare what they expected.',
    options: () => ['The new time', 'How to get there', 'Who is coming', 'Whether anything is needed'],
  },
  {
    prompt: (name) => `A household device stops working. What is ${name} most likely to try first?`,
    afterRevealPrompt: 'The answer owner can name the first step they would actually take.',
    options: () => ['Restart it', 'Read the error', 'Ask someone nearby', 'Leave it for later'],
  },
  {
    prompt: (name) => `There are ten minutes before everyone leaves. What does ${name} protect time for?`,
    afterRevealPrompt: 'Compare the guess with the real routine and move on.',
    options: () => ['Check essentials', 'Finish food or drink', 'Choose music', 'Wait by the door'],
  },
  {
    prompt: (name) => `The family must choose quickly. How does ${name} usually decide?`,
    afterRevealPrompt: 'The answer owner can point to one recent ordinary example.',
    options: () => ['Pick the simplest', 'Compare two options', 'Ask the group', 'Follow the original plan'],
  },
  {
    prompt: (name) => `Someone arrives early. Where would ${name} most likely wait?`,
    afterRevealPrompt: 'Only the tuned-in guesser scores this practical read.',
    options: () => ['Near the entrance', 'In the car', 'At a nearby shop', 'Where everyone will meet'],
  },
  {
    prompt: (name) => `A group message gives a vague time. What does ${name} confirm first?`,
    afterRevealPrompt: 'Compare the prediction with the real first check.',
    options: () => ['The exact time', 'The meeting point', 'Who is ready', 'What to bring'],
  },
  {
    prompt: (name) => `${name} cannot find an everyday item. Where do they look first?`,
    afterRevealPrompt: 'The answer owner can name the usual hiding place if useful.',
    options: () => ['The last-used room', 'A bag or pocket', 'Its proper place', 'Near the front door'],
  },
  {
    prompt: (name) => `Rain changes the plan. What does ${name} suggest first?`,
    afterRevealPrompt: 'One exact read earns the lock; then move straight on.',
    options: () => ['Stay home', 'Choose an indoor stop', 'Wait for it to pass', 'Go anyway'],
  },
];

const MEMORY_TEMPLATES: readonly ChoiceTemplate[] = [
  {
    prompt: () => 'Think of the last meal the family ate somewhere new. Who suggested the place?',
    afterRevealPrompt: 'Name the place after the answer appears, or skip if the memory does not apply.',
    options: (_name, setup) => [...setup.players.map((player) => player.name), 'It was a group decision'],
  },
  {
    prompt: () => 'Think of the last family trip or long drive. Who handled the route most?',
    afterRevealPrompt: 'The answer owner can identify the trip in one sentence.',
    options: (_name, setup) => [...setup.players.map((player) => player.name), 'The route was automatic'],
  },
  {
    prompt: () => 'Think of the last shared home project. What happened first?',
    afterRevealPrompt: 'Reveal one concrete detail from the project, then continue.',
    options: () => ['Someone measured', 'Someone found tools', 'Someone searched instructions', 'Someone started immediately'],
  },
  {
    prompt: () => 'Think of the last family celebration with food. Which detail was decided first?',
    afterRevealPrompt: 'The answer owner can name the occasion if they want to clarify the answer.',
    options: () => ['The date', 'The place', 'The main food', 'Who would bring something'],
  },
  {
    prompt: () => 'Think of the last useful thing bought for the home. What started the decision?',
    afterRevealPrompt: 'Name the item only if it makes the reveal clearer.',
    options: () => ['Something broke', 'A routine changed', 'Someone recommended it', 'A good offer appeared'],
  },
  {
    prompt: () => 'Think of the last show watched together. How was it chosen?',
    afterRevealPrompt: 'Reveal the title only if everyone wants the extra detail.',
    options: () => ['Someone suggested it', 'It was already playing', 'The trailer won', 'The group voted'],
  },
  {
    prompt: () => 'Think of the last outdoor family stop. Which detail is easiest to remember?',
    afterRevealPrompt: 'A single ordinary detail is enough before the next round.',
    options: () => ['The weather', 'Something eaten', 'The route there', 'A photo taken'],
  },
  {
    prompt: () => 'Think of the last time a room was rearranged. What moved first?',
    afterRevealPrompt: 'Skip if it never happened; otherwise compare the remembered first move.',
    options: () => ['A chair', 'A table', 'Something on a wall', 'A storage item'],
  },
];

const ORDERING_TEMPLATES: readonly OrderingTemplate[] = [
  {
    prompt: 'Put these household milestones in the order your family experienced them.',
    afterRevealPrompt: 'Compare the guessed order with the household timeline. Skip when an item never happened.',
    options: ['First family group chat', 'First shared streaming account', 'First smart TV at home', 'First video call while travelling'],
  },
  {
    prompt: 'Order these parts of a typical family weekend from earliest to latest.',
    afterRevealPrompt: 'The answer owner’s version is the reference for this round, not a universal rule.',
    options: ['First person wakes up', 'First shared food', 'First household errand', 'Last kitchen visit'],
  },
  {
    prompt: 'Put these ordinary family memories from oldest to newest.',
    afterRevealPrompt: 'Use the answer owner’s timeline. Skip if one item does not exist for this family.',
    options: ['A photo still on a phone', 'A shared day trip', 'A meal everyone remembers', 'A home item repaired together'],
  },
  {
    prompt: 'Order these household technologies by when they became normal for your family.',
    afterRevealPrompt: 'Compare timelines; close dates do not need a debate.',
    options: ['Group messaging', 'Video calling', 'Streaming television', 'Contactless payment'],
  },
  {
    prompt: 'Order these parts of a shared evening from earliest to latest.',
    afterRevealPrompt: 'The answer owner’s ordinary evening is the reference, not a rule.',
    options: ['First person gets home', 'Food is decided', 'A screen turns on', 'The last light goes off'],
  },
  {
    prompt: 'Arrange these leaving-home steps from first to last for your family.',
    afterRevealPrompt: 'Compare the real routine and move on without debating the perfect order.',
    options: ['Choose what to wear', 'Collect essentials', 'Check the route', 'Lock the door'],
  },
  {
    prompt: 'Put these steps of trying a new recipe in order from first to last.',
    afterRevealPrompt: 'Use the answer owner’s likely process as tonight’s reference.',
    options: ['Read the recipe', 'Check ingredients', 'Prepare the workspace', 'Start cooking'],
  },
  {
    prompt: 'Rank these weekend decisions from most likely to happen first to least likely.',
    afterRevealPrompt: 'The ranking only describes this household’s usual rhythm.',
    options: ['Pick a meal', 'Choose an outing', 'Handle an errand', 'Choose what to watch'],
  },
];

const SPECTRUM_TEMPLATES: readonly SpectrumTemplate[] = [
  {
    prompt: (name) => `On a free evening, how ready is ${name} to leave the house for an unplanned stop?`,
    afterRevealPrompt: 'See how close the dials landed; the number is a snapshot, not a permanent label.',
    minLabel: 'Staying in',
    maxLabel: 'Shoes already on',
  },
  {
    prompt: (name) => `How far ahead does ${name} prefer a family plan to be settled?`,
    afterRevealPrompt: 'The dial shows how much notice makes a shared plan easier.',
    minLabel: 'Same-day is fine',
    maxLabel: 'Plan it early',
  },
  {
    prompt: (name) => `How adventurous is ${name} when the family orders from somewhere new?`,
    afterRevealPrompt: 'A close read may make the next shared order much easier.',
    minLabel: 'Known favorite',
    maxLabel: 'Surprise me',
  },
  {
    prompt: (name) => `How much background noise does ${name} enjoy during a shared meal?`,
    afterRevealPrompt: 'Compare the dials and keep the setting in mind for another meal.',
    minLabel: 'Quiet table',
    maxLabel: 'Full soundtrack',
  },
  {
    prompt: (name) => `How early would ${name} rather arrive for a family booking?`,
    afterRevealPrompt: 'This signal can remove one small source of rushing next time.',
    minLabel: 'Right on time',
    maxLabel: 'Very early',
  },
  {
    prompt: (name) => `How willing is ${name} to take the scenic route on a family drive?`,
    afterRevealPrompt: 'The spread reveals whether the journey itself feels like part of the plan.',
    minLabel: 'Direct route',
    maxLabel: 'Take the detour',
  },
];

const TEXT_TEMPLATES: readonly TextTemplate[] = [
  {
    prompt: (name) => `No options: what drink would ${name} most likely make during a quiet evening at home?`,
    afterRevealPrompt: 'Close wording counts automatically; compare the signal without debating spelling.',
    inputHint: 'One short drink name',
  },
  {
    prompt: (name) => `No options: name the snack ${name} is most likely to reach for during a family film.`,
    afterRevealPrompt: 'The local matcher accepts close wording, then keeps every answer on this phone.',
    inputHint: 'One snack or food',
  },
  {
    prompt: (name) => `No options: what takeaway dish would ${name} suggest when nobody wants to cook?`,
    afterRevealPrompt: 'A near match still scores; this could settle the next low-effort dinner faster.',
    inputHint: 'A dish or cuisine',
  },
  {
    prompt: (name) => `No options: what household item would ${name} grab first before a short family drive?`,
    afterRevealPrompt: 'Compare the practical first thought and pass the signal onward.',
    inputHint: 'One everyday item',
  },
  {
    prompt: (name) => `No options: name a place ${name} would happily revisit with the family.`,
    afterRevealPrompt: 'A shared answer can become a real plan; no explanation is required.',
    inputHint: 'A place or type of place',
  },
  {
    prompt: (name) => `No options: what simple breakfast would ${name} choose on a slow family morning?`,
    afterRevealPrompt: 'Similar words count, and the answer stays sealed until everyone has guessed.',
    inputHint: 'One breakfast food',
  },
];

export function createQuickFamilyTriviaSetup(
  names: readonly string[],
  options: QuickFamilyTriviaSetupOptions = {},
): FamilyTriviaSetup {
  const cleanNames = names.map((name) => name.trim());
  const players = cleanNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    teamId: options.teams ? (index % 2 === 0 ? 'team-a' : 'team-b') : undefined,
  }));
  const teams = options.teams
    ? [
        { id: 'team-a', name: 'Side A', memberPlayerIds: players.filter((player) => player.teamId === 'team-a').map((player) => player.id) },
        { id: 'team-b', name: 'Side B', memberPlayerIds: players.filter((player) => player.teamId === 'team-b').map((player) => player.id) },
      ]
    : [];
  return parseFamilyTriviaSetup({ hostPlayerId: players[0]?.id, players, teams });
}

export function familyTriviaSeed(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Trivia seed must be finite.');
    return Math.max(0, Math.min(0xffff_ffff, Math.floor(value))) >>> 0;
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A compact, local-only identity for repeat detection. It is never sent to a provider. */
export function familyTriviaQuestionFingerprint(
  kind: FamilyTriviaRoundKind,
  prompt: string,
  optionLabels: readonly string[],
  playerNames: readonly string[] = [],
): string {
  const normalizedPrompt = normalizeFingerprintCopy(prompt, playerNames);
  const normalizedOptions = optionLabels.map((option) => normalizeFingerprintCopy(option, playerNames)).sort();
  return `p${familyTriviaSeed(`${kind}|${normalizedPrompt}|${normalizedOptions.join('|')}`).toString(36)}`;
}

/**
 * Builds the complete respondent schedule before a pack is rendered.
 * Team play is intentionally partner-only: the answer owner's teammate is the
 * sole reader. An opponent can therefore never gain by predicting somebody
 * who has an incentive to bluff. Four/eight/twelve-card packs rotate ownership
 * evenly, so both teams receive the same number of reads.
 */
export function planFamilyTriviaRespondents({
  authorityPlayerIds,
  kinds,
  seed,
  setup: setupInput,
}: FamilyTriviaRespondentPlanOptions): readonly (readonly string[])[] {
  const setup = parseFamilyTriviaSetup(setupInput);
  if (authorityPlayerIds.length !== kinds.length) throw new Error('Trivia role plan lengths must match.');
  const playerIds = new Set(setup.players.map((player) => player.id));
  const useCounts = new Map(setup.players.map((player) => [player.id, 0]));
  const teamUseCounts = new Map(setup.teams.map((team) => [team.id, 0]));
  const planSeed = familyTriviaSeed(seed);

  return authorityPlayerIds.map((authorityPlayerId, roundIndex) => {
    if (!playerIds.has(authorityPlayerId)) throw new Error('Trivia role plan contains an unknown answer owner.');
    const eligible = setup.players.filter((player) => player.id !== authorityPlayerId);
    if (!setup.teams.length) {
      if (kinds[roundIndex] !== 'who-knows-who') return eligible.map((player) => player.id);
      const selected = leastUsedPlayer(eligible.map((player) => player.id), useCounts, planSeed, roundIndex, 0);
      useCounts.set(selected, (useCounts.get(selected) ?? 0) + 1);
      return [selected];
    }

    const authorityTeam = setup.teams.find((team) => team.memberPlayerIds.includes(authorityPlayerId));
    if (!authorityTeam) throw new Error('Trivia answer owner is not assigned to a team.');
    const candidates = authorityTeam.memberPlayerIds.filter((playerId) => playerId !== authorityPlayerId);
    if (candidates.length !== 1) throw new Error('Team Frequency requires one answer owner and one reading partner.');
    const selected = candidates[0];
    useCounts.set(selected, (useCounts.get(selected) ?? 0) + 1);
    teamUseCounts.set(authorityTeam.id, (teamUseCounts.get(authorityTeam.id) ?? 0) + 1);
    return [selected];
  });
}

export function generateOfflineFamilyTriviaPack(
  options: OfflineFamilyTriviaPackOptions,
): FamilyTriviaQuestionPack {
  const setup = parseFamilyTriviaSetup(options.setup);
  const seed = familyTriviaSeed(options.seed);
  const questionCount = Math.max(4, Math.min(12, Math.floor(options.questionCount ?? 8)));
  const random = mulberry32(seed || 1);
  const authorityOffset = integer(random, setup.players.length);
  const kinds = createFamilyTriviaKindPlan(questionCount, random);
  const authorities = Array.from({ length: questionCount }, (_, index) =>
    setup.players[(authorityOffset + index) % setup.players.length]);
  const respondentPlan = planFamilyTriviaRespondents({
    authorityPlayerIds: authorities.map((authority) => authority.id),
    kinds,
    seed,
    setup,
  });
  const avoidedFingerprints = new Set(options.avoidPromptFingerprints ?? []);
  const usedFingerprints = new Set<string>();
  const questions: FamilyTriviaQuestion[] = [];

  for (let index = 0; index < questionCount; index += 1) {
    const kind = kinds[index];
    const authority = authorities[index];
    const respondentPlayerIds = respondentPlan[index];
    const id = `round-${index + 1}-${kind.replaceAll('-', '_')}`;

    if (kind === 'spectrum-read') {
      const template = chooseFreshTemplate(
        SPECTRUM_TEMPLATES,
        kind,
        (candidate) => candidate.prompt(authority.name),
        (candidate) => [candidate.minLabel, candidate.maxLabel],
        avoidedFingerprints,
        usedFingerprints,
        random,
        setup.players.map((player) => player.name),
      );
      usedFingerprints.add(familyTriviaQuestionFingerprint(
        kind,
        template.prompt(authority.name),
        [template.minLabel, template.maxLabel],
        setup.players.map((player) => player.name),
      ));
      questions.push({
        id,
        kind,
        answerKind: 'spectrum',
        authorityPlayerId: authority.id,
        respondentPlayerIds,
        prompt: template.prompt(authority.name),
        afterRevealPrompt: template.afterRevealPrompt,
        canSkip: true,
        options: [],
        scale: { min: 0, max: 100, step: 5, minLabel: template.minLabel, maxLabel: template.maxLabel },
      } satisfies FamilyTriviaSpectrumQuestion);
      continue;
    }

    if (kind === 'same-wavelength') {
      const template = chooseFreshTemplate(
        TEXT_TEMPLATES,
        kind,
        (candidate) => candidate.prompt(authority.name),
        (candidate) => [candidate.inputHint],
        avoidedFingerprints,
        usedFingerprints,
        random,
        setup.players.map((player) => player.name),
      );
      usedFingerprints.add(familyTriviaQuestionFingerprint(
        kind,
        template.prompt(authority.name),
        [template.inputHint],
        setup.players.map((player) => player.name),
      ));
      questions.push({
        id,
        kind,
        answerKind: 'text',
        authorityPlayerId: authority.id,
        respondentPlayerIds,
        prompt: template.prompt(authority.name),
        afterRevealPrompt: template.afterRevealPrompt,
        canSkip: true,
        options: [],
        inputHint: template.inputHint,
        maxLength: 40,
      } satisfies FamilyTriviaTextQuestion);
      continue;
    }

    if (kind === 'family-lore-ordering') {
      const template = chooseFreshTemplate(
        ORDERING_TEMPLATES,
        kind,
        (candidate) => candidate.prompt,
        (candidate) => candidate.options,
        avoidedFingerprints,
        usedFingerprints,
        random,
        setup.players.map((player) => player.name),
      );
      usedFingerprints.add(familyTriviaQuestionFingerprint(
        kind,
        template.prompt,
        template.options,
        setup.players.map((player) => player.name),
      ));
      const optionLabels = shuffle([...template.options], random);
      questions.push({
        id,
        kind,
        answerKind: 'ordering',
        authorityPlayerId: authority.id,
        respondentPlayerIds,
        prompt: template.prompt,
        afterRevealPrompt: template.afterRevealPrompt,
        canSkip: true,
        options: optionLabels.map((label, optionIndex) => ({ id: `${id}-item-${optionIndex + 1}`, label })),
      } satisfies FamilyTriviaOrderingQuestion);
      continue;
    }

    const pool = kind === 'preference-match' ? PREFERENCE_TEMPLATES : kind === 'who-knows-who' ? WHO_KNOWS_TEMPLATES : MEMORY_TEMPLATES;
    const template = chooseFreshTemplate(
      pool,
      kind,
      (candidate) => candidate.prompt(authority.name, setup),
      (candidate) => candidate.options(authority.name, setup),
      avoidedFingerprints,
      usedFingerprints,
      random,
      setup.players.map((player) => player.name),
    );
    usedFingerprints.add(familyTriviaQuestionFingerprint(
      kind,
      template.prompt(authority.name, setup),
      template.options(authority.name, setup),
      setup.players.map((player) => player.name),
    ));
    const optionLabels = shuffle([...template.options(authority.name, setup)], random);
    questions.push({
      id,
      kind,
      answerKind: 'choice',
      authorityPlayerId: authority.id,
      respondentPlayerIds,
      prompt: template.prompt(authority.name, setup),
      afterRevealPrompt: template.afterRevealPrompt,
      canSkip: true,
      options: optionLabels.map((label, optionIndex) => ({ id: `${id}-option-${optionIndex + 1}`, label })),
    } satisfies FamilyTriviaChoiceQuestion);
  }

  const pack = parseSafeFamilyTriviaPack({
    protocolVersion: 1,
    id: `family-${seed.toString(36)}-${questionCount}`,
    title: 'How This House Works',
    seed,
    source: { kind: 'offline', generatorVersion: 1 },
    questions,
  });
  validateFamilyTriviaPackForSetup(pack, setup);
  return pack;
}

export function createFamilyTriviaAiPackRequest(
  setup: FamilyTriviaSetup,
  seed: number | string,
  questionCount = 8,
): FamilyTriviaAiPackRequest {
  const validated = parseFamilyTriviaSetup(setup);
  return {
    protocolVersion: 1,
    seed: familyTriviaSeed(seed),
    questionCount: Math.max(4, Math.min(12, Math.floor(questionCount))),
    playerIds: validated.players.map((player) => player.id),
    allowedKinds: FAMILY_TRIVIA_ROUND_KINDS,
    constraints: {
      answersMustBePrivate: true,
      answersStayOnDevice: true,
      supportedAnswerKinds: ['choice', 'ordering', 'spectrum', 'text'],
      noTherapyOrConflictPrompts: true,
      noSensitiveAttributes: true,
    },
  };
}

function createFamilyTriviaKindPlan(
  questionCount: number,
  random: () => number,
): readonly FamilyTriviaRoundKind[] {
  if (questionCount === 4) {
    const choiceKinds = shuffle<FamilyTriviaRoundKind>([
      'preference-match',
      'who-knows-who',
      'shared-memory-detail',
    ], random);
    return shuffle<FamilyTriviaRoundKind>([
      choiceKinds[0],
      'family-lore-ordering',
      'spectrum-read',
      'same-wavelength',
    ], random);
  }
  const cycle = shuffle([...FAMILY_TRIVIA_ROUND_KINDS], random);
  return Array.from({ length: questionCount }, (_, index) => cycle[index % cycle.length]);
}

export async function loadFamilyTriviaQuestionPack({
  provider,
  questionCount = 8,
  seed,
  setup,
}: OfflineFamilyTriviaPackOptions & { provider?: FamilyTriviaQuestionPackProvider }): Promise<FamilyTriviaPackLoadResult> {
  const fallback = () => generateOfflineFamilyTriviaPack({ questionCount, seed, setup });
  if (!provider) return { pack: fallback(), usedFallback: false };
  const request = createFamilyTriviaAiPackRequest(setup, seed, questionCount);
  try {
    const candidate = parseSafeFamilyTriviaPack(await provider.generateQuestionPack(request));
    if (candidate.source.kind !== 'ai' || candidate.source.providerId !== provider.id) {
      throw new Error('AI pack source does not match the selected provider.');
    }
    if (candidate.seed !== request.seed || candidate.questions.length !== request.questionCount) {
      throw new Error('AI pack does not match the requested seed or question count.');
    }
    validateFamilyTriviaPackForSetup(candidate, setup);
    return { pack: candidate, usedFallback: false };
  } catch (cause: unknown) {
    return {
      pack: fallback(),
      usedFallback: true,
      rejectionReason: cause instanceof Error ? cause.message : 'The AI pack was invalid.',
    };
  }
}

function integer(random: () => number, length: number): number {
  if (length <= 0) throw new Error('Cannot choose from an empty trivia pool.');
  return Math.min(length - 1, Math.floor(random() * length));
}

function leastUsedPlayer(
  candidates: readonly string[],
  useCounts: ReadonlyMap<string, number>,
  seed: number,
  roundIndex: number,
  groupIndex: number,
): string {
  if (!candidates.length) throw new Error('Cannot assign a trivia receiver from an empty group.');
  const lowest = Math.min(...candidates.map((playerId) => useCounts.get(playerId) ?? 0));
  const tied = candidates.filter((playerId) => (useCounts.get(playerId) ?? 0) === lowest);
  return tied[(seed + roundIndex * 17 + groupIndex * 31) % tied.length];
}

function chooseFreshTemplate<T>(
  templates: readonly T[],
  kind: FamilyTriviaRoundKind,
  prompt: (template: T) => string,
  options: (template: T) => readonly string[],
  avoidedFingerprints: ReadonlySet<string>,
  usedFingerprints: ReadonlySet<string>,
  random: () => number,
  playerNames: readonly string[],
): T {
  const unused = templates.filter((template) =>
    !usedFingerprints.has(familyTriviaQuestionFingerprint(kind, prompt(template), options(template), playerNames)));
  const fresh = unused.filter((template) =>
    !avoidedFingerprints.has(familyTriviaQuestionFingerprint(kind, prompt(template), options(template), playerNames)));
  const pool = fresh.length ? fresh : unused.length ? unused : templates;
  return pool[integer(random, pool.length)];
}

function normalizeFingerprintCopy(value: string, playerNames: readonly string[]): string {
  const anonymized = [...playerNames]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((copy, name) => copy.replace(new RegExp(escapeRegExp(name), 'gi'), '{player}'), value);
  return anonymized
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = integer(random, index + 1);
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}
