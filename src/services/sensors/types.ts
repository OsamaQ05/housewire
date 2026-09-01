import type { Capability, EvidenceKind } from '../../domain/types';

export interface MotionSample {
  timestampMs: number;
  /** Acceleration including gravity, in m/s². */
  x: number;
  y: number;
  z: number;
  /** Device rotation in radians when available. */
  alpha?: number;
  beta?: number;
  gamma?: number;
  /** Rotation rate in degrees per second when available. */
  rotationRateAlpha?: number;
  rotationRateBeta?: number;
  rotationRateGamma?: number;
}

export interface AudioLevelSample {
  timestampMs: number;
  /** Recorder metering value in dBFS; values nearer zero are louder. */
  decibels: number;
}

export interface LightSample {
  timestampMs: number;
  illuminance: number;
}

export type RawSensorEvent =
  | { stream: 'motion'; sample: MotionSample }
  | { stream: 'audioLevel'; sample: AudioLevelSample }
  | { stream: 'light'; sample: LightSample };

export type SensorStream = RawSensorEvent['stream'];

export interface Classification {
  kind: EvidenceKind;
  confidence: number;
  startedAt: number;
  observedAt: number;
  features: Readonly<Record<string, number>>;
}

export interface SensorAvailability {
  capabilities: readonly Capability[];
  unavailableReasons: Readonly<Partial<Record<Capability, string>>>;
}

export interface SensorProvider {
  probe(): Promise<SensorAvailability>;
  start(streams: readonly SensorStream[]): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: RawSensorEvent) => void): () => void;
}

export interface SensorProviderOptions {
  updateIntervalMs?: number;
  declareAudioMeter?: boolean;
  declareCameraQr?: boolean;
  declareHaptics?: boolean;
}
