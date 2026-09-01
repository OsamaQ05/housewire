import type { Capability } from '../../domain/types';
import type { RawSensorEvent, SensorAvailability, SensorProvider, SensorStream } from './types';

export class SimulatedSensorProvider implements SensorProvider {
  private readonly listeners = new Set<(event: RawSensorEvent) => void>();
  private activeStreams = new Set<SensorStream>();

  constructor(
    private readonly capabilities: readonly Capability[] = [
      'manual',
      'touch',
      'motion',
      'orientation',
      'microphoneLevel',
      'cameraQr',
    ],
  ) {}

  async probe(): Promise<SensorAvailability> {
    return { capabilities: this.capabilities, unavailableReasons: {} };
  }

  async start(streams: readonly SensorStream[]): Promise<void> {
    this.activeStreams = new Set(streams);
  }

  async stop(): Promise<void> {
    this.activeStreams.clear();
  }

  subscribe(listener: (event: RawSensorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RawSensorEvent): boolean {
    if (!this.activeStreams.has(event.stream)) return false;
    for (const listener of this.listeners) listener(event);
    return true;
  }

  play(events: readonly RawSensorEvent[]): number {
    let delivered = 0;
    for (const event of events) if (this.emit(event)) delivered += 1;
    return delivered;
  }
}
