/** Leases compose: finishing one voice note must not unmute another recorder. */
export function createMusicFocus() {
  const leases = new Set<symbol>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    getSnapshot: () => leases.size > 0,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acquire() {
      const token = Symbol('foreground-audio');
      leases.add(token); notify();
      return () => { if (leases.delete(token)) notify(); };
    },
  };
}

export const musicFocus = createMusicFocus();

/** Optional sound effects with information take precedence over atmosphere. */
export function silenceMusicFor(milliseconds: number) {
  const release = musicFocus.acquire();
  const timer = setTimeout(release, Math.min(30_000, Math.max(0, milliseconds)));
  return () => { clearTimeout(timer); release(); };
}
