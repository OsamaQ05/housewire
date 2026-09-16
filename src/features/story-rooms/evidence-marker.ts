export function evidenceMarker(operationId: string, playerId: string): string {
  return JSON.stringify({ kind: 'housewire.story.station.v1', operationId, playerId });
}
export function matchesEvidenceMarker(raw: string, operationId: string, playerId: string): boolean {
  if (raw.length > 512) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed.kind === 'housewire.story.station.v1' && parsed.operationId === operationId && parsed.playerId === playerId;
  } catch { return false; }
}
