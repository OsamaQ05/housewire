import type {
  ForgeCase,
  ForgeCaseSummary,
  ForgeCaseValidation,
  ForgePlayerCase,
  ForgePlayerMechanic,
  ForgeStageSubmission,
  ForgeSubmissionResult,
  ForgeValidationIssue,
} from './types';
import { forgeCaseSchema, parseForgeCase } from './schema';

function sameSet<T>(first: readonly T[], second: readonly T[]): boolean {
  return first.length === second.length && new Set(first).size === first.length && first.every((value) => second.includes(value));
}

function sameArray<T>(first: readonly T[], second: readonly T[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function normalizedEdge(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function issue(issues: ForgeValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function validateOrderStage(game: ForgeCase, issues: ForgeValidationIssue[]): void {
  const stage = game.stages[0];
  if (stage.mechanic.kind !== 'distributed-order' || stage.solution.kind !== 'sequence') {
    issue(issues, 'MECHANIC_SOLUTION', 'stages.0', 'The opening stage must use a sequence solution.');
    return;
  }
  const tokenIds = stage.mechanic.tokens.map((token) => token.id);
  if (!sameSet(tokenIds, stage.solution.answer)) {
    issue(issues, 'ORDER_TOKEN_SET', 'stages.0.solution', 'The order answer must use every token exactly once.');
  }
  const expectedConstraints = stage.solution.answer
    .slice(0, -1)
    .map((token, index) => `${token}:${stage.solution.kind === 'sequence' ? stage.solution.answer[index + 1] : ''}`);
  const constraints = stage.mechanic.adjacentConstraints.map(([first, second]) => `${first}:${second}`);
  if (!sameArray(constraints, expectedConstraints)) {
    issue(issues, 'ORDER_CONSTRAINTS', 'stages.0.mechanic', 'Adjacent constraints must define the authoritative order.');
  }
  if (stage.clues.filter((clue) => clue.id.startsWith('order-link-')).length !== expectedConstraints.length) {
    issue(issues, 'ORDER_CLUES', 'stages.0.clues', 'Every order constraint needs one distributed clue.');
  }
}

function validateSymbolStage(game: ForgeCase, issues: ForgeValidationIssue[]): void {
  const stage = game.stages[1];
  if (stage.mechanic.kind !== 'symbol-lock' || stage.solution.kind !== 'code') {
    issue(issues, 'MECHANIC_SOLUTION', 'stages.1', 'The second stage must use a code solution.');
    return;
  }
  if (!stage.mechanic.encodedSequence.every((symbol) => stage.mechanic.kind === 'symbol-lock' && stage.mechanic.symbols.includes(symbol))) {
    issue(issues, 'UNKNOWN_SYMBOL', 'stages.1.mechanic.encodedSequence', 'Encoded symbols must belong to the lock alphabet.');
  }
  const pairs = stage.clues.flatMap((clue) => clue.payload.kind === 'mapping' ? clue.payload.pairs : []);
  const mapping = new Map(pairs.map((pair) => [pair.left, pair.right]));
  if (mapping.size !== stage.mechanic.symbols.length || !stage.mechanic.symbols.every((symbol) => mapping.has(symbol))) {
    issue(issues, 'INCOMPLETE_DECODER', 'stages.1.clues', 'Distributed decoder strips must cover every lock symbol.');
  } else {
    const reconstructed = stage.mechanic.encodedSequence.map((symbol) => mapping.get(symbol)).join('');
    if (reconstructed !== stage.solution.answer) {
      issue(issues, 'CODE_MISMATCH', 'stages.1.solution', 'Decoder strips do not reconstruct the stored code.');
    }
  }
  if (stage.mechanic.revealMode === 'camera') {
    const markerSymbols = stage.clues.flatMap((clue) => clue.payload.kind === 'camera-marker' ? [clue.payload.symbol] : []);
    if (!sameSet(markerSymbols, stage.mechanic.symbols)) {
      issue(issues, 'MARKER_COVERAGE', 'stages.1.clues', 'Every lock symbol needs exactly one camera-safe marker.');
    }
  } else {
    const manualSymbols = stage.mechanic.symbols.filter((symbol, index) =>
      stage.clues.some((clue) =>
        clue.id === `marker-${index + 1}` &&
        clue.payload.kind === 'text' &&
        clue.payload.text === `Manual marker ${index + 1}: ${symbol}`,
      ),
    );
    if (!sameSet(manualSymbols, stage.mechanic.symbols)) {
      issue(issues, 'MARKER_COVERAGE', 'stages.1.clues', 'Every lock symbol needs exactly one manual marker reveal.');
    }
  }
}

function validateRelayStage(game: ForgeCase, issues: ForgeValidationIssue[]): void {
  const stage = game.stages[2];
  if (stage.mechanic.kind !== 'private-relay' || stage.solution.kind !== 'relay') {
    issue(issues, 'MECHANIC_SOLUTION', 'stages.2', 'The third stage must use recipient-bound relay proofs.');
    return;
  }
  if (stage.mechanic.memoryMode !== (game.playerCount === 1)) {
    issue(issues, 'MEMORY_MODE', 'stages.2.mechanic.memoryMode', 'Memory mode is reserved for a one-player case.');
  }
  const playerIds = game.recipe.playerIds;
  if (stage.mechanic.rounds.length !== stage.solution.rounds.length) {
    issue(issues, 'RELAY_ROUNDS', 'stages.2', 'Relay mechanics and answers must have the same round count.');
    return;
  }
  stage.mechanic.rounds.forEach((round, index) => {
    const answer = stage.solution.kind === 'relay' ? stage.solution.rounds[index] : undefined;
    const expectedExcluded = playerIds.filter(
      (playerId) => playerId !== round.senderPlayerId && playerId !== round.recipientPlayerId,
    );
    if (
      !answer ||
      answer.round !== round.round ||
      answer.recipientPlayerId !== round.recipientPlayerId ||
      !sameSet(round.excludedPlayerIds, expectedExcluded)
    ) {
      issue(issues, 'RELAY_CONTRACT', `stages.2.mechanic.rounds.${index}`, 'Relay actors, recipient, and exclusions disagree.');
    }
    const senderTokens = stage.clues.filter(
      (clue) =>
        clue.audiencePlayerIds.length === 1 &&
        clue.audiencePlayerIds[0] === round.senderPlayerId &&
        answer !== undefined &&
        (stage.mechanic.kind === 'private-relay' && stage.mechanic.deliveryMode === 'audio'
          ? clue.payload.kind === 'audio-token' && clue.payload.spokenText === answer.token
          : clue.payload.kind === 'text' && clue.payload.text === `One-time word: ${answer.token}`),
    );
    if (senderTokens.length !== 1) {
      issue(issues, 'RELAY_SECRET', `stages.2.clues`, `Round ${round.round} must expose its token only to its sender.`);
    }
  });
}

function mazePath(
  start: number,
  exit: number,
  cells: readonly number[],
  edges: readonly (readonly [number, number])[],
): number[] | null {
  const adjacency = new Map(cells.map((cell) => [cell, [] as number[]]));
  for (const [first, second] of edges) {
    adjacency.get(first)?.push(second);
    adjacency.get(second)?.push(first);
  }
  const queue = [start];
  const previous = new Map<number, number | null>([[start, null]]);
  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (current === exit) break;
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(exit)) return null;
  const result: number[] = [];
  let cursor: number | null = exit;
  while (cursor !== null) {
    result.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  return result.reverse();
}

function validateRouteStage(game: ForgeCase, issues: ForgeValidationIssue[]): void {
  const stage = game.stages[3];
  if (stage.mechanic.kind !== 'route-grid' || stage.solution.kind !== 'route') {
    issue(issues, 'MECHANIC_SOLUTION', 'stages.3', 'The fourth stage must use a route solution.');
    return;
  }
  const mechanic = stage.mechanic;
  const cellCount = mechanic.width * mechanic.height;
  if (mechanic.width !== mechanic.height || mechanic.cells.length !== cellCount || !sameSet(mechanic.cells, Array.from({ length: cellCount }, (_, index) => index + 1))) {
    issue(issues, 'GRID_CELLS', 'stages.3.mechanic.cells', 'Route cells must form a complete numbered square grid.');
  }
  const keys = mechanic.openEdges.map(([first, second]) => normalizedEdge(first, second));
  const validEdges = mechanic.openEdges.every(([first, second]) => {
    const rowDistance = Math.abs(Math.floor((first - 1) / mechanic.width) - Math.floor((second - 1) / mechanic.width));
    const columnDistance = Math.abs(((first - 1) % mechanic.width) - ((second - 1) % mechanic.width));
    return mechanic.cells.includes(first) && mechanic.cells.includes(second) && rowDistance + columnDistance === 1;
  });
  if (!validEdges || new Set(keys).size !== keys.length || mechanic.openEdges.length !== cellCount - 1) {
    issue(issues, 'GRID_EDGES', 'stages.3.mechanic.openEdges', 'The route network must be a simple perfect maze.');
  }
  const expectedPath = mazePath(mechanic.startCell, mechanic.exitCell, mechanic.cells, mechanic.openEdges);
  if (!expectedPath || !sameArray(expectedPath, stage.solution.answer)) {
    issue(issues, 'ROUTE_ANSWER', 'stages.3.solution', 'The stored route is not the unique entry-to-exit path.');
  }
  const clueEdges = stage.clues.flatMap((clue) => clue.payload.kind === 'grid-edges' ? clue.payload.edges : []);
  const clueKeys = clueEdges.map(([first, second]) => normalizedEdge(first, second));
  if (!sameSet(clueKeys, keys)) {
    issue(issues, 'ROUTE_LAYERS', 'stages.3.clues', 'Distributed route layers must cover every open edge exactly once.');
  }
}

function validateSyncStage(game: ForgeCase, issues: ForgeValidationIssue[]): void {
  const stage = game.stages[4];
  if (stage.mechanic.kind !== 'motion-sync' || stage.solution.kind !== 'sync') {
    issue(issues, 'MECHANIC_SOLUTION', 'stages.4', 'The finale must use synchronized physical proofs.');
    return;
  }
  if (
    stage.mechanic.windowMs !== stage.solution.windowMs ||
    JSON.stringify(stage.mechanic.assignments) !== JSON.stringify(stage.solution.assignments)
  ) {
    issue(issues, 'SYNC_ANSWER', 'stages.4.solution', 'The synchronized proof must match the assigned formation.');
  }
  if (!sameSet(stage.mechanic.assignments.map((assignment) => assignment.playerId), game.recipe.playerIds)) {
    issue(issues, 'SYNC_PLAYERS', 'stages.4.mechanic.assignments', 'Every player needs exactly one finale position.');
  }
  if (!game.recipe.noiseAllowed && stage.mechanic.assignments.some((assignment) => assignment.vocalCue !== 'NONE')) {
    issue(issues, 'NOISE_POLICY', 'stages.4.mechanic.assignments', 'A quiet-room recipe cannot require vocal evidence.');
  }
  for (const [index, assignment] of stage.mechanic.assignments.entries()) {
    const positionClue = stage.clues.some(
      (clue) =>
        clue.audiencePlayerIds.length === 1 &&
        clue.audiencePlayerIds[0] === assignment.playerId &&
        (stage.mechanic.kind === 'motion-sync' && stage.mechanic.inputMode === 'motion'
          ? clue.payload.kind === 'pose' && clue.payload.pose === assignment.pose
          : clue.payload.kind === 'text' && clue.payload.text === `Touch contact ${index + 1}: hold the on-screen plate until it arms.`),
    );
    if (!positionClue) issue(issues, 'SYNC_CLUE', 'stages.4.clues', `Missing private position clue for ${assignment.playerId}.`);
  }
}

/** Recomputes structural and logical playability; never trusts a stored validation stamp. */
export function validateForgeCase(value: unknown): ForgeCaseValidation {
  const parsed = forgeCaseSchema.safeParse(value);
  if (!parsed.success) {
    return {
      playable: false,
      issues: parsed.error.issues.slice(0, 50).map((zodIssue) => ({
        code: 'SCHEMA',
        path: zodIssue.path.join('.'),
        message: zodIssue.message,
      })),
    };
  }
  const game = parsed.data as ForgeCase;
  const issues: ForgeValidationIssue[] = [];
  const playerIds = game.recipe.playerIds;
  if (game.playerCount !== playerIds.length) issue(issues, 'PLAYER_COUNT', 'playerCount', 'Player count disagrees with the recipe.');
  if (!sameSet(game.roles.map((role) => role.playerId), playerIds)) issue(issues, 'ROLE_COVERAGE', 'roles', 'Every player needs exactly one role.');
  if (game.theme !== game.recipe.themeId) issue(issues, 'THEME_RECIPE', 'theme', 'Theme and generation recipe disagree.');
  if (game.durationMinutes !== game.recipe.targetMinutes) issue(issues, 'DURATION_RECIPE', 'durationMinutes', 'Duration and generation recipe disagree.');
  if (game.difficulty !== game.recipe.difficulty) issue(issues, 'DIFFICULTY_RECIPE', 'difficulty', 'Difficulty and generation recipe disagree.');
  if (game.replayIndex !== game.recipe.replayIndex) issue(issues, 'REPLAY_RECIPE', 'replayIndex', 'Replay index and generation recipe disagree.');
  if (game.stages.reduce((sum, stage) => sum + stage.durationMinutes, 0) !== game.durationMinutes) {
    issue(issues, 'STAGE_DURATION', 'stages', 'Stage durations must add up to the advertised duration.');
  }
  const stageIds = game.stages.map((stage) => stage.id);
  if (new Set(stageIds).size !== stageIds.length || !game.stages.every((stage, index) => stage.index === index)) {
    issue(issues, 'STAGE_ORDER', 'stages', 'Stage ids and indexes must be unique and contiguous.');
  }
  const clueIds = game.stages.flatMap((stage) => stage.clues.map((clue) => clue.id));
  if (new Set(clueIds).size !== clueIds.length) issue(issues, 'CLUE_IDS', 'stages.clues', 'Clue ids must be unique across the case.');
  for (const stage of game.stages) {
    if (!sameSet(stage.requiredPlayerIds, playerIds)) {
      issue(issues, 'REQUIRED_PLAYERS', `stages.${stage.index}.requiredPlayerIds`, 'Every generated stage must involve the full crew.');
    }
    if (!stage.submitterPlayerIds.every((playerId) => playerIds.includes(playerId))) {
      issue(issues, 'SUBMITTERS', `stages.${stage.index}.submitterPlayerIds`, 'Submitters must belong to the case crew.');
    }
    if (!sameArray(stage.hints.map((hint) => hint.level), [1, 2, 3])) {
      issue(issues, 'HINT_LEVELS', `stages.${stage.index}.hints`, 'Hints must progress through levels 1, 2 and 3.');
    }
    for (const clue of stage.clues) {
      if (!clue.audiencePlayerIds.every((playerId) => playerIds.includes(playerId))) {
        issue(issues, 'CLUE_AUDIENCE', `stages.${stage.index}.clues.${clue.id}`, 'Clue audiences must be members of the crew.');
      }
      if (!clue.private && !sameSet(clue.audiencePlayerIds, playerIds)) {
        issue(issues, 'PUBLIC_CLUE', `stages.${stage.index}.clues.${clue.id}`, 'Public clues must be visible to the full crew.');
      }
    }
  }
  validateOrderStage(game, issues);
  validateSymbolStage(game, issues);
  validateRelayStage(game, issues);
  validateRouteStage(game, issues);
  validateSyncStage(game, issues);
  return { playable: issues.length === 0, issues };
}

export function assertPlayableForgeCase(value: unknown): ForgeCase {
  const game = parseForgeCase(value);
  const validation = validateForgeCase(game);
  if (!validation.playable) {
    const detail = validation.issues.slice(0, 3).map((entry) => `${entry.path}: ${entry.message}`).join('; ');
    throw new Error(`Generated case is not playable: ${detail}`);
  }
  return game;
}

function prefixResult<T>(expected: readonly T[], submitted: readonly T[], stageId: string): ForgeSubmissionResult {
  let acceptedPrefixLength = 0;
  const comparableLength = Math.min(expected.length, submitted.length);
  while (acceptedPrefixLength < comparableLength && expected[acceptedPrefixLength] === submitted[acceptedPrefixLength]) {
    acceptedPrefixLength += 1;
  }
  if (acceptedPrefixLength < comparableLength || submitted.length > expected.length) {
    return { accepted: false, code: 'WRONG_VALUE', stageId, acceptedPrefixLength, expectedLength: expected.length };
  }
  if (submitted.length < expected.length) {
    return { accepted: false, code: 'INCOMPLETE', stageId, acceptedPrefixLength, expectedLength: expected.length };
  }
  return { accepted: true, code: 'ACCEPTED', stageId, acceptedPrefixLength, expectedLength: expected.length };
}

export function validateForgeSubmission(
  game: ForgeCase,
  stageIndex: number,
  submission: ForgeStageSubmission,
): ForgeSubmissionResult {
  const stage = game.stages[stageIndex];
  if (!stage || stage.index !== stageIndex) return { accepted: false, code: 'INVALID_STAGE' };
  const solution = stage.solution;
  if (solution.kind !== submission.kind) return { accepted: false, code: 'WRONG_SUBMISSION_KIND', stageId: stage.id };
  switch (solution.kind) {
    case 'sequence':
      return prefixResult(solution.answer, (submission as Extract<ForgeStageSubmission, { kind: 'sequence' }>).value, stage.id);
    case 'code': {
      const submitted = (submission as Extract<ForgeStageSubmission, { kind: 'code' }>).value.trim();
      if (submitted === solution.answer) return { accepted: true, code: 'ACCEPTED', stageId: stage.id, acceptedPrefixLength: submitted.length, expectedLength: solution.answer.length };
      const acceptedPrefixLength = [...submitted].findIndex((character, index) => solution.answer[index] !== character);
      const prefix = acceptedPrefixLength < 0 ? Math.min(submitted.length, solution.answer.length) : acceptedPrefixLength;
      return {
        accepted: false,
        code: solution.answer.startsWith(submitted) ? 'INCOMPLETE' : 'WRONG_VALUE',
        stageId: stage.id,
        acceptedPrefixLength: prefix,
        expectedLength: solution.answer.length,
      };
    }
    case 'relay': {
      const submitted = (submission as Extract<ForgeStageSubmission, { kind: 'relay' }>).rounds;
      let acceptedPrefixLength = 0;
      for (let index = 0; index < Math.min(solution.rounds.length, submitted.length); index += 1) {
        const expectedRound = solution.rounds[index];
        const submittedRound = submitted[index];
        if (expectedRound.recipientPlayerId !== submittedRound.recipientPlayerId) {
          return { accepted: false, code: 'WRONG_RECIPIENT', stageId: stage.id, acceptedPrefixLength, expectedLength: solution.rounds.length };
        }
        if (expectedRound.round !== submittedRound.round || expectedRound.token !== submittedRound.token.trim().toUpperCase()) {
          return { accepted: false, code: 'WRONG_VALUE', stageId: stage.id, acceptedPrefixLength, expectedLength: solution.rounds.length };
        }
        acceptedPrefixLength += 1;
      }
      if (submitted.length !== solution.rounds.length) {
        return {
          accepted: false,
          code: submitted.length < solution.rounds.length ? 'INCOMPLETE' : 'WRONG_VALUE',
          stageId: stage.id,
          acceptedPrefixLength,
          expectedLength: solution.rounds.length,
        };
      }
      return { accepted: true, code: 'ACCEPTED', stageId: stage.id, acceptedPrefixLength, expectedLength: solution.rounds.length };
    }
    case 'route':
      return prefixResult(solution.answer, (submission as Extract<ForgeStageSubmission, { kind: 'route' }>).value, stage.id);
    case 'sync': {
      const submitted = submission as Extract<ForgeStageSubmission, { kind: 'sync' }>;
      if (
        !Number.isFinite(submitted.startedAt) ||
        !Number.isFinite(submitted.completedAt) ||
        submitted.completedAt < submitted.startedAt ||
        submitted.completedAt - submitted.startedAt > solution.windowMs
      ) {
        return { accepted: false, code: 'TIMING_WINDOW', stageId: stage.id };
      }
      if (submitted.proofs.length !== solution.assignments.length || new Set(submitted.proofs.map((proof) => proof.playerId)).size !== submitted.proofs.length) {
        return { accepted: false, code: 'WRONG_ACTOR', stageId: stage.id };
      }
      for (const assignment of solution.assignments) {
        const proof = submitted.proofs.find((candidate) => candidate.playerId === assignment.playerId);
        if (!proof) return { accepted: false, code: 'WRONG_ACTOR', stageId: stage.id };
        if (proof.pose !== assignment.pose || proof.vocalCue !== assignment.vocalCue) {
          return { accepted: false, code: 'WRONG_VALUE', stageId: stage.id };
        }
      }
      return { accepted: true, code: 'ACCEPTED', stageId: stage.id };
    }
  }
}

/** Removes all answers and every clue not addressed to this phone. */
export function projectForgeCaseForPlayer(game: ForgeCase, playerId: string): ForgePlayerCase {
  const role = game.roles.find((candidate) => candidate.playerId === playerId);
  if (!role) throw new Error(`Player ${playerId} is not part of case ${game.id}.`);
  const {
    effectiveSeed: _effectiveSeed,
    recipe: _recipe,
    replayIndex: _replayIndex,
    roles,
    seed: _seed,
    stages,
    validation: _validation,
    ...publicCase
  } = game;
  return {
    ...publicCase,
    role,
    crew: roles.map(({ playerId: id, playerName, title, accent }) => ({ playerId: id, playerName, title, accent })),
    stages: stages.map(({ solution: _solution, clues, mechanic, ...stage }) => {
      const visibleClues = clues
        .filter((clue) => clue.audiencePlayerIds.includes(playerId))
        .map((clue) => clue.payload.kind === 'camera-marker'
          ? { ...clue, payload: { kind: 'camera-display' as const, markerToken: clue.payload.markerToken } }
          : clue);
      if (mechanic.kind === 'symbol-lock' && mechanic.revealMode === 'camera') {
        for (const marker of clues) {
          if (marker.payload.kind !== 'camera-marker') continue;
          const suffix = marker.id.match(/marker-([1-9][0-9]*)$/)?.[1];
          const decoder = suffix ? clues.find((clue) => clue.id === `decoder-${suffix}`) : undefined;
          if (!decoder?.audiencePlayerIds.includes(playerId)) continue;
          visibleClues.push({
            id: `scanner-${suffix}`,
            title: `Lens target ${suffix}`,
            audiencePlayerIds: [playerId],
            private: true,
            payload: {
              kind: 'camera-scanner',
              markerToken: marker.payload.markerToken,
              symbol: marker.payload.symbol,
            },
          });
        }
      }
      return {
        ...stage,
        mechanic: projectMechanicForPlayer(mechanic, playerId),
        clues: visibleClues,
      };
    }),
  };
}

function projectMechanicForPlayer(
  mechanic: ForgeCase['stages'][number]['mechanic'],
  playerId: string,
): ForgePlayerMechanic {
  switch (mechanic.kind) {
    case 'distributed-order': {
      const { adjacentConstraints: _adjacentConstraints, ...publicMechanic } = mechanic;
      return publicMechanic;
    }
    case 'route-grid': {
      const { openEdges: _openEdges, ...publicMechanic } = mechanic;
      return publicMechanic;
    }
    case 'motion-sync':
      return {
        ...mechanic,
        assignments: mechanic.assignments.filter((assignment) => assignment.playerId === playerId),
        participantCount: mechanic.assignments.length,
      };
    default:
      return mechanic;
  }
}

export function forgeCaseSummary(game: ForgeCase): ForgeCaseSummary {
  return {
    id: game.id,
    title: game.title,
    tagline: game.tagline,
    theme: game.theme,
    accent: game.accent,
    durationMinutes: game.durationMinutes,
    playerCount: game.playerCount,
    difficulty: game.difficulty,
    createdAt: game.createdAt,
    replayIndex: game.replayIndex,
    providerId: game.providerId,
  };
}
