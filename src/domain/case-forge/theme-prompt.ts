/** Keep a pasted description usable without changing its printable language or meaning. */
export function normalizeForgeThemePrompt(value?: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error('Custom theme must contain only printable text and normal whitespace.');
  }
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length > 180) throw new Error('Custom theme must be 180 characters or fewer.');
  return normalized;
}
