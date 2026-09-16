import type { MissionId, RoleId } from '@/src/store/use-housewire-store';

export interface MissionDefinition {
  id: MissionId;
  title: string;
  operation: string;
  description: string;
  duration: string;
  playerRange: string;
  intensity: 'CALM' | 'STANDARD' | 'ACTIVE';
  playable: boolean;
  accent: string;
  requiredRoles: RoleId[];
  mechanics: string[];
}

export const missions: MissionDefinition[] = [
  {
    id: 'line-13',
    title: 'AFTER HOURS',
    operation: 'THE LAST DELIVERY',
    description:
      'Wake a toy town, route its power, lift the clock into place and build a moving clockwork parade.',
    duration: '22 MIN',
    playerRange: '2–4 PHONES',
    intensity: 'STANDARD',
    playable: true,
    accent: '#F5B476',
    requiredRoles: ['relay', 'listener', 'navigator', 'breaker'],
    mechanics: ['PLAN THE DELIVERY', 'ROUTE THE POWER', 'LIFT TOGETHER', 'BUILD CLOCKWORK'],
  },
  {
    id: 'night-glass',
    title: 'BARJEEL',
    operation: 'THE COURTYARD BETWEEN TIMES',
    description:
      'Build a window picture, improvise with found tools, change a courtyard across time and reveal its last message.',
    duration: '20 MIN',
    playerRange: '2–4 PHONES',
    intensity: 'ACTIVE',
    playable: true,
    accent: '#E4C28A',
    requiredRoles: ['relay', 'navigator', 'breaker'],
    mechanics: ['MAKE A PICTURE', 'DISCOVER', 'CHANGE TIME', 'REVEAL'],
  },
  {
    id: 'long-table',
    title: 'THE LONG TABLE',
    operation: 'MIDNIGHT SERVICE',
    description:
      'Rebuild a dinner photo, tune a marble machine, carry dessert together and discover a surprise in the shadows.',
    duration: '20 MIN',
    playerRange: '2–4 PHONES',
    intensity: 'ACTIVE',
    playable: true,
    accent: '#D56644',
    requiredRoles: ['listener', 'navigator', 'relay', 'breaker'],
    mechanics: ['THE PHOTO', 'BUILD A MACHINE', 'SERVE TOGETHER', 'SHADOW PLAY'],
  },
];

export const sealedOperations = [
  { title: 'COURIER ZERO', detail: 'The packet may never stop moving.', code: 'OP.05' },
  { title: 'THE HOUSE BELOW', detail: 'Another floor is answering from underground.', code: 'OP.06' },
  { title: 'LAST OCCUPANT', detail: 'The empty room keeps checking in.', code: 'OP.07' },
];

export const roleCopy: Record<RoleId, { title: string; instruction: string; color: string }> = {
  relay: {
    title: 'THE RELAY',
    instruction: 'You control part of the shared board. Compare clues before placing your pieces.',
    color: '#FF603B',
  },
  listener: {
    title: 'THE LISTENER',
    instruction: 'Your evidence fills a gap in someone else’s view. Describe what you notice.',
    color: '#65CFE2',
  },
  navigator: {
    title: 'THE NAVIGATOR',
    instruction: 'Look for connections between the records. Ask what the other players can see.',
    color: '#F4C85A',
  },
  breaker: {
    title: 'THE BREAKER',
    instruction: 'Check the whole plan against your evidence. Everyone’s contribution matters.',
    color: '#B7A5EE',
  },
};
