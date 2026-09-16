import type { StoryStage } from '../types';

export const BENCH_WIRING_STAGE: StoryStage = {
  id: 'intervention', title: 'Wire the workshop', kind: 'circuit',
  story: 'The toy-maker’s miniature town is dark. You each have a cable spool. Thread the streets together, leave room for your neighbours, and bring the little buildings back to life.',
  objective: 'Connect all four buildings without crossing another cable.',
  instruction: 'Tap the glowing street beside your cable to extend it. Tap an earlier part to shorten it. You each control different cables.',
  interaction: { kind: 'bench-wiring' },
  slots: ['Bakery cable', 'Cinema cable', 'Garden cable', 'Crane cable'].map((label, seat) => ({ id: `bench-guide-${seat}`, label, seat })),
  options: [], clues: [], constraints: [], answer: [],
  revelation: 'One window lights, then a whole street. The tiny cinema flickers into life and the crane hums, ready to lift its parcel.',
  explanation: 'Every cable starts at a round socket and ends at its own building. The streets cannot hold two cables. One working plan: bakery travels down the left edge then into its building; cinema goes up to the top street, along it, then down; garden heads down from its socket and along the bottom street; crane follows the right edge, then turns into its building. Other routes work. Reel in a cable whenever you need to share a street differently.',
  hints: ['Look at the round sockets and the buildings with the same letter and colour. You are laying a route, not choosing an answer.', 'If one route takes a useful street, its owner can tap an earlier piece to pull it back. Nothing gets permanently stuck.', 'The cinema can use the top street. Leave a way down to the garden, and let the crane use the right edge.'],
};
