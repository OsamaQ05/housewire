import type { MissionBlueprint } from './types';

const manualHold = (instruction: string) => ({
  id: 'manual-hold',
  capability: 'manual' as const,
  evidenceKind: 'MANUAL_HOLD' as const,
  instruction,
  minimumConfidence: 1,
});

export const BLACKOUT_PROTOCOL: MissionBlueprint = {
  id: 'blackout-protocol',
  version: 1,
  title: 'Blackout Protocol',
  minimumPlayers: 2,
  maximumPlayers: 6,
  roles: [
    {
      id: 'operator',
      title: 'Signal Operator',
      criticality: 1,
      movementDemand: 0.15,
      complexity: 0.85,
      styleWeights: { pattern: 1, timing: 0.7, leadership: 0.4 },
    },
    {
      id: 'courier',
      title: 'Relay Courier',
      criticality: 0.9,
      movementDemand: 0.9,
      complexity: 0.45,
      styleWeights: { movement: 1, timing: 0.5 },
    },
    {
      id: 'analyst',
      title: 'Cipher Analyst',
      criticality: 0.8,
      movementDemand: 0.1,
      complexity: 0.9,
      styleWeights: { pattern: 1, observation: 0.9 },
    },
    {
      id: 'anchor',
      title: 'Grid Anchor',
      criticality: 0.65,
      movementDemand: 0.25,
      complexity: 0.35,
      styleWeights: { timing: 1, observation: 0.4 },
    },
    {
      id: 'lookout',
      title: 'Field Lookout',
      criticality: 0.55,
      movementDemand: 0.55,
      complexity: 0.5,
      styleWeights: { observation: 1, movement: 0.4 },
    },
    {
      id: 'controller',
      title: 'System Controller',
      criticality: 0.7,
      movementDemand: 0.2,
      complexity: 0.7,
      styleWeights: { leadership: 0.8, timing: 0.8, pattern: 0.4 },
    },
  ],
  stages: [
    {
      id: 'carrier-lock',
      title: 'Wake the carrier',
      briefing: 'The dead network still has one directional carrier. Put it on the bearing before it disappears.',
      timeoutMs: 75_000,
      hint: 'Move slowly. The carrier locks onto a deliberate quarter-turn, not a shake.',
      requirements: [
        {
          id: 'align-carrier',
          title: 'Align the carrier',
          requiredActors: 1,
          scaleDownToAvailable: false,
          eligibleRoleIds: ['operator', 'controller'],
          variants: [
            {
              id: 'orientation-lock',
              capability: 'orientation',
              evidenceKind: 'ROTATED_TO_TARGET',
              instruction: 'Rotate the carrier through a deliberate quarter-turn, then hold it steady.',
              minimumConfidence: 0.72,
            },
            manualHold('Trace the bearing ring and hold the contact for two seconds.'),
          ],
        },
      ],
    },
    {
      id: 'silent-corridor',
      title: 'Cross the silent corridor',
      briefing: 'One node listens for noise while the courier moves the recovered signal to the next room.',
      timeoutMs: 95_000,
      hint: 'The listener must protect the quiet field while the courier moves steadily—not quickly.',
      requirements: [
        {
          id: 'hold-silence',
          title: 'Hold the quiet field',
          requiredActors: 1,
          scaleDownToAvailable: false,
          eligibleRoleIds: ['analyst', 'operator', 'anchor'],
          variants: [
            {
              id: 'audio-envelope',
              capability: 'microphoneLevel',
              evidenceKind: 'QUIET_WINDOW',
              instruction: 'Keep this room below the noise line until the field stabilizes.',
              minimumConfidence: 0.7,
            },
            manualHold('Hold the quiet-field contact while the courier crosses.'),
          ],
        },
        {
          id: 'carry-relay',
          title: 'Carry the relay',
          requiredActors: 1,
          scaleDownToAvailable: false,
          eligibleRoleIds: ['courier', 'lookout'],
          variants: [
            {
              id: 'motion-envelope',
              capability: 'motion',
              evidenceKind: 'CARRY_STEADY',
              instruction: 'Carry the relay to the marked room without jolting it.',
              minimumConfidence: 0.68,
            },
            manualHold('Slide the transfer rail from SOURCE to RELAY at a steady pace.'),
          ],
        },
      ],
    },
    {
      id: 'fragment-recovery',
      title: 'Recover the split key',
      briefing: 'The restart key was split between two physical markers. Neither fragment works alone.',
      timeoutMs: 100_000,
      hint: 'The fragments are identical in shape but carry different identifiers. Find both.',
      requirements: [
        {
          id: 'scan-fragment',
          title: 'Recover key fragments',
          requiredActors: 2,
          scaleDownToAvailable: true,
          eligibleRoleIds: ['analyst', 'lookout', 'controller', 'operator'],
          variants: [
            {
              id: 'camera-fragment',
              capability: 'cameraQr',
              evidenceKind: 'QR_SCANNED',
              instruction: 'Find and scan your assigned copper fragment.',
              minimumConfidence: 0.98,
            },
            manualHold('Enter the four-symbol fragment printed beside the marker.'),
          ],
        },
      ],
    },
    {
      id: 'grid-lock',
      title: 'Lock the grid',
      briefing: 'Every live node must become motionless inside the same narrow synchronization window.',
      timeoutMs: 110_000,
      hint: 'Count down aloud, then place and release every node together.',
      requirements: [
        {
          id: 'synchronize-node',
          title: 'Synchronize live nodes',
          requiredActors: 3,
          scaleDownToAvailable: true,
          synchronizationGroup: 'grid-lock',
          synchronizationWindowMs: 1_400,
          variants: [
            {
              id: 'motion-stillness',
              capability: 'motion',
              evidenceKind: 'STILL_HOLD',
              instruction: 'Place the node flat and keep it perfectly still until it locks.',
              minimumConfidence: 0.74,
            },
            manualHold('Press and hold the node contact on the shared countdown.'),
          ],
        },
      ],
    },
  ],
};
