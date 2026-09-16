import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beginRailGesture, observeRailScroll, selectRailCase } from '../src/features/story-rooms/case-rail-selection';

describe('home case rail: explicit choice wins over stale animation', () => {
  it('keeps Barjeel selected while a previous Long Table scroll settles at 320px', () => {
    const stride = 320 - 42 + 12;
    const selected = selectRailCase(1, 3);
    for (const staleOffset of [stride * 2, stride * 1.8, stride, 0]) {
      expect(observeRailScroll(selected, staleOffset, stride, 3)).toBe(selected);
    }
    expect(selected.index).toBe(1);
  });

  it('lets the newest of rapid card taps win before React renders or the rail settles', () => {
    let current = selectRailCase(0, 3);
    current = selectRailCase(2, 3);
    current = selectRailCase(1, 3);
    current = observeRailScroll(current, 580, 290, 3);
    expect(current.index).toBe(1);
    expect(current.source).toBe('explicit');
  });

  it('updates the selected card during a real swipe, including its final momentum', () => {
    let current = beginRailGesture(selectRailCase(0, 3));
    current = observeRailScroll(current, 160, 290, 3);
    expect(current.index).toBe(1);
    current = observeRailScroll(current, 500, 290, 3);
    expect(current.index).toBe(2);
    current = observeRailScroll(current, 580, 290, 3);
    expect(current.index).toBe(2);
  });

  it('a card tap interrupts an earlier user fling without accepting its late frames', () => {
    let current = observeRailScroll(beginRailGesture(selectRailCase(0, 3)), 460, 290, 3);
    current = selectRailCase(1, 3);
    expect(observeRailScroll(current, 580, 290, 3)).toBe(current);
    expect(current.index).toBe(1);
  });

  it('a new deliberate swipe can change a tapped choice', () => {
    const selected = selectRailCase(1, 3);
    const next = observeRailScroll(beginRailGesture(selected), 580, 290, 3);
    expect(next.index).toBe(2);
  });

  it('clamps bounce offsets and ignores invalid layout samples', () => {
    const current = beginRailGesture(selectRailCase(1, 3));
    expect(observeRailScroll(current, -200, 290, 3).index).toBe(0);
    expect(observeRailScroll(current, 10000, 290, 3).index).toBe(2);
    expect(observeRailScroll(current, NaN, 290, 3)).toBe(current);
    expect(observeRailScroll(current, 200, 0, 3)).toBe(current);
    expect(observeRailScroll(current, 200, Infinity, 3)).toBe(current);
  });

  it('launches from the synchronous selection ref and no longer has competing activeId scroll effects', () => {
    const source = readFileSync(new URL('../app/home.tsx', import.meta.url), 'utf8');
    expect(source).toContain('selectMission(missions[railSelection.current.index].id)');
    expect(source).toContain('onScrollBeginDrag={beginSwipe}');
    expect(source).toContain('onScroll={observeScroll}');
    expect(source).toContain('style={styles.caseDotTarget}');
    expect(source).toContain("caseDotTarget: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }");
    expect(source).toContain('}>Host</Text>');
    expect(source).not.toContain('onMomentumScrollEnd={settle}');
    expect(source).not.toContain('}, [activeId, stride])');
  });
});
