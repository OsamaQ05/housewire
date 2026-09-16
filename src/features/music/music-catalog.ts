/** Original, bundled scores. A chapter changes the arrangement, not just its label. */
export const MUSIC_TRACKS = {
  switchboard: { title: 'Midnight connections', mood: 'Soft keys and a ticking workshop', volume: .23 },
  delivery: { title: 'A parcel through town', mood: 'Pizzicato walking tune', volume: .23 },
  workshop: { title: 'Small repairs', mood: 'Woodblocks and curious plucked strings', volume: .22 },
  crane: { title: 'One careful lift', mood: 'Steady bass and suspended keys', volume: .23 },
  clockwork: { title: 'Clockwork parade', mood: 'A miniature mechanical waltz', volume: .24 },
  courtyard: { title: 'Coloured glass', mood: 'Warm plucked strings in the courtyard', volume: .22 },
  search: { title: 'Under the wind tower', mood: 'Sparse strings and hand percussion', volume: .22 },
  timehouse: { title: 'Yesterday, tomorrow', mood: 'Two answering melodies', volume: .22 },
  daylight: { title: 'The rooftop opens', mood: 'Bright strings and soft bells', volume: .22 },
  table: { title: 'The family photograph', mood: 'Gentle evening piano', volume: .23 },
  marble: { title: 'Mina’s contraption', mood: 'Playful marimba and bouncing bass', volume: .24 },
  tray: { title: 'Careful with the cake', mood: 'A light, lilting dessert dance', volume: .23 },
  shadow: { title: 'A garden in the shadows', mood: 'Warm felt keys and glass harmonics', volume: .24 },
  frequency: { title: 'Your turn', mood: 'Friendly game-show groove', volume: .24 },
  race: { title: 'The relay is on', mood: 'Upbeat, understated rhythmic pulse', volume: .22 },
  lastlight: { title: 'Keep the light', mood: 'Low, patient suspense', volume: .22 },
  forge: { title: 'A case taking shape', mood: 'Curious keys and drifting strings', volume: .22 },
} as const;

export type MusicTrack = keyof typeof MUSIC_TRACKS;

export function storyMusic(room: string, stage: string, mechanic?: string): MusicTrack {
  const activities: Record<string, MusicTrack> = {
    'marble-machine': 'marble', 'serving-tray': 'tray', 'shadow-play': 'shadow',
    'bench-wiring': 'workshop', 'rescue-crane': 'crane', 'clockwork-machine': 'clockwork',
    'tool-search': 'search', 'time-house': 'timehouse', 'lightbox': 'courtyard',
  };
  if (mechanic && activities[mechanic]) return activities[mechanic];
  if (room === 'night-glass') return stage.includes('watermark') ? 'daylight' : 'courtyard';
  if (room === 'long-table') return 'table';
  if (mechanic === 'route-map' || stage === 'rescue-route') return 'delivery';
  return 'switchboard';
}

export function routeMusic(pathname: string): MusicTrack | null {
  if (['/trivia-setup', '/trivia-play', '/trivia-results'].includes(pathname)) return 'frequency';
  if (['/race-play', '/race-lobby', '/race-results'].includes(pathname)) return 'race';
  if (pathname === '/defusal') return 'lastlight';
  if (['/case-forge', '/forged-case', '/forge-live'].includes(pathname)) return 'forge';
  return null;
}

export function musicMayPlay(enabled: boolean, foreground: boolean, silenced: boolean, track: MusicTrack | null): boolean {
  return enabled && foreground && !silenced && track !== null;
}
