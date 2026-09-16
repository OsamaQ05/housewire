import { housewireSessionEventSchema } from '../session/protocol';
import { forgeLiveRuntimeFromSnapshot, type ForgeLiveRuntimeState } from './live-coordinator';

export function forgeLiveCheckpointKey(sessionId: string, caseId: string, nodeId: string): string {
  return `housewire-forge-live-v2:${sessionId}:${caseId}:${nodeId}`;
}

export function parseForgeLiveCheckpoint(serialized: string, caseId: string, localNodeId: string): ForgeLiveRuntimeState | undefined {
  try {
    const parsed = housewireSessionEventSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success || parsed.data.kind !== 'forge.snapshot' || parsed.data.caseId !== caseId ||
      !parsed.data.assignments.some((assignment) => assignment.nodeId === localNodeId)) return undefined;
    return forgeLiveRuntimeFromSnapshot(parsed.data);
  } catch { return undefined; }
}
