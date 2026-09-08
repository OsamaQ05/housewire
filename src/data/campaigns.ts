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
    title: 'LINE 13',
    operation: 'THE CALL AHEAD',
    description:
      'Trace a telephone call sent from this house thirteen minutes in the future. Split its cipher, carry the missing minute, rebuild its route, then hang up everywhere at once.',
    duration: '13 MIN',
    playerRange: '2–4 NODES',
    intensity: 'STANDARD',
    playable: true,
    accent: '#FF603B',
    requiredRoles: ['relay', 'listener', 'navigator', 'breaker'],
    mechanics: ['LISTEN', 'CONTACT', 'TRANSFER', 'ROUTE', 'SYNC'],
  },
  {
    id: 'dead-air',
    title: 'DEAD AIR',
    operation: 'THE QUIET MACHINE',
    description:
      'Wake an acoustic service machine hidden in the walls. Route a private voice channel, decode its valves, then cancel it with a human countertone.',
    duration: '18 MIN',
    playerRange: '3 RECOMMENDED',
    intensity: 'ACTIVE',
    playable: true,
    accent: '#C8F26A',
    requiredRoles: ['listener', 'navigator', 'breaker'],
    mechanics: ['LISTEN', 'SCAN', 'WHISPER', 'VOICE', 'CONTACT'],
  },
  {
    id: 'night-glass',
    title: 'NIGHT GLASS',
    operation: 'THE RED CORRIDOR',
    description:
      'Use three phone cameras as panes into a mirrored copy of your house. Rebuild its impossible floorplan, cross it, then fold the corridor shut.',
    duration: '18 MIN',
    playerRange: '2–4 PHONES',
    intensity: 'ACTIVE',
    playable: true,
    accent: '#9AE9F5',
    requiredRoles: ['relay', 'navigator', 'breaker'],
    mechanics: ['CAMERA', 'PARALLAX', 'MAZE', 'CARRY', 'SYNC'],
  },
  {
    id: 'long-table',
    title: 'THE LONG TABLE',
    operation: 'MIDNIGHT SERVICE',
    description:
      'An impossible dining room stole one ordinary family meal. Seat four generations, rebuild the photograph, prove what the house kept, then serve before the last bell.',
    duration: '22 MIN',
    playerRange: '2–4 PLACES',
    intensity: 'ACTIVE',
    playable: true,
    accent: '#E4A84A',
    requiredRoles: ['listener', 'navigator', 'relay', 'breaker'],
    mechanics: ['TIMELINE', 'PHOTO', 'CAMERA', 'HANDOFF', 'VOICE'],
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
    instruction: 'You can move the signal. Others must tell you where it belongs.',
    color: '#FF603B',
  },
  listener: {
    title: 'THE LISTENER',
    instruction: 'You receive fragments no other node can hear. Describe them exactly.',
    color: '#65CFE2',
  },
  navigator: {
    title: 'THE NAVIGATOR',
    instruction: 'You can see the route, but not the actions that activate it.',
    color: '#F4C85A',
  },
  breaker: {
    title: 'THE BREAKER',
    instruction: 'You close the circuit. Your timing decides whether the line holds.',
    color: '#B7A5EE',
  },
};
