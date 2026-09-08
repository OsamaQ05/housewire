import { pendingActions } from './state-machine';
import type { MissionEvent, MissionState } from './types';
import { inferDifficulty, type CompletedRunSignal } from './adaptive-difficulty';

export interface ActionTelemetry {
  actionId: string;
  attempts: number;
  meanRejectedConfidence?: number;
  secondsSinceProgress: number;
  sensorAvailable: boolean;
}

export interface ParticipationTelemetry {
  participantId: string;
  acceptedActions: number;
  activeSeconds: number;
}

export interface DirectorContext {
  now: number;
  actions: readonly ActionTelemetry[];
  participation: readonly ParticipationTelemetry[];
}

export type DirectorDecision =
  | {
      kind: 'RELAX_CONFIDENCE';
      actionId: string;
      pressure: number;
      newMinimumConfidence: number;
      reason: string;
    }
  | {
      kind: 'UNLOCK_MANUAL_FALLBACK';
      actionId: string;
      pressure: number;
      reason: string;
    }
  | {
      kind: 'EXTEND_SYNC_WINDOW';
      actionId: string;
      pressure: number;
      newWindowMs: number;
      reason: string;
    }
  | {
      kind: 'OFFER_HINT';
      stageId: string;
      pressure: number;
      reason: string;
    }
  | {
      kind: 'REBALANCE_NEXT_ACTION';
      actionId: string;
      suggestedParticipantId: string;
      pressure: number;
      reason: string;
    };

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export interface StagePressureInput {
  attempts: number;
  secondsSinceProgress: number;
  sensorAvailable: boolean;
  meanRejectedConfidence?: number;
  expectedConfidence?: number;
  stageIndex?: number;
  history?: readonly CompletedRunSignal[];
}

export interface StagePressureAssessment {
  offerHint: boolean;
  preferManualFallback: boolean;
  pressure: number;
  reason: 'sensor' | 'retries' | 'stall' | 'watching';
  summary: string;
}

function difficultyPressure(telemetry: ActionTelemetry, expectedConfidence: number): number {
  const attempts = clamp01(telemetry.attempts / 4);
  const confidenceGap =
    telemetry.meanRejectedConfidence === undefined
      ? 0
      : clamp01((expectedConfidence - telemetry.meanRejectedConfidence) / 0.35);
  const stall = clamp01((telemetry.secondsSinceProgress - 10) / 45);
  const unavailable = telemetry.sensorAvailable ? 0 : 1;
  return clamp01(attempts * 0.28 + confidenceGap * 0.3 + stall * 0.22 + unavailable * 0.72);
}

/**
 * Small runtime inference used directly by the mobile mission UI. It turns
 * retries, stalls, near-miss confidence and sensor availability into a bounded
 * assistance decision without completing an action for the player.
 */
export function assessStagePressure(input: StagePressureInput): StagePressureAssessment {
  const inference = inferDifficulty(input);
  const pressure = inference.struggleProbability;
  const reason = !input.sensorAvailable
    ? 'sensor'
    : input.attempts >= 2
      ? 'retries'
      : input.secondsSinceProgress >= inference.hintAfterSeconds
        ? 'stall'
        : 'watching';
  const roundedSeconds = Math.max(0, Math.round(input.secondsSinceProgress));
  return {
    offerHint:
      input.secondsSinceProgress >= inference.hintAfterSeconds ||
      (input.attempts >= 2 && pressure >= 0.52),
    preferManualFallback: inference.preferManualFallback,
    pressure,
    reason,
    summary:
      reason === 'sensor'
        ? 'A needed phone sensor is unavailable, so the guide prepared an accessible route.'
        : reason === 'retries'
          ? `${input.attempts} attempts suggest the current clue needs a smaller step.`
          : reason === 'stall'
            ? `${roundedSeconds} seconds without progress suggests the crew may be stuck.`
            : 'The guide is quietly reading pace, retries, and device availability.',
  };
}

/**
 * A local, inspectable adaptive director. It scores evidence quality, retries,
 * stalls and participation, then makes bounded interventions. It never changes
 * story rules or declares success on the players' behalf.
 */
export class LocalMissionDirector {
  evaluate(state: MissionState, context: DirectorContext): readonly DirectorDecision[] {
    if (state.phase !== 'running') return [];
    const stage = state.mission.stages[state.stageIndex];
    if (!stage) return [];
    const decisions: DirectorDecision[] = [];
    const telemetryByAction = new Map(context.actions.map((item) => [item.actionId, item]));

    for (const action of pendingActions(state)) {
      const telemetry = telemetryByAction.get(action.id);
      const progress = state.progress[action.id];
      if (!telemetry || !progress) continue;
      const pressure = difficultyPressure(telemetry, progress.minimumConfidence);

      if (!telemetry.sensorAvailable && !progress.manualFallbackUnlocked) {
        decisions.push({
          kind: 'UNLOCK_MANUAL_FALLBACK',
          actionId: action.id,
          pressure,
          reason: 'The assigned sensor is unavailable, so play must remain completable.',
        });
        continue;
      }
      if (pressure >= 0.76 && telemetry.attempts >= 3 && !progress.manualFallbackUnlocked) {
        decisions.push({
          kind: 'UNLOCK_MANUAL_FALLBACK',
          actionId: action.id,
          pressure,
          reason: 'Repeated calibrated attempts indicate a hardware or accessibility mismatch.',
        });
      } else if (pressure >= 0.38 && telemetry.attempts >= 2 && telemetry.meanRejectedConfidence !== undefined) {
        decisions.push({
          kind: 'RELAX_CONFIDENCE',
          actionId: action.id,
          pressure,
          newMinimumConfidence: Math.max(0.48, progress.minimumConfidence - 0.12),
          reason: 'Evidence is consistently close to the calibrated threshold.',
        });
      }

      if (action.synchronizationGroup && pressure >= 0.55) {
        const currentWindow =
          state.synchronizationWindows[action.synchronizationGroup] ?? action.synchronizationWindowMs ?? 1_200;
        decisions.push({
          kind: 'EXTEND_SYNC_WINDOW',
          actionId: action.id,
          pressure,
          newWindowMs: Math.min(3_000, Math.round(currentWindow * 1.35)),
          reason: 'The crew is coordinating correctly but network and motor timing are too tight.',
        });
      }
    }

    const maximumStall = Math.max(0, ...context.actions.map((item) => item.secondsSinceProgress));
    if (maximumStall >= 42 && (state.hintsRevealed[stage.id] ?? 0) === 0) {
      decisions.push({
        kind: 'OFFER_HINT',
        stageId: stage.id,
        pressure: clamp01(maximumStall / 75),
        reason: 'The mission has stopped progressing without a hardware failure.',
      });
    }

    const totalAccepted = context.participation.reduce((sum, item) => sum + item.acceptedActions, 0);
    if (context.participation.length > 1 && totalAccepted >= 3) {
      const dominant = [...context.participation].sort((a, b) => b.acceptedActions - a.acceptedActions)[0];
      const leastActive = [...context.participation].sort(
        (a, b) => a.acceptedActions - b.acceptedActions || a.activeSeconds - b.activeSeconds,
      )[0];
      const nextDominantAction = pendingActions(state).find((action) => action.participantId === dominant?.participantId);
      if (
        dominant &&
        leastActive &&
        nextDominantAction &&
        dominant.participantId !== leastActive.participantId &&
        dominant.acceptedActions / totalAccepted > 0.66
      ) {
        decisions.push({
          kind: 'REBALANCE_NEXT_ACTION',
          actionId: nextDominantAction.id,
          suggestedParticipantId: leastActive.participantId,
          pressure: clamp01(dominant.acceptedActions / totalAccepted),
          reason: 'One player is performing most critical actions while another has had little agency.',
        });
      }
    }

    return deduplicateDecisions(decisions);
  }
}

function deduplicateDecisions(decisions: readonly DirectorDecision[]): readonly DirectorDecision[] {
  const seen = new Set<string>();
  return decisions.filter((decision) => {
    const key = `${decision.kind}:${'actionId' in decision ? decision.actionId : decision.stageId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function directorDecisionToEvent(decision: DirectorDecision, id: string, at: number): MissionEvent | undefined {
  switch (decision.kind) {
    case 'RELAX_CONFIDENCE':
      return {
        type: 'ADAPTATION_APPLIED',
        id,
        at,
        actionId: decision.actionId,
        adaptation: 'RELAX_CONFIDENCE',
        value: decision.newMinimumConfidence,
      };
    case 'UNLOCK_MANUAL_FALLBACK':
      return {
        type: 'ADAPTATION_APPLIED',
        id,
        at,
        actionId: decision.actionId,
        adaptation: 'UNLOCK_MANUAL_FALLBACK',
      };
    case 'EXTEND_SYNC_WINDOW':
      return {
        type: 'ADAPTATION_APPLIED',
        id,
        at,
        actionId: decision.actionId,
        adaptation: 'EXTEND_SYNC_WINDOW',
        value: decision.newWindowMs,
      };
    case 'OFFER_HINT':
      return { type: 'HINT_REQUESTED', id, at, stageId: decision.stageId };
    case 'REBALANCE_NEXT_ACTION':
      return undefined;
  }
}
