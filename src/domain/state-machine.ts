import type {
  ActionProgress,
  CompiledAction,
  CompiledMission,
  CompiledStage,
  MissionEvent,
  MissionState,
  SensorEvidence,
} from './types';

const EVENT_HISTORY_LIMIT = 2_048;

function stageAt(state: MissionState): CompiledStage | undefined {
  return state.mission.stages[state.stageIndex];
}

function actionAt(state: MissionState, actionId: string): CompiledAction | undefined {
  return stageAt(state)?.actions.find((action) => action.id === actionId);
}

function freshProgress(stage: CompiledStage): Readonly<Record<string, ActionProgress>> {
  return Object.fromEntries(
    stage.actions.map((action) => [
      action.id,
      {
        actionId: action.id,
        status: 'pending',
        attempts: 0,
        minimumConfidence: action.selectedVariant.minimumConfidence,
        manualFallbackUnlocked: action.selectedVariant.capability === 'manual',
      } satisfies ActionProgress,
    ]),
  );
}

export function createInitialMissionState(mission: CompiledMission): MissionState {
  const firstStage = mission.stages[0];
  if (!firstStage) throw new Error('Compiled mission has no stages.');
  return {
    mission,
    phase: 'ready',
    stageIndex: 0,
    blockedDeviceIds: [],
    progress: freshProgress(firstStage),
    hintsRevealed: {},
    synchronizationWindows: {},
    acceptedEventIds: [],
  };
}

function rememberEvent(state: MissionState, event: MissionEvent): MissionState {
  const acceptedEventIds = [...state.acceptedEventIds, event.id].slice(-EVENT_HISTORY_LIMIT);
  return { ...state, acceptedEventIds, lastEventAt: event.at };
}

function evidenceMatches(action: CompiledAction, progress: ActionProgress, evidence: SensorEvidence): boolean {
  if (evidence.deviceId !== action.deviceId || evidence.participantId !== action.participantId) return false;
  const selected = action.selectedVariant;
  const isSelectedEvidence = evidence.kind === selected.evidenceKind;
  const isManualEvidence = evidence.kind === action.manualFallback.evidenceKind && progress.manualFallbackUnlocked;
  if (!isSelectedEvidence && !isManualEvidence) return false;
  if (!isManualEvidence && evidence.confidence < progress.minimumConfidence) return false;
  if (isManualEvidence && evidence.confidence < action.manualFallback.minimumConfidence) return false;
  if (isSelectedEvidence && selected.expectedValue !== undefined && evidence.value !== selected.expectedValue) return false;
  return true;
}

function resetExpiredSynchronizedActions(
  stage: CompiledStage,
  progress: Readonly<Record<string, ActionProgress>>,
  group: string,
  newestCompletionAt: number,
  windowMs: number,
): Readonly<Record<string, ActionProgress>> {
  const next = { ...progress };
  for (const action of stage.actions) {
    if (action.synchronizationGroup !== group) continue;
    const actionProgress = next[action.id];
    if (
      actionProgress?.completedAt !== undefined &&
      newestCompletionAt - actionProgress.completedAt > windowMs
    ) {
      next[action.id] = {
        ...actionProgress,
        status: 'pending',
        completedAt: undefined,
        acceptedEvidence: undefined,
      };
    }
  }
  return next;
}

function synchronizationSatisfied(
  stage: CompiledStage,
  progress: Readonly<Record<string, ActionProgress>>,
): boolean {
  const groups = new Set(stage.actions.flatMap((action) => (action.synchronizationGroup ? [action.synchronizationGroup] : [])));
  for (const group of groups) {
    const actions = stage.actions.filter((action) => action.synchronizationGroup === group);
    const times = actions.map((action) => progress[action.id]?.completedAt);
    if (times.some((time) => time === undefined)) return false;
    const numericTimes = times as number[];
    const windowMs = actions[0]?.synchronizationWindowMs ?? 0;
    if (Math.max(...numericTimes) - Math.min(...numericTimes) > windowMs) return false;
  }
  return true;
}

function maybeAdvanceStage(state: MissionState, at: number): MissionState {
  const stage = stageAt(state);
  if (!stage) return state;
  const allComplete = stage.actions.every((action) => state.progress[action.id]?.status === 'completed');
  if (!allComplete || !synchronizationSatisfied(stage, state.progress)) return state;

  const nextIndex = state.stageIndex + 1;
  const nextStage = state.mission.stages[nextIndex];
  if (!nextStage) {
    return { ...state, phase: 'completed', completedAt: at };
  }
  return {
    ...state,
    stageIndex: nextIndex,
    stageStartedAt: at,
    progress: freshProgress(nextStage),
  };
}

function recordEvidence(state: MissionState, event: Extract<MissionEvent, { type: 'SENSOR_EVIDENCE' }>): MissionState {
  if (state.phase !== 'running') return state;
  const stage = stageAt(state);
  const action = actionAt(state, event.actionId);
  const current = state.progress[event.actionId];
  if (!stage || !action || !current || current.status === 'completed') return state;
  if (!evidenceMatches(action, current, event.evidence)) return state;

  let progress: Readonly<Record<string, ActionProgress>> = {
    ...state.progress,
    [event.actionId]: {
      ...current,
      status: 'completed',
      completedAt: event.evidence.observedAt,
      acceptedEvidence: event.evidence,
    },
  };
  if (action.synchronizationGroup && action.synchronizationWindowMs !== undefined) {
    progress = resetExpiredSynchronizedActions(
      stage,
      progress,
      action.synchronizationGroup,
      event.evidence.observedAt,
      state.synchronizationWindows[action.synchronizationGroup] ?? action.synchronizationWindowMs,
    );
  }
  return maybeAdvanceStage({ ...state, progress }, event.at);
}

function tick(state: MissionState, at: number): MissionState {
  const stage = stageAt(state);
  if (state.phase !== 'running' || !stage || state.stageStartedAt === undefined) return state;
  if (at - state.stageStartedAt <= stage.timeoutMs) return state;
  return {
    ...state,
    phase: 'paused',
    pausedAt: at,
    pauseReason: 'Stage timer expired. The crew can retry without losing campaign progress.',
  };
}

/** Pure, idempotent reducer. Replaying the same accepted events yields the same state. */
export function reduceMission(state: MissionState, event: MissionEvent): MissionState {
  if (state.acceptedEventIds.includes(event.id)) return state;
  let next = state;

  switch (event.type) {
    case 'SESSION_STARTED':
      if (state.phase === 'ready') {
        next = { ...state, phase: 'running', startedAt: event.at, stageStartedAt: event.at };
      }
      break;
    case 'SENSOR_EVIDENCE':
      next = recordEvidence(state, event);
      break;
    case 'ACTION_FAILED': {
      const progress = state.progress[event.actionId];
      if (state.phase === 'running' && progress?.status === 'pending') {
        next = {
          ...state,
          progress: {
            ...state.progress,
            [event.actionId]: { ...progress, attempts: progress.attempts + 1 },
          },
        };
      }
      break;
    }
    case 'HINT_REQUESTED':
      if (stageAt(state)?.id === event.stageId) {
        next = {
          ...state,
          hintsRevealed: {
            ...state.hintsRevealed,
            [event.stageId]: (state.hintsRevealed[event.stageId] ?? 0) + 1,
          },
        };
      }
      break;
    case 'ADAPTATION_APPLIED': {
      if (event.adaptation === 'EXTEND_SYNC_WINDOW' && event.value !== undefined) {
        const action = event.actionId ? actionAt(state, event.actionId) : undefined;
        if (action?.synchronizationGroup) {
          next = {
            ...state,
            synchronizationWindows: {
              ...state.synchronizationWindows,
              [action.synchronizationGroup]: event.value,
            },
          };
        }
      } else if (event.actionId) {
        const progress = state.progress[event.actionId];
        if (progress) {
          next = {
            ...state,
            progress: {
              ...state.progress,
              [event.actionId]: {
                ...progress,
                minimumConfidence:
                  event.adaptation === 'RELAX_CONFIDENCE' && event.value !== undefined
                    ? Math.max(0.4, Math.min(progress.minimumConfidence, event.value))
                    : progress.minimumConfidence,
                manualFallbackUnlocked:
                  event.adaptation === 'UNLOCK_MANUAL_FALLBACK' ? true : progress.manualFallbackUnlocked,
              },
            },
          };
        }
      }
      break;
    }
    case 'DEVICE_DISCONNECTED': {
      if (!state.blockedDeviceIds.includes(event.deviceId)) {
        const blockedDeviceIds = [...state.blockedDeviceIds, event.deviceId];
        const blocksPendingAction = stageAt(state)?.actions.some(
          (action) => action.deviceId === event.deviceId && state.progress[action.id]?.status === 'pending',
        );
        next = {
          ...state,
          blockedDeviceIds,
          phase: blocksPendingAction && state.phase === 'running' ? 'paused' : state.phase,
          pausedAt: blocksPendingAction ? event.at : state.pausedAt,
          pauseReason: blocksPendingAction ? 'A required node disconnected.' : state.pauseReason,
        };
      }
      break;
    }
    case 'DEVICE_RECONNECTED':
      next = { ...state, blockedDeviceIds: state.blockedDeviceIds.filter((id) => id !== event.deviceId) };
      break;
    case 'SESSION_PAUSED':
      if (state.phase === 'running') {
        next = { ...state, phase: 'paused', pausedAt: event.at, pauseReason: event.reason };
      }
      break;
    case 'SESSION_RESUMED':
      if (state.phase === 'paused' && state.blockedDeviceIds.length === 0) {
        const pausedDuration = state.pausedAt === undefined || state.stageStartedAt === undefined ? 0 : event.at - state.pausedAt;
        next = {
          ...state,
          phase: 'running',
          pausedAt: undefined,
          pauseReason: undefined,
          stageStartedAt: state.stageStartedAt === undefined ? event.at : state.stageStartedAt + pausedDuration,
        };
      }
      break;
    case 'CLOCK_TICK':
      next = tick(state, event.at);
      break;
  }

  return rememberEvent(next, event);
}

export function replayMission(mission: CompiledMission, events: readonly MissionEvent[]): MissionState {
  return events.reduce(reduceMission, createInitialMissionState(mission));
}

export function pendingActions(state: MissionState): readonly CompiledAction[] {
  return (stageAt(state)?.actions ?? []).filter((action) => state.progress[action.id]?.status === 'pending');
}
