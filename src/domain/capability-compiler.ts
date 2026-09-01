import { optimizeRoleAssignments } from './role-optimizer';
import {
  MissionCompilationError,
  type ActionVariant,
  type CompileMissionInput,
  type CompiledAction,
  type CompiledMission,
  type DeviceProfile,
  type MissionBlueprint,
  type RoleAssignment,
} from './types';

function manualVariant(variants: readonly ActionVariant[]): ActionVariant | undefined {
  return variants.find((variant) => variant.capability === 'manual');
}

function deviceSupports(device: DeviceProfile, capability: ActionVariant['capability']): boolean {
  return capability === 'manual' || capability === 'touch' || device.capabilities.includes(capability);
}

function chooseVariant(variants: readonly ActionVariant[], device: DeviceProfile): ActionVariant | undefined {
  return variants.find((variant) => deviceSupports(device, variant.capability));
}

function chooseRoleAssignments(
  blueprint: MissionBlueprint,
  input: CompileMissionInput,
): readonly RoleAssignment[] {
  return optimizeRoleAssignments(input.players, blueprint.roles);
}

interface ActorChoice {
  role: RoleAssignment;
  device: DeviceProfile;
  variant: ActionVariant;
}

function scoreActorChoice(
  role: RoleAssignment,
  device: DeviceProfile,
  variant: ActionVariant,
  usedPlayerIds: ReadonlySet<string>,
  usedDeviceIds: ReadonlySet<string>,
): number {
  let score = variant.capability === 'manual' ? 0 : 100;
  if (device.ownerPlayerId === role.playerId) score += 25;
  if (!device.ownerPlayerId) score += 8;
  if (!usedPlayerIds.has(role.playerId)) score += 12;
  if (!usedDeviceIds.has(device.id)) score += 10;
  return score;
}

function selectActor(
  eligibleRoles: readonly RoleAssignment[],
  devices: readonly DeviceProfile[],
  variants: readonly ActionVariant[],
  usedPlayerIds: ReadonlySet<string>,
  usedDeviceIds: ReadonlySet<string>,
): ActorChoice | undefined {
  let best: { choice: ActorChoice; score: number } | undefined;
  for (const role of eligibleRoles) {
    for (const device of devices) {
      const variant = chooseVariant(variants, device);
      if (!variant) continue;
      const score = scoreActorChoice(role, device, variant, usedPlayerIds, usedDeviceIds);
      if (!best || score > best.score) best = { choice: { role, device, variant }, score };
    }
  }
  return best?.choice;
}

function validateBlueprint(blueprint: MissionBlueprint): void {
  const roleIds = new Set(blueprint.roles.map((role) => role.id));
  if (roleIds.size !== blueprint.roles.length || blueprint.stages.length === 0) {
    throw new MissionCompilationError('Mission blueprint has duplicate roles or no stages.', {
      code: 'INVALID_BLUEPRINT',
    });
  }

  for (const stage of blueprint.stages) {
    if (stage.requirements.length === 0) {
      throw new MissionCompilationError(`Stage ${stage.id} has no requirements.`, {
        code: 'INVALID_BLUEPRINT',
        context: { stageId: stage.id },
      });
    }
    for (const requirement of stage.requirements) {
      if (!manualVariant(requirement.variants)) {
        throw new MissionCompilationError(`Requirement ${requirement.id} has no manual fallback.`, {
          code: 'NO_MANUAL_FALLBACK',
          context: { stageId: stage.id, requirementId: requirement.id },
        });
      }
      if (requirement.eligibleRoleIds?.some((roleId) => !roleIds.has(roleId))) {
        throw new MissionCompilationError(`Requirement ${requirement.id} references an unknown role.`, {
          code: 'INVALID_BLUEPRINT',
          context: { stageId: stage.id, requirementId: requirement.id },
        });
      }
    }
  }
}

export function compileMission(
  blueprint: MissionBlueprint,
  input: CompileMissionInput,
): CompiledMission {
  validateBlueprint(blueprint);
  if (input.players.length < blueprint.minimumPlayers || input.players.length > blueprint.maximumPlayers) {
    throw new MissionCompilationError(
      `${blueprint.title} requires ${blueprint.minimumPlayers}-${blueprint.maximumPlayers} players.`,
      {
        code: 'PLAYER_COUNT',
        context: { count: input.players.length },
      },
    );
  }

  const devices = input.devices.filter((device) => device.online);
  if (devices.length === 0) {
    throw new MissionCompilationError('No online devices are available.', { code: 'NO_ONLINE_DEVICES' });
  }

  const assignments = chooseRoleAssignments(blueprint, input);
  const warnings: string[] = [];

  const stages = blueprint.stages.map((stage) => {
    const stageUsedPlayers = new Set<string>();
    const stageUsedDevices = new Set<string>();
    const actions: CompiledAction[] = [];

    for (const requirement of stage.requirements) {
      const fallback = manualVariant(requirement.variants);
      if (!fallback) {
        throw new MissionCompilationError(`Requirement ${requirement.id} has no manual fallback.`, {
          code: 'NO_MANUAL_FALLBACK',
        });
      }

      const eligibleRoles = assignments.filter(
        (assignment) => !requirement.eligibleRoleIds || requirement.eligibleRoleIds.includes(assignment.roleId),
      );
      if (eligibleRoles.length === 0) {
        throw new MissionCompilationError(`No assigned role can perform ${requirement.id}.`, {
          code: 'NO_SAFE_CONFIGURATION',
          context: { stageId: stage.id, requirementId: requirement.id },
        });
      }

      const actorLimit = Math.min(requirement.requiredActors, eligibleRoles.length, devices.length);
      if (!requirement.scaleDownToAvailable && actorLimit < requirement.requiredActors) {
        throw new MissionCompilationError(`Not enough actors or devices for ${requirement.id}.`, {
          code: 'NO_SAFE_CONFIGURATION',
          context: {
            stageId: stage.id,
            requirementId: requirement.id,
            required: requirement.requiredActors,
            available: actorLimit,
          },
        });
      }
      const actorCount = Math.max(1, actorLimit);

      for (let actorIndex = 0; actorIndex < actorCount; actorIndex += 1) {
        const unusedRoles = eligibleRoles.filter((role) => !stageUsedPlayers.has(role.playerId));
        const rolePool = unusedRoles.length > 0 ? unusedRoles : eligibleRoles;
        const unusedDevices = devices.filter((device) => !stageUsedDevices.has(device.id));
        const devicePool = unusedDevices.length > 0 ? unusedDevices : devices;
        const choice = selectActor(
          rolePool,
          devicePool,
          requirement.variants,
          stageUsedPlayers,
          stageUsedDevices,
        );
        if (!choice) {
          throw new MissionCompilationError(`No viable device/role pair for ${requirement.id}.`, {
            code: 'NO_SAFE_CONFIGURATION',
            context: { stageId: stage.id, requirementId: requirement.id, actorIndex },
          });
        }

        const actionId = `${stage.id}/${requirement.id}/${actorIndex + 1}`;
        actions.push({
          id: actionId,
          requirementId: requirement.id,
          title: requirement.title,
          participantId: choice.role.playerId,
          roleId: choice.role.roleId,
          deviceId: choice.device.id,
          selectedVariant: choice.variant,
          manualFallback: fallback,
          synchronizationGroup: requirement.synchronizationGroup,
          synchronizationWindowMs: requirement.synchronizationWindowMs,
        });
        stageUsedPlayers.add(choice.role.playerId);
        stageUsedDevices.add(choice.device.id);
        if (choice.variant.capability === 'manual') {
          warnings.push(`${actionId} uses its manual fallback because no compatible sensor was available.`);
        }
      }
    }

    return {
      id: stage.id,
      title: stage.title,
      briefing: stage.briefing,
      timeoutMs: stage.timeoutMs,
      hint: stage.hint,
      actions,
    };
  });

  return {
    id: input.missionId,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    title: blueprint.title,
    compiledAt: input.compiledAt,
    roleAssignments: assignments,
    stages,
    capabilityWarnings: warnings,
  };
}
