import { z } from 'zod';

import {
  FAMILY_TRIVIA_ROUND_KINDS,
  type FamilyTriviaAnswer,
  type FamilyTriviaQuestionPack,
  type FamilyTriviaSetup,
} from './family-trivia-types';

const safeId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const conciseText = z.string().trim().min(1).max(180);
const promptText = z.string().trim().min(8).max(240);

const optionSchema = z.object({ id: safeId, label: conciseText }).strict();
const optionsSchema = z
  .array(optionSchema)
  .min(3)
  .max(5)
  .refine((options) => new Set(options.map((option) => option.id)).size === options.length, 'Option ids must be unique.')
  .refine((options) => new Set(options.map((option) => option.label.toLowerCase())).size === options.length, 'Option labels must be unique.');
const respondentsSchema = z
  .array(safeId)
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, 'Respondents must be unique.');

const commonQuestionShape = {
  id: safeId,
  authorityPlayerId: safeId,
  respondentPlayerIds: respondentsSchema,
  prompt: promptText,
  afterRevealPrompt: promptText,
  canSkip: z.boolean(),
};

const questionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...commonQuestionShape,
    kind: z.literal('preference-match'),
    answerKind: z.literal('choice'),
    options: optionsSchema,
  }).strict(),
  z.object({
    ...commonQuestionShape,
    kind: z.literal('who-knows-who'),
    answerKind: z.literal('choice'),
    options: optionsSchema,
  }).strict(),
  z.object({
    ...commonQuestionShape,
    kind: z.literal('shared-memory-detail'),
    answerKind: z.literal('choice'),
    options: optionsSchema,
  }).strict(),
  z.object({
    ...commonQuestionShape,
    kind: z.literal('family-lore-ordering'),
    answerKind: z.literal('ordering'),
    options: optionsSchema,
  }).strict(),
  z.object({
    ...commonQuestionShape,
    kind: z.literal('spectrum-read'),
    answerKind: z.literal('spectrum'),
    options: z.tuple([]),
    scale: z.object({
      min: z.literal(0),
      max: z.literal(100),
      step: z.literal(5),
      minLabel: conciseText,
      maxLabel: conciseText,
    }).strict().refine((scale) => scale.minLabel.toLocaleLowerCase() !== scale.maxLabel.toLocaleLowerCase(), 'Spectrum anchors must differ.'),
  }).strict(),
  z.object({
    ...commonQuestionShape,
    kind: z.literal('same-wavelength'),
    answerKind: z.literal('text'),
    options: z.tuple([]),
    inputHint: z.string().trim().min(2).max(48),
    maxLength: z.literal(40),
  }).strict(),
]);

export const familyTriviaQuestionPackSchema = z.object({
  protocolVersion: z.literal(1),
  id: safeId,
  title: conciseText,
  seed: z.number().int().min(0).max(0xffff_ffff),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('offline'), generatorVersion: z.literal(1) }).strict(),
    z.object({ kind: z.literal('ai'), providerId: safeId, model: conciseText.optional() }).strict(),
  ]),
  questions: z
    .array(questionSchema)
    .min(4)
    .max(16)
    .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length, 'Question ids must be unique.'),
}).strict();

export const familyTriviaSetupSchema = z.object({
  hostPlayerId: safeId,
  players: z.array(z.object({
    id: safeId,
    name: z.string().trim().min(1).max(24),
    teamId: safeId.optional(),
  }).strict()).min(2).max(4),
  teams: z.array(z.object({
    id: safeId,
    name: z.string().trim().min(1).max(24),
    memberPlayerIds: z.array(safeId).min(1).max(3),
  }).strict()).max(2),
}).strict().superRefine((setup, context) => {
  const playerIds = setup.players.map((player) => player.id);
  if (new Set(playerIds).size !== playerIds.length) {
    context.addIssue({ code: 'custom', message: 'Player ids must be unique.', path: ['players'] });
  }
  if (new Set(setup.players.map((player) => player.name.toLowerCase())).size !== setup.players.length) {
    context.addIssue({ code: 'custom', message: 'Player names must be unique.', path: ['players'] });
  }
  if (!playerIds.includes(setup.hostPlayerId)) {
    context.addIssue({ code: 'custom', message: 'The host must be one of the players.', path: ['hostPlayerId'] });
  }
  if (setup.teams.length !== 0 && setup.teams.length !== 2) {
    context.addIssue({ code: 'custom', message: 'Team play requires exactly two teams.', path: ['teams'] });
  }
  if (setup.teams.length === 0) {
    setup.players.forEach((player, index) => {
      if (player.teamId !== undefined) context.addIssue({ code: 'custom', message: 'Individual play cannot assign a team.', path: ['players', index, 'teamId'] });
    });
    return;
  }
  if (setup.players.length !== 4) {
    context.addIssue({ code: 'custom', message: 'Team Frequency requires exactly four players.', path: ['players'] });
  }
  const teamIds = setup.teams.map((team) => team.id);
  if (new Set(teamIds).size !== teamIds.length) {
    context.addIssue({ code: 'custom', message: 'Team ids must be unique.', path: ['teams'] });
  }
  if (setup.teams[0]?.memberPlayerIds.length !== setup.teams[1]?.memberPlayerIds.length) {
    context.addIssue({ code: 'custom', message: 'Team play requires two equally sized teams.', path: ['teams'] });
  }
  const assigned = setup.teams.flatMap((team) => team.memberPlayerIds);
  if (assigned.length !== playerIds.length || new Set(assigned).size !== assigned.length) {
    context.addIssue({ code: 'custom', message: 'Every player must appear in exactly one team.', path: ['teams'] });
  }
  assigned.forEach((playerId, index) => {
    if (!playerIds.includes(playerId)) context.addIssue({ code: 'custom', message: 'A team contains an unknown player.', path: ['teams', index] });
  });
  setup.players.forEach((player, index) => {
    const expected = setup.teams.find((team) => team.memberPlayerIds.includes(player.id))?.id;
    if (!player.teamId || player.teamId !== expected) {
      context.addIssue({ code: 'custom', message: 'Player team assignment does not match the team roster.', path: ['players', index, 'teamId'] });
    }
  });
});

export const familyTriviaAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), optionId: safeId }).strict(),
  z.object({ kind: z.literal('ordering'), optionIds: z.array(safeId).min(3).max(5) }).strict(),
  z.object({ kind: z.literal('spectrum'), value: z.number().int().min(0).max(100) }).strict(),
  z.object({
    kind: z.literal('text'),
    value: z.string().trim().min(1).max(40).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Answer contains control characters.'),
  }).strict(),
]);

const UNSAFE_FAMILY_PROMPT = new RegExp([
  'trauma',
  'abuse',
  'divorce',
  'death',
  'grief',
  'illness',
  'diagnosis',
  'therapy',
  'secret',
  'favorite child',
  'least favorite',
  'most annoying',
  'worst parent',
  'who is to blame',
  'salary',
  'debt',
  'politic',
  'religion',
  'romantic',
  'correct answer',
  'right answer',
  'answer is',
].join('|'), 'i');

export function parseFamilyTriviaSetup(value: unknown): FamilyTriviaSetup {
  return familyTriviaSetupSchema.parse(value) as FamilyTriviaSetup;
}

export function parseFamilyTriviaAnswer(value: unknown): FamilyTriviaAnswer {
  return familyTriviaAnswerSchema.parse(value) as FamilyTriviaAnswer;
}

export function parseSafeFamilyTriviaPack(value: unknown): FamilyTriviaQuestionPack {
  const pack = familyTriviaQuestionPackSchema.parse(value) as FamilyTriviaQuestionPack;
  for (const question of pack.questions) {
    const formatCopy = question.answerKind === 'spectrum'
      ? [question.scale.minLabel, question.scale.maxLabel]
      : question.answerKind === 'text'
        ? [question.inputHint]
        : [];
    const text = [question.prompt, question.afterRevealPrompt, ...question.options.map((option) => option.label), ...formatCopy].join(' ');
    if (UNSAFE_FAMILY_PROMPT.test(text)) {
      throw new Error(`Question ${question.id} contains a blocked sensitive or conflict prompt.`);
    }
  }
  return pack;
}

export function validateFamilyTriviaPackForSetup(
  pack: FamilyTriviaQuestionPack,
  setup: FamilyTriviaSetup,
): void {
  const playerIds = new Set(setup.players.map((player) => player.id));
  const coveredKinds = new Set(pack.questions.map((question) => question.kind));
  const coveredAnswerKinds = new Set(pack.questions.map((question) => question.answerKind));
  for (const answerKind of ['choice', 'ordering', 'spectrum', 'text'] as const) {
    if (!coveredAnswerKinds.has(answerKind)) throw new Error(`Question pack is missing the ${answerKind} answer format.`);
  }
  if (pack.questions.length >= FAMILY_TRIVIA_ROUND_KINDS.length) {
    for (const kind of FAMILY_TRIVIA_ROUND_KINDS) {
      if (!coveredKinds.has(kind)) throw new Error(`Question pack is missing the ${kind} round type.`);
    }
  }
  for (const question of pack.questions) {
    if (!playerIds.has(question.authorityPlayerId)) throw new Error(`Question ${question.id} has an unknown answer owner.`);
    if (question.respondentPlayerIds.includes(question.authorityPlayerId)) throw new Error(`Question ${question.id} lets its answer owner guess.`);
    for (const respondentId of question.respondentPlayerIds) {
      if (!playerIds.has(respondentId)) throw new Error(`Question ${question.id} has an unknown respondent.`);
    }
    if (setup.teams.length) {
      const authorityTeam = setup.teams.find((team) => team.memberPlayerIds.includes(question.authorityPlayerId));
      if (!authorityTeam || question.respondentPlayerIds.length !== 1 ||
        !authorityTeam.memberPlayerIds.includes(question.respondentPlayerIds[0])) {
        throw new Error(`Question ${question.id} must be read only by the answer owner's teammate.`);
      }
    }
  }
}

export function answerFitsFamilyTriviaQuestion(
  answer: FamilyTriviaAnswer,
  question: FamilyTriviaQuestionPack['questions'][number],
): boolean {
  const validIds = question.options.map((option) => option.id);
  if (question.answerKind === 'choice') {
    return answer.kind === 'choice' && validIds.includes(answer.optionId);
  }
  if (question.answerKind === 'ordering') {
    return answer.kind === 'ordering' &&
      answer.optionIds.length === validIds.length &&
      new Set(answer.optionIds).size === validIds.length &&
      answer.optionIds.every((optionId) => validIds.includes(optionId));
  }
  if (question.answerKind === 'spectrum') {
    return answer.kind === 'spectrum' && Number.isInteger(answer.value) &&
      answer.value >= question.scale.min && answer.value <= question.scale.max &&
      answer.value % question.scale.step === 0;
  }
  return answer.kind === 'text' && answer.value.trim().length > 0 && answer.value.trim().length <= question.maxLength;
}
