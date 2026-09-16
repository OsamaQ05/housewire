import type { StoryStage } from '../types';

export const CLOCKWORK_STAGE: StoryStage = {
  id: 'clockwork-parade', title: 'The clockwork parade', kind: 'investigation',
  story: 'The parcel contains the town clock—but its little mechanism is in pieces. Four belt drives lie on the toy-maker’s pegboard. Your family can build a working transmission from the hand crank to the clock.',
  objective: 'Build a machine that winds the town clock forward.',
  instruction: 'Choose one of your drives. Point it, then tap a peg to fit it. Join wheels on the same peg and turn the crank to see what moves.',
  interaction: { kind: 'clockwork-machine' },
  slots: ['Copper drive', 'Mint drive', 'Coral drive', 'Blue drive'].map((label, seat) => ({ id: `clockwork-${seat}`, label, seat })),
  options: [], clues: [], constraints: [], answer: [],
  revelation: 'Four little drives spin together. The clock winds forward, the windows glow, and the toy-maker’s miniature town is ready for its first family.',
  explanation: 'Join the top-left crank to the bottom-right clock using all four drives. One working construction runs across the top row, then down the right edge: Copper at A1 pointing right; Mint at B1 pointing right; Coral at C1 pointing down; Blue at C2 pointing down. Make the Coral belt straight, then test. Other routes and drive orders work too. A crossed belt reverses rotation, so use an even number of crossed belts. Drives can be lifted and repositioned freely.',
  hints: ['Start with one drive on the crank peg. Which end of it should the next person connect to?', 'Test the crank. Follow the turning wheels; the first still wheel shows where the connection breaks.', 'A backwards clock is still connected. A crossed belt changes which way the next wheel turns.'],
};
