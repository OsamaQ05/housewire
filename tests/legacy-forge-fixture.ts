import type { ForgeCase, ForgeStage } from '../src/domain/case-forge';

/** Explicit old-save fixture: new cases must not regenerate the old hold-only ending. */
export function withLegacySyncFinale(game: ForgeCase): ForgeCase {
  const players = game.recipe.playerIds;
  const assignments = players.map((playerId) => ({ playerId, pose: 'HOLD_STILL' as const, vocalCue: 'NONE' as const }));
  const stage: ForgeStage = {
    ...game.stages[4],
    id: 'forge-motion-sync',
    mechanic: { kind: 'motion-sync', assignments, inputMode: 'touch', windowMs: 8_000, preferredCapability: 'motion' },
    clues: assignments.map((assignment, index) => ({ id: `sync-assignment-${index + 1}`, title: 'Legacy contact', audiencePlayerIds: [assignment.playerId], private: players.length > 1, payload: { kind: 'text', text: `Touch contact ${index + 1}: hold the on-screen plate until it arms.` } })),
    solution: { kind: 'sync', windowMs: 8_000, assignments },
  };
  return { ...game, generatorVersion: 'housewire-local-forge-v2', stages: [...game.stages.slice(0, 4), stage] };
}
