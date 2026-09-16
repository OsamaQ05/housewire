/** Board mechanics are serializable; the same rules run on the host and in tests. */
export type StoryInteraction =
  | { kind: 'marble-machine' | 'time-house' | 'tool-search' | 'rescue-crane' | 'bench-wiring' | 'serving-tray' | 'shadow-play' | 'clockwork-machine' }
  | { kind: 'patch-panel' }
  | { kind: 'pipe-grid'; tiles: [number, number][]; source: { cell: number; edge: number }; target: { cell: number; edge: number } }
  | { kind: 'lightbox'; films: number[][]; colors: string[]; target: number[]; preview?: number[] }
  | { kind: 'route-map'; nodes: { id: string; label: string; x: number; y: number; icon: string }[]; edges: [string, string][] }
  | { kind: 'control-console'; sites: { label: string; icon: string; description: string }[] }
  | { kind: 'table-scene'; mode: 'seating' | 'riddles' | 'envelopes' }
  | { kind: 'workbench'; sites: { label: string; icon: string; description: string }[] };
