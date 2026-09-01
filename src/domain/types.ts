export const CAPABILITIES = [
  'manual',
  'touch',
  'motion',
  'orientation',
  'microphoneLevel',
  'cameraQr',
  'ambientLight',
  'haptics',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const EVIDENCE_KINDS = [
  'MANUAL_HOLD',
  'ROTATED_TO_TARGET',
  'CARRY_STEADY',
  'QUIET_WINDOW',
  'QR_SCANNED',
  'STILL_HOLD',
  'PLACED_FLAT',
  'LIFTED',
  'SHAKE_PATTERN',
  'CLAP_PATTERN',
  'RHYTHM_MATCHED',
  'LIGHT_CHANGED',
  'WARNING_RECONSTRUCTED',
  'RECEIPT_RELEASED',
  'ROUTE_RECONSTRUCTED',
  'HUNG_UP',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type PlayStyle = 'movement' | 'pattern' | 'observation' | 'timing' | 'leadership';

export interface PlayerProfile {
  id: string;
  displayName: string;
  /** 0 means seated-only; 1 means comfortable with active movement. */
  mobility: number;
  /** Familiarity with puzzle games, from 0 to 1. */
  experience: number;
  preferredStyles: readonly PlayStyle[];
  /** Number of high-agency roles held in recent sessions. */
  recentCriticalRoles?: number;
}

export interface DeviceProfile {
  id: string;
  label: string;
  ownerPlayerId?: string;
  roomId?: string;
  capabilities: readonly Capability[];
  online: boolean;
}

export interface RoomProfile {
  id: string;
  label: string;
  safeForMovement: boolean;
  noiseAllowed: boolean;
}

export interface RoleBlueprint {
  id: string;
  title: string;
  criticality: number;
  movementDemand: number;
  complexity: number;
  styleWeights: Partial<Record<PlayStyle, number>>;
}

export interface ActionVariant {
  id: string;
  capability: Capability;
  evidenceKind: EvidenceKind;
  instruction: string;
  minimumConfidence: number;
  /** Optional payload value that evidence must match, such as a QR marker id. */
  expectedValue?: string;
}

export interface RequirementBlueprint {
  id: string;
  title: string;
  variants: readonly ActionVariant[];
  requiredActors: number;
  scaleDownToAvailable: boolean;
  eligibleRoleIds?: readonly string[];
  synchronizationGroup?: string;
  synchronizationWindowMs?: number;
}

export interface StageBlueprint {
  id: string;
  title: string;
  briefing: string;
  timeoutMs: number;
  hint: string;
  requirements: readonly RequirementBlueprint[];
}

export interface MissionBlueprint {
  id: string;
  version: number;
  title: string;
  minimumPlayers: number;
  maximumPlayers: number;
  roles: readonly RoleBlueprint[];
  stages: readonly StageBlueprint[];
}

export interface RoleAssignment {
  roleId: string;
  playerId: string;
  score: number;
  reasons: readonly string[];
}

export interface CompiledAction {
  id: string;
  requirementId: string;
  title: string;
  participantId: string;
  roleId: string;
  deviceId: string;
  selectedVariant: ActionVariant;
  manualFallback: ActionVariant;
  synchronizationGroup?: string;
  synchronizationWindowMs?: number;
}

export interface CompiledStage {
  id: string;
  title: string;
  briefing: string;
  timeoutMs: number;
  hint: string;
  actions: readonly CompiledAction[];
}

export interface CompiledMission {
  id: string;
  blueprintId: string;
  blueprintVersion: number;
  title: string;
  compiledAt: number;
  roleAssignments: readonly RoleAssignment[];
  stages: readonly CompiledStage[];
  capabilityWarnings: readonly string[];
}

export interface SensorEvidence {
  kind: EvidenceKind;
  confidence: number;
  participantId: string;
  deviceId: string;
  observedAt: number;
  value?: string | number | boolean;
  features?: Readonly<Record<string, number>>;
}

export type ActionStatus = 'pending' | 'completed';

export interface ActionProgress {
  actionId: string;
  status: ActionStatus;
  completedAt?: number;
  acceptedEvidence?: SensorEvidence;
  attempts: number;
  minimumConfidence: number;
  manualFallbackUnlocked: boolean;
}

export type MissionPhase = 'ready' | 'running' | 'paused' | 'completed' | 'failed';

export interface MissionState {
  mission: CompiledMission;
  phase: MissionPhase;
  stageIndex: number;
  stageStartedAt?: number;
  startedAt?: number;
  completedAt?: number;
  pausedAt?: number;
  pauseReason?: string;
  blockedDeviceIds: readonly string[];
  progress: Readonly<Record<string, ActionProgress>>;
  hintsRevealed: Readonly<Record<string, number>>;
  synchronizationWindows: Readonly<Record<string, number>>;
  acceptedEventIds: readonly string[];
  lastEventAt?: number;
}

interface BaseMissionEvent {
  id: string;
  at: number;
}

export type MissionEvent =
  | (BaseMissionEvent & { type: 'SESSION_STARTED' })
  | (BaseMissionEvent & { type: 'SENSOR_EVIDENCE'; actionId: string; evidence: SensorEvidence })
  | (BaseMissionEvent & { type: 'ACTION_FAILED'; actionId: string })
  | (BaseMissionEvent & { type: 'HINT_REQUESTED'; stageId: string })
  | (BaseMissionEvent & {
      type: 'ADAPTATION_APPLIED';
      actionId?: string;
      adaptation: 'RELAX_CONFIDENCE' | 'EXTEND_SYNC_WINDOW' | 'UNLOCK_MANUAL_FALLBACK';
      value?: number;
    })
  | (BaseMissionEvent & { type: 'DEVICE_DISCONNECTED'; deviceId: string })
  | (BaseMissionEvent & { type: 'DEVICE_RECONNECTED'; deviceId: string })
  | (BaseMissionEvent & { type: 'SESSION_PAUSED'; reason: string })
  | (BaseMissionEvent & { type: 'SESSION_RESUMED' })
  | (BaseMissionEvent & { type: 'CLOCK_TICK' });

export interface CompileMissionInput {
  missionId: string;
  compiledAt: number;
  players: readonly PlayerProfile[];
  devices: readonly DeviceProfile[];
  rooms: readonly RoomProfile[];
}

export interface MissionCompilationErrorDetails {
  code:
    | 'PLAYER_COUNT'
    | 'NO_ONLINE_DEVICES'
    | 'NO_MANUAL_FALLBACK'
    | 'NO_SAFE_CONFIGURATION'
    | 'INVALID_BLUEPRINT';
  context?: Readonly<Record<string, unknown>>;
}

export class MissionCompilationError extends Error {
  constructor(
    message: string,
    readonly details: MissionCompilationErrorDetails,
  ) {
    super(message);
    this.name = 'MissionCompilationError';
  }
}
