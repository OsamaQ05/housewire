import type { MissionBlueprint } from './types';

const manualFallback = (instruction: string) => ({
  id: 'manual-fallback',
  capability: 'manual' as const,
  evidenceKind: 'MANUAL_HOLD' as const,
  instruction,
  minimumConfidence: 1,
});

const receiptReleaseFallback = (instruction: string) => ({
  id: 'manual-receipt-release',
  capability: 'manual' as const,
  evidenceKind: 'RECEIPT_RELEASED' as const,
  instruction,
  minimumConfidence: 1,
});

export const LINE_13: MissionBlueprint = {
  id: 'line-13-call-ahead',
  version: 1,
  title: 'LINE 13 — The Call Ahead',
  minimumPlayers: 2,
  maximumPlayers: 4,
  roles: [
    {
      id: 'caller',
      title: 'The Caller',
      criticality: 0.85,
      movementDemand: 0.2,
      complexity: 0.7,
      styleWeights: { leadership: 0.8, timing: 0.8, observation: 0.3 },
    },
    {
      id: 'codebreaker',
      title: 'The Codebreaker',
      criticality: 0.9,
      movementDemand: 0.1,
      complexity: 0.95,
      styleWeights: { pattern: 1, observation: 0.8 },
    },
    {
      id: 'courier',
      title: 'The Courier',
      criticality: 0.9,
      movementDemand: 0.85,
      complexity: 0.45,
      styleWeights: { movement: 1, timing: 0.6 },
    },
    {
      id: 'switchboard',
      title: 'The Switchboard',
      criticality: 0.8,
      movementDemand: 0.25,
      complexity: 0.8,
      styleWeights: { pattern: 0.7, timing: 0.9, leadership: 0.4 },
    },
  ],
  stages: [
    {
      id: 'incoming-call',
      title: 'Answer the call ahead',
      briefing: 'A telephone is ringing from thirteen minutes in the future. Lift one live receiver before the line folds.',
      timeoutMs: 55_000,
      hint: 'The line answers a clean lift followed by a steady hold.',
      requirements: [
        {
          id: 'lift-receiver',
          title: 'Lift the live receiver',
          requiredActors: 1,
          scaleDownToAvailable: false,
          variants: [
            {
              id: 'motion-lift',
              capability: 'motion',
              evidenceKind: 'LIFTED',
              instruction: 'Lift your ringing phone like a receiver, then hold it beside your ear.',
              minimumConfidence: 0.72,
            },
            manualFallback('Drag the receiver out of its cradle and hold the contact.'),
          ],
        },
      ],
    },
    {
      id: 'split-cipher',
      title: 'Join the split cipher',
      briefing: 'The future caller divided one warning across private fragments. No screen contains enough information alone.',
      timeoutMs: 100_000,
      hint: 'Describe position and shape. Never read your fragment as one continuous string.',
      requirements: [
        {
          id: 'lock-full-warning',
          title: 'Lock the full warning',
          requiredActors: 1,
          scaleDownToAvailable: false,
          variants: [
            {
              id: 'touch-full-warning',
              capability: 'touch',
              evidenceKind: 'WARNING_RECONSTRUCTED',
              instruction: 'Rotate the shared warning dial until every private fragment resolves into one complete message.',
              minimumConfidence: 1,
            },
            manualFallback('Confirm the complete reconstructed warning with the accessible hold control.'),
          ],
        },
      ],
    },
    {
      id: 'courier-transfer',
      title: 'Carry the warning',
      briefing: 'The decoded warning must cross the house without breaking its physical carrier.',
      timeoutMs: 105_000,
      hint: 'The courier keeps the warning steady. The destination releases the receipt only after the physical handoff.',
      requirements: [
        {
          id: 'carry-warning',
          title: 'Carry the warning intact',
          requiredActors: 1,
          scaleDownToAvailable: false,
          variants: [
            {
              id: 'motion-courier',
              capability: 'motion',
              evidenceKind: 'CARRY_STEADY',
              instruction: 'Carry the receiver to the destination room in one steady movement.',
              minimumConfidence: 0.68,
            },
            manualFallback('Guide the courier pulse through the route without leaving the rail.'),
          ],
        },
        {
          id: 'release-destination-receipt',
          title: 'Release the destination receipt',
          requiredActors: 1,
          scaleDownToAvailable: false,
          variants: [
            {
              id: 'touch-destination-receipt',
              capability: 'touch',
              evidenceKind: 'RECEIPT_RELEASED',
              instruction: 'At the destination phone, hold and release the receipt seal after the courier arrives.',
              minimumConfidence: 1,
            },
            receiptReleaseFallback('At the destination phone, hold and release the accessible receipt seal.'),
          ],
        },
      ],
    },
    {
      id: 'route-reconstruction',
      title: 'Reconstruct the route',
      briefing: 'Each phone remembers a different section of the caller’s path. Rebuild it before the future changes.',
      timeoutMs: 115_000,
      hint: 'Match the cut edges first; the times are consequences, not ordering labels.',
      requirements: [
        {
          id: 'place-route-section',
          title: 'Place route sections',
          requiredActors: 1,
          scaleDownToAvailable: false,
          variants: [
            {
              id: 'touch-route',
              capability: 'touch',
              evidenceKind: 'ROUTE_RECONSTRUCTED',
              instruction: 'Place your private route section into the shared line without showing its reverse side.',
              minimumConfidence: 1,
            },
            manualFallback('Use the accessible route list to confirm your section.'),
          ],
        },
      ],
    },
    {
      id: 'synchronized-hangup',
      title: 'Hang up together',
      briefing: 'The warning only becomes real if every open receiver closes in the same moment.',
      timeoutMs: 80_000,
      hint: 'Choose one voice to count. Place every phone flat on zero and release it.',
      requirements: [
        {
          id: 'close-receiver',
          title: 'Close every receiver',
          requiredActors: 4,
          scaleDownToAvailable: true,
          synchronizationGroup: 'line-closure',
          synchronizationWindowMs: 1_600,
          variants: [
            {
              id: 'motion-hangup',
              capability: 'motion',
              evidenceKind: 'PLACED_FLAT',
              instruction: 'On the family countdown, place your phone flat and take both hands away.',
              minimumConfidence: 0.74,
            },
            manualFallback('Press and release the receiver contact on the family countdown.'),
          ],
        },
      ],
    },
  ],
};
