import type { ClockEstimate } from './types';

export interface ClockObservation {
  clientSentAt: number;
  serverAt: number;
  clientReceivedAt: number;
}

export function estimateClock(observation: ClockObservation): ClockEstimate {
  const roundTripMs = Math.max(0, observation.clientReceivedAt - observation.clientSentAt);
  const clientMidpoint = observation.clientSentAt + roundTripMs / 2;
  return {
    offsetMs: observation.serverAt - clientMidpoint,
    roundTripMs,
    measuredAt: observation.clientReceivedAt,
  };
}

/** Chooses the lowest-latency observation, the least biased estimate in this model. */
export function bestClockEstimate(estimates: readonly ClockEstimate[]): ClockEstimate | undefined {
  return [...estimates].sort((a, b) => a.roundTripMs - b.roundTripMs)[0];
}

export function hostTime(localTime: number, estimate?: ClockEstimate): number {
  return localTime + (estimate?.offsetMs ?? 0);
}
