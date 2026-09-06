import { DeviceMotion, LightSensor } from 'expo-sensors';
import type { Capability } from '../../domain/types';
import type {
  AudioLevelSample,
  RawSensorEvent,
  SensorAvailability,
  SensorProvider,
  SensorProviderOptions,
  SensorStream,
} from './types';

type EventSubscription = { remove(): void };

/**
 * Expo-compatible raw stream provider. Microphone metering is pushed in from
 * the UI-owned expo-audio recorder hook through `pushAudioLevel` so this class
 * never violates React hook lifetime rules.
 */
export class ExpoSensorProvider implements SensorProvider {
  private readonly listeners = new Set<(event: RawSensorEvent) => void>();
  private subscriptions: EventSubscription[] = [];
  private readonly updateIntervalMs: number;

  constructor(private readonly options: SensorProviderOptions = {}) {
    this.updateIntervalMs = Math.max(25, options.updateIntervalMs ?? 50);
  }

  async probe(): Promise<SensorAvailability> {
    const capabilities: Capability[] = ['manual', 'touch'];
    const unavailableReasons: Partial<Record<Capability, string>> = {};

    try {
      if (await DeviceMotion.isAvailableAsync()) {
        capabilities.push('motion', 'orientation');
      } else {
        unavailableReasons.motion = 'Device motion is not available on this phone.';
        unavailableReasons.orientation = 'Device orientation is not available on this phone.';
      }
    } catch {
      unavailableReasons.motion = 'Device motion availability could not be determined.';
      unavailableReasons.orientation = 'Device orientation availability could not be determined.';
    }

    try {
      if (await LightSensor.isAvailableAsync()) capabilities.push('ambientLight');
      else unavailableReasons.ambientLight = 'Ambient light sensing is Android-only and device-dependent.';
    } catch {
      unavailableReasons.ambientLight = 'Ambient light sensing is unavailable on this platform.';
    }

    if (this.options.declareAudioMeter) capabilities.push('microphoneLevel');
    else unavailableReasons.microphoneLevel = 'No expo-audio metering feed has been attached.';
    if (this.options.declareCameraQr) capabilities.push('cameraQr');
    if (this.options.declareHaptics) capabilities.push('haptics');

    return { capabilities: [...new Set(capabilities)], unavailableReasons };
  }

  async start(streams: readonly SensorStream[]): Promise<void> {
    await this.stop();
    if (streams.includes('motion')) {
      const permission = await DeviceMotion.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Motion permission was not granted.');
      if (!(await DeviceMotion.isAvailableAsync())) throw new Error('Device motion is unavailable.');
      DeviceMotion.setUpdateInterval(this.updateIntervalMs);
      this.subscriptions.push(
        DeviceMotion.addListener((measurement) => {
          const gravity = measurement.accelerationIncludingGravity;
          this.emit({
            stream: 'motion',
            sample: {
              timestampMs: gravity.timestamp * 1_000,
              x: gravity.x,
              y: gravity.y,
              z: gravity.z,
              alpha: measurement.rotation.alpha,
              beta: measurement.rotation.beta,
              gamma: measurement.rotation.gamma,
              rotationRateAlpha: measurement.rotationRate?.alpha,
              rotationRateBeta: measurement.rotationRate?.beta,
              rotationRateGamma: measurement.rotationRate?.gamma,
            },
          });
        }),
      );
    }

    if (streams.includes('light')) {
      if (!(await LightSensor.isAvailableAsync())) throw new Error('Ambient light sensor is unavailable.');
      LightSensor.setUpdateInterval(Math.max(100, this.updateIntervalMs));
      this.subscriptions.push(
        LightSensor.addListener((measurement) => {
          this.emit({
            stream: 'light',
            sample: {
              timestampMs: measurement.timestamp * 1_000,
              illuminance: measurement.illuminance,
            },
          });
        }),
      );
    }
  }

  pushAudioLevel(sample: AudioLevelSample): void {
    if (!this.options.declareAudioMeter || !Number.isFinite(sample.decibels)) return;
    this.emit({ stream: 'audioLevel', sample });
  }

  async stop(): Promise<void> {
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
  }

  subscribe(listener: (event: RawSensorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RawSensorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
