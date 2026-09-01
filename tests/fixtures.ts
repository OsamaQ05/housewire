import type { Capability, CompileMissionInput, DeviceProfile, PlayerProfile } from '../src/domain/types';

export function players(count: number): PlayerProfile[] {
  const styles = [
    ['pattern', 'timing'],
    ['movement', 'timing'],
    ['observation', 'pattern'],
    ['leadership', 'timing'],
  ] as const;
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    displayName: `Player ${index + 1}`,
    mobility: index === 1 ? 0.95 : 0.55,
    experience: index === 0 ? 0.85 : 0.5,
    preferredStyles: styles[index % styles.length],
    recentCriticalRoles: index === 0 ? 1 : 0,
  }));
}

export function devices(count: number, capabilities?: readonly Capability[]): DeviceProfile[] {
  const supported = capabilities ?? [
    'manual',
    'touch',
    'motion',
    'orientation',
    'microphoneLevel',
    'cameraQr',
    'haptics',
  ];
  return Array.from({ length: count }, (_, index) => ({
    id: `device-${index + 1}`,
    label: `Receiver ${index + 1}`,
    ownerPlayerId: `player-${index + 1}`,
    roomId: `room-${index + 1}`,
    capabilities: supported,
    online: true,
  }));
}

export function compileInput(count: number, capabilities?: readonly Capability[]): CompileMissionInput {
  return {
    missionId: 'line13-test',
    compiledAt: 1_000,
    players: players(count),
    devices: devices(count, capabilities),
    rooms: Array.from({ length: count }, (_, index) => ({
      id: `room-${index + 1}`,
      label: `Room ${index + 1}`,
      safeForMovement: true,
      noiseAllowed: true,
    })),
  };
}
