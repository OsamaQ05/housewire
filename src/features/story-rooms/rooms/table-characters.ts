/** These are authored fictional characters; names do not infer a player's gender. */
export const TABLE_CHARACTERS = {
  noor: { name: 'Noor', pronouns: 'she/her', shirt: '#E9B94B', detail: 'The yellow cardigan', hair: 'long' },
  sami: { name: 'Sami', pronouns: 'he/him', shirt: '#C36F58', detail: 'The striped scarf', hair: 'short' },
  leila: { name: 'Leila', pronouns: 'she/her', shirt: '#729BB0', detail: 'The blue watch', hair: 'long' },
  mina: { name: 'Mina', pronouns: 'she/her', shirt: '#749978', detail: 'The green sleeve', hair: 'long' },
  khalid: { name: 'Khalid', pronouns: 'he/him', shirt: '#B29CBE', detail: 'The photographer', hair: 'short' },
} as const;
export type TableCharacterId = keyof typeof TABLE_CHARACTERS;
