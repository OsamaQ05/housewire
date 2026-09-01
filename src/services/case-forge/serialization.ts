import {
  assertPlayableForgeCase,
  forgeCaseSummary,
  type ForgeCase,
} from '../../domain/case-forge';

const BACKUP_FORMAT = 'housewire-forge-backup';
const PREVIEW_FORMAT = 'housewire-forge-preview';
const MAX_IMPORT_BYTES = 512 * 1_024;

export function forgeUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalForgeJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function fnv1a32(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function assertJsonSafety(value: unknown): void {
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 30_000 || depth > 32) throw new Error('Case package is too deeply nested.');
    if (Array.isArray(candidate)) {
      if (candidate.length > 1_000) throw new Error('Case package contains an oversized array.');
      candidate.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor' || key.length > 80) {
        throw new Error('Case package contains a forbidden field.');
      }
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
}

export function parseSafeForgeJson(serialized: string, maximumBytes = MAX_IMPORT_BYTES): unknown {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > 4 * 1_024 * 1_024) {
    throw new Error('Invalid Case Forge JSON limit.');
  }
  if (forgeUtf8ByteLength(serialized) > maximumBytes) {
    throw new Error(`Case package exceeds the ${Math.floor(maximumBytes / 1_024)} KiB import limit.`);
  }
  const parsed: unknown = JSON.parse(serialized);
  assertJsonSafety(parsed);
  return parsed;
}

export function exportForgeCaseBackup(game: ForgeCase, exportedAt = Date.now()): string {
  const validCase = assertPlayableForgeCase(game);
  if (!Number.isSafeInteger(exportedAt) || exportedAt <= 0) throw new Error('Invalid export timestamp.');
  const payload = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt,
    warning: 'PRIVATE HOST BACKUP — contains puzzle answers and private clue routing.',
    case: validCase,
  } as const;
  return JSON.stringify({ ...payload, checksum: `fnv1a32:${fnv1a32(canonicalForgeJson(payload))}` });
}

export function importForgeCaseBackup(serialized: string): ForgeCase {
  const parsed = parseSafeForgeJson(serialized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid Case Forge backup.');
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== BACKUP_FORMAT || envelope.version !== 1 || typeof envelope.checksum !== 'string') {
    throw new Error('Unsupported Case Forge backup format.');
  }
  const { checksum, ...payload } = envelope;
  const expected = `fnv1a32:${fnv1a32(canonicalForgeJson(payload))}`;
  if (checksum !== expected) throw new Error('Case backup integrity check failed.');
  return assertPlayableForgeCase(envelope.case);
}

export function exportForgeCasePreview(game: ForgeCase, exportedAt = Date.now()): string {
  const validCase = assertPlayableForgeCase(game);
  return JSON.stringify({
    format: PREVIEW_FORMAT,
    version: 1,
    exportedAt,
    case: {
      ...forgeCaseSummary(validCase),
      premise: validCase.premise,
      objective: validCase.objective,
      safetyNotice: validCase.safetyNotice,
      stageTitles: validCase.stages.map((stage) => stage.title),
    },
  });
}
