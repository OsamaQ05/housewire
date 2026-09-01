import type { PlayerProfile, RoleAssignment, RoleBlueprint } from './types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

interface ScoredPair {
  score: number;
  reasons: string[];
}

function scorePair(player: PlayerProfile, role: RoleBlueprint): ScoredPair {
  const styleFit = Object.entries(role.styleWeights).reduce((score, [style, weight]) => {
    return score + (player.preferredStyles.includes(style as never) ? (weight ?? 0) : 0);
  }, 0);
  const maximumStyleWeight = Object.values(role.styleWeights).reduce<number>((sum, value) => sum + (value ?? 0), 0) || 1;
  const normalizedStyleFit = clamp01(styleFit / maximumStyleWeight);

  const mobilityGap = Math.max(0, role.movementDemand - clamp01(player.mobility));
  const mobilityFit = 1 - mobilityGap;
  const complexityFit = 1 - Math.abs(clamp01(player.experience) - role.complexity) * 0.55;
  const fairnessPenalty = Math.min(0.45, (player.recentCriticalRoles ?? 0) * role.criticality * 0.11);

  const score = normalizedStyleFit * 4.2 + mobilityFit * 3 + complexityFit * 1.8 - fairnessPenalty * 3;
  const reasons: string[] = [];
  if (normalizedStyleFit >= 0.5) reasons.push('preferred play style');
  if (mobilityGap === 0 && role.movementDemand >= 0.6) reasons.push('comfortable with movement');
  if (complexityFit >= 0.86 && role.complexity >= 0.65) reasons.push('matched puzzle experience');
  if (fairnessPenalty >= 0.2) reasons.push('fairness penalty for recent lead roles');
  if (mobilityGap >= 0.35) reasons.push('movement demand exceeds comfort');

  return { score, reasons };
}

interface SearchResult {
  score: number;
  assignments: RoleAssignment[];
}

/**
 * Exhaustively optimizes the small (2-6 person) family assignment instead of
 * greedily giving the first player every high-agency role.
 */
export function optimizeRoleAssignments(
  players: readonly PlayerProfile[],
  availableRoles: readonly RoleBlueprint[],
): readonly RoleAssignment[] {
  if (players.length === 0) return [];
  const roles = availableRoles.slice(0, players.length);
  if (roles.length < players.length) {
    throw new Error(`Not enough role blueprints for ${players.length} players.`);
  }

  let best: SearchResult | undefined;
  const usedPlayers = new Set<string>();
  const current: RoleAssignment[] = [];

  const search = (roleIndex: number, total: number): void => {
    if (roleIndex === roles.length) {
      if (!best || total > best.score) {
        best = { score: total, assignments: current.map((assignment) => ({ ...assignment })) };
      }
      return;
    }

    const role = roles[roleIndex];
    for (const player of players) {
      if (usedPlayers.has(player.id)) continue;
      const pair = scorePair(player, role);
      usedPlayers.add(player.id);
      current.push({ roleId: role.id, playerId: player.id, score: pair.score, reasons: pair.reasons });
      search(roleIndex + 1, total + pair.score);
      current.pop();
      usedPlayers.delete(player.id);
    }
  };

  search(0, 0);
  return best ? (best as SearchResult).assignments : [];
}

export function roleFitScore(player: PlayerProfile, role: RoleBlueprint): number {
  return scorePair(player, role).score;
}
