/** Scroll animations are presentation, not a new choice of game. */
export interface CaseRailSelection { index: number; source: 'explicit' | 'gesture' }

function boundedIndex(index: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.round(Number.isFinite(index) ? index : 0)));
}

export function selectRailCase(index: number, count: number): CaseRailSelection {
  return { index: boundedIndex(index, count), source: 'explicit' };
}

export function beginRailGesture(selection: CaseRailSelection): CaseRailSelection {
  return { ...selection, source: 'gesture' };
}

/** Only a new real drag/wheel gesture may replace an explicitly selected card. */
export function observeRailScroll(selection: CaseRailSelection, offset: number, stride: number, count: number): CaseRailSelection {
  if (selection.source !== 'gesture' || !Number.isFinite(offset) || !Number.isFinite(stride) || stride <= 0 || count < 1) return selection;
  const index = boundedIndex(offset / stride, count);
  return index === selection.index ? selection : { index, source: 'gesture' };
}
