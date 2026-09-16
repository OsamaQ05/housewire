export const SEAL_RIDDLES = [
  { clue: 'Say my name out loud and I am gone. What am I?', answers: ['silence', 'quiet'] },
  { clue: 'I follow you in sunlight, stretch without growing, and disappear in the dark. What am I?', answers: ['shadow', 'a shadow', 'your shadow'] },
  { clue: 'I answer a shout without learning a word. I live where sound can come back. What am I?', answers: ['echo', 'an echo'] },
  { clue: 'I have cities but no houses, rivers but no water, and roads nobody can walk. What am I?', answers: ['map', 'a map'] },
  { clue: 'The more you take from me, the bigger I become. You can fall into me, but cannot pick me up. What am I?', answers: ['hole', 'a hole', 'pit'] },
  { clue: 'My hands keep moving, but I cannot pick anything up. My face tells you when to go. What am I?', answers: ['clock', 'a clock', 'watch', 'a watch'] },
  { clue: 'I am full of holes, yet I can carry water. Squeeze me and I let it go. What am I?', answers: ['sponge', 'a sponge'] },
  { clue: 'I get smaller while I work. I wear a tiny fire on my head and leave wax behind. What am I?', answers: ['candle', 'a candle'] },
  { clue: 'I have many teeth, but no mouth. I put tangled hair in order. What am I?', answers: ['comb', 'a comb'] },
  { clue: 'Break me before you can use what is inside. A breakfast pan knows me well. What am I?', answers: ['egg', 'an egg'] },
  { clue: 'I can carry your voice across a room without moving my lips. I ring, yet I am not a bell. What am I?', answers: ['phone', 'telephone', 'a phone', 'mobile phone'] },
  { clue: 'I keep a place in a story without reading a word. Close the book and I wait for you. What am I?', answers: ['bookmark', 'a bookmark', 'book mark'] },
] as const;

export function sealRiddle(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return SEAL_RIDDLES[(hash >>> 0) % SEAL_RIDDLES.length];
}

export function matchesSealRiddle(key: string, answer: string): boolean {
  const normalize = (value: string) => value.toLowerCase().trim().replace(/^(a|an|the|my|your)\s+/, '').replace(/[^a-z0-9]/g, '');
  const candidate = normalize(answer);
  return !!candidate && sealRiddle(key).answers.some((accepted) => normalize(accepted) === candidate);
}
