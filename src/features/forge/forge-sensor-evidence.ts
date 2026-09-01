import type { AcousticBand } from '@/src/domain/acoustic-envelope';
import type { ForgePose, MotionSyncAssignment } from '@/src/domain/case-forge/types';

export const FORGE_POSE_HOLD_MS = 1_200;
export const FORGE_MIC_CALIBRATION_MS = 700;

export interface ForgeMotionTelemetry {
  flatness: number;
  steadiness: number;
  tiltX: number;
}

export interface ForgePoseReading {
  matched: boolean;
  sensorVerifiable: boolean;
}

/**
 * Matches only coarse device posture. The runner never stores raw motion data.
 * FACE_DOWN is deliberately manual-only because the exposed, normalized
 * telemetry cannot prove which side of a flat phone is facing the surface.
 */
export function evaluateForgePose(
  pose: ForgePose,
  telemetry: ForgeMotionTelemetry,
): ForgePoseReading {
  const steady = telemetry.steadiness >= 0.68;
  switch (pose) {
    case 'PLACE_FLAT':
      return { matched: steady && telemetry.flatness >= 0.86, sensorVerifiable: true };
    case 'HOLD_UPRIGHT':
      return { matched: steady && telemetry.flatness <= 0.42, sensorVerifiable: true };
    case 'TILT_LEFT':
      return { matched: steady && telemetry.tiltX <= -0.34, sensorVerifiable: true };
    case 'TILT_RIGHT':
      return { matched: steady && telemetry.tiltX >= 0.34, sensorVerifiable: true };
    case 'HOLD_STILL':
      return { matched: telemetry.steadiness >= 0.84, sensorVerifiable: true };
    case 'FACE_DOWN':
      return { matched: false, sensorVerifiable: false };
  }
}

export function forgeVocalCueMatches(
  vocalCue: MotionSyncAssignment['vocalCue'],
  band: AcousticBand,
): boolean {
  if (vocalCue === 'NONE') return true;
  return band === 'SOFT' || band === 'STRONG';
}

export function forgeVocalHoldMs(vocalCue: MotionSyncAssignment['vocalCue']): number {
  switch (vocalCue) {
    case 'LOW_HUM':
      return 850;
    case 'SHORT_TONE':
      return 80;
    case 'NONE':
      return 0;
  }
}
