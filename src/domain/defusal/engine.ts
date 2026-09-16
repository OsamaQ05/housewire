import type {
  DefusalAction, DefusalGame, DefusalMode, DefusalModule, DefusalPlayer,
  DefusalRole, DefusalState, DefusalTransition, DefusalView,
} from './types';

const OBJECTS = [
  { id: 'key', label: 'Key', riddle: 'I have teeth but never bite. Give me a turn and a closed door opens.' },
  { id: 'candle', label: 'Candle', riddle: 'A tiny flame lives on my head. I grow shorter while I light your way.' },
  { id: 'clock', label: 'Clock', riddle: 'My hands travel all day, but I never leave the wall.' },
  { id: 'book', label: 'Book', riddle: 'Open my cover and turn my leaves. A whole world waits without a single tree.' },
  { id: 'comb', label: 'Comb', riddle: 'My row of teeth never eats. I travel through hair to put it in order.' },
  { id: 'umbrella', label: 'Umbrella', riddle: 'I unfold a little roof above your head. The wetter the sky, the more you need me.' },
  { id: 'bell', label: 'Bell', riddle: 'I have a tongue but cannot taste. Give me a shake and I call everyone near.' },
  { id: 'mirror', label: 'Mirror', riddle: 'I copy every smile without making a sound. Your left hand is my right.' },
] as const;

const LANDMARKS = [
  { id: 'home', label: 'Home', x: 0, y: 0, riddle: 'The place your journey starts.' },
  { id: 'orchard', label: 'Orchard', x: 1, y: 0, riddle: 'Rows of trees hold tomorrow’s apple pie.' },
  { id: 'tower', label: 'Clock tower', x: 2, y: 0, riddle: 'I wear a clock above the rooftops so the whole town can read its face.' },
  { id: 'well', label: 'Well', x: 0, y: 1, riddle: 'Lower an empty bucket into my stone throat. Lift it full of water.' },
  { id: 'library', label: 'Library', x: 1, y: 1, riddle: 'A thousand borrowed stories sleep on my shelves. Return them for the next reader.' },
  { id: 'quay', label: 'Harbour', x: 2, y: 1, riddle: 'Boats rest beside me when their work at sea is done.' },
  { id: 'bakery', label: 'Bakery', x: 0, y: 2, riddle: 'Flour arrives before sunrise. Warm loaves leave through my door.' },
  { id: 'garden', label: 'Garden', x: 1, y: 2, riddle: 'Flowers share my beds, but nobody sleeps in them.' },
  { id: 'lighthouse', label: 'Lighthouse', x: 2, y: 2, riddle: 'My turning light guides ships safely home.' },
] as const;

const ROUTES = [
  ['home', 'orchard', 'tower', 'quay', 'lighthouse'],
  ['home', 'orchard', 'library', 'quay', 'lighthouse'],
  ['home', 'orchard', 'library', 'garden', 'lighthouse'],
  ['home', 'well', 'library', 'quay', 'lighthouse'],
  ['home', 'well', 'library', 'garden', 'lighthouse'],
  ['home', 'well', 'bakery', 'garden', 'lighthouse'],
];
const FINAL_RIDDLES = [
  { answer: 'echo', text: 'Speak in an empty hall and I answer. I have no mouth and no words of my own.' },
  { answer: 'shadow', text: 'I follow you into sunshine. Turn out every light and I disappear.' },
  { answer: 'piano', text: 'I have many keys but open no doors. Your fingers can make my hammers sing.' },
  { answer: 'towel', text: 'The more I dry your hands, the wetter I become.' },
  { answer: 'footsteps', text: 'The more steps you take in fresh snow, the more of me you leave behind.' },
  { answer: 'rainbow', text: 'After the rain I bend seven colours across the sky. You can never walk to my end.' },
] as const;

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
function shuffled<T>(values: readonly T[], next: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createDefusalSeed(): number {
  const value = new Uint32Array(1);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(value);
    return value[0];
  }
  return Math.floor(Math.random() * 4_294_967_296) >>> 0;
}

/** Every authored riddle is paired with an exact answer; randomness rearranges solvable rules. */
export function compileDefusal(seed: number, tutorial = false): DefusalGame {
  const next = random(seed);
  const clues = shuffled(OBJECTS, next).slice(0, 3);
  const moon = next() > 0.5;
  const socketsOrder = moon ? [2, 0, 1] : [1, 2, 0];
  const socketSeal = `${shuffled(['BRAVE', 'KIND', 'CURIOUS', 'BRIGHT'], next)[0]} HEART`;
  const wireSeal = `STAY ${shuffled(['CLOSE', 'CALM', 'READY', 'TRUE'], next)[0]}`;
  const routeSeal = `COME ${shuffled(['HOME', 'TOGETHER', 'SAFELY', 'BACK'], next)[0]}`;
  const sockets: DefusalModule = {
    id: 'word-sockets', kind: 'sockets', title: 'The three sockets',
    objective: 'Identify three objects, then seat them in the manual’s order.',
    device: {
      instruction: 'Tell the Archivist your badge. Ask the Witness for each riddle answer. Tap three objects in the order the Archivist gives you.',
      options: shuffled(OBJECTS, next).map(({ id, label }) => ({ id, label })),
      selectionCount: 3, ordered: true, indicator: moon ? 'MOON badge' : 'SUN badge',
    },
    manual: { heading: 'Socket page', lines: [
      'The Witness has three numbered riddles. Each answer names one object on the Operator’s panel.',
      'Ask the Operator which badge is on the device. Do not assume it from a previous game.',
      'MOON badge → seat riddle 3, then riddle 1, then riddle 2.',
      'SUN badge → seat riddle 2, then riddle 3, then riddle 1.',
      'Read the complete order back together before the Operator locks it.',
    ] },
    witness: { heading: 'Three objects are missing', lines: clues.map((clue, i) => `Riddle ${i + 1} · ${clue.riddle}`) },
    solution: socketsOrder.map((i) => clues[i].id), seal: socketSeal,
  };

  const leadsObjects = shuffled(OBJECTS, next).slice(0, 4);
  const leadTargets = shuffled(leadsObjects, next).slice(0, 2);
  const amber = next() > 0.5;
  const patterns = ['DOTTED', 'STRIPED'] as const;
  const targetPattern = amber ? 'DOTTED' : 'STRIPED';
  const leads: DefusalModule = {
    id: 'riddle-leads', kind: 'leads', title: 'Crossed connections',
    objective: 'Find the two safe leads. Their names and sleeves both matter.',
    device: {
      instruction: 'Describe the lamp to the Archivist. Match both riddle objects AND the right sleeve pattern. Select two leads, then isolate them together.',
      options: shuffled(leadsObjects.flatMap((object) => patterns.map((pattern) => ({
        id: `${object.id}-${pattern.toLowerCase()}`, label: object.label,
        detail: `${pattern} sleeve ${pattern === 'DOTTED' ? '•••' : '///'}`,
      }))), next), selectionCount: 2, ordered: false,
      indicator: amber ? 'AMBER lamp is lit' : 'WHITE lamp is lit',
    },
    manual: { heading: 'Isolation page', lines: [
      'The two riddles name the lead labels, not their colours or positions.',
      'Ask the Operator which lamp is lit. AMBER means DOTTED sleeves. WHITE means STRIPED sleeves.',
      'For each riddle answer, isolate the lead with the matching name AND that sleeve pattern.',
      'Exactly two leads must be selected. Their order does not matter. Both are tested together.',
    ] },
    witness: { heading: 'Two connections carry the fault', lines: leadTargets.map((target, i) => `Riddle ${i + 1} · ${target.riddle}`) },
    solution: leadTargets.map((target) => `${target.id}-${targetPattern.toLowerCase()}`), seal: wireSeal,
  };

  const route = ROUTES[Math.floor(next() * ROUTES.length)];
  const edges: [string, string][] = [];
  for (const a of LANDMARKS) for (const b of LANDMARKS) {
    if ((b.x === a.x + 1 && b.y === a.y) || (b.x === a.x && b.y === a.y + 1)) edges.push([a.id, b.id]);
  }
  const waypoints = shuffled(route.slice(1, -1), next);
  const routeModule: DefusalModule = {
    id: 'lantern-route', kind: 'route', title: 'The lantern route',
    objective: 'Carry the current home through a real map—not a list of cell numbers.',
    device: {
      instruction: 'Trace a five-place journey: Home, three stops, Lighthouse. Tap neighbouring places joined by a path. Ask the Witness which three places to visit.',
      options: LANDMARKS.map(({ id, label, x, y }) => ({ id, label, x, y })),
      edges, start: 'home', end: 'lighthouse', selectionCount: 5, ordered: true,
    },
    manual: { heading: 'Route page', lines: [
      'Start at Home and finish at Lighthouse. The whole route uses exactly five places, including the start and finish.',
      'Every next place must share a drawn path with the previous one. No diagonal jumps and no returning to a visited place.',
      'The Witness has three landmark riddles in scrambled order. Solve them, then use the map to put those stops in a connected order.',
      'Read the journey as place names: “Home, …, …, …, Lighthouse.”',
    ] },
    witness: { heading: 'Three stops on the way home', lines: waypoints.map((id) => LANDMARKS.find((place) => place.id === id)!.riddle) },
    solution: route, seal: routeSeal,
  };
  const last = FINAL_RIDDLES[Math.floor(next() * FINAL_RIDDLES.length)];
  const reverse = next() > 0.5;
  const sealWords = reverse ? [routeSeal.split(' ')[1], socketSeal.split(' ')[0]] : [socketSeal.split(' ')[0], routeSeal.split(' ')[1]];
  const phrase: DefusalModule = {
    id: 'last-word', kind: 'phrase', title: 'The last word',
    objective: 'Use the clues you earned to speak the shutdown phrase.',
    device: {
      instruction: 'Solve the final riddle together. Then ask the Archivist how to combine that answer with your earned seals. Type the full three-part phrase.',
      options: [], selectionCount: 1, ordered: true, textEntry: true,
      indicator: reverse ? 'Closing mark: CIRCLE' : 'Closing mark: TRIANGLE',
    },
    manual: { heading: 'Shutdown page', lines: [
      'The phrase starts with the answer to the Witness’s final riddle.',
      'Ask the Operator for the closing mark and the seals earned from Three sockets and Lantern route.',
      'TRIANGLE → riddle answer + first word of the Socket seal + last word of the Route seal.',
      'CIRCLE → riddle answer + last word of the Route seal + first word of the Socket seal.',
      'Use spaces between words. Capital letters do not matter. The Connections seal is not used.',
    ] },
    witness: { heading: 'One final riddle', lines: [last.text, 'Say what it is—not the words of the riddle. The Archivist knows what comes next.'] },
    solution: [`${last.answer} ${sealWords.join(' ')}`], seal: 'LIGHT RESTORED',
  };
  return { version: 1, seed: seed >>> 0, tutorial, modules: tutorial ? [sockets] : [sockets, leads, routeModule, phrase], durationMs: tutorial ? 10 * 60_000 : 15 * 60_000, maxStrikes: tutorial ? 5 : 3 };
}

export function assignDefusalRoles(players: { id: string; name: string }[]): DefusalPlayer[] {
  return players.slice(0, 4).map((player, index) => ({ ...player, role: index === 0 ? 'operator' : index === 1 ? 'archivist' : 'witness' }));
}
export function createDefusalState(options: { id: string; hostId: string; seed: number; tutorial?: boolean; mode: DefusalMode; players: { id: string; name: string }[] }): DefusalState {
  const unique = new Map(options.players.map((player) => [player.id, { ...player, name: player.name.trim().slice(0, 24) || 'Player' }]));
  const host = unique.get(options.hostId);
  if (!host || unique.size > 4 || unique.size < 1) throw new Error('A defusal room needs its host and at most four distinct players.');
  const players = assignDefusalRoles([host, ...[...unique.values()].filter((p) => p.id !== options.hostId)]);
  return {
    id: options.id, hostId: options.hostId, mode: options.mode, game: compileDefusal(options.seed, options.tutorial),
    players, status: 'waiting', stageIndex: 0, revision: 0, strikes: 0, cooldownUntil: 0,
    readyNodeIds: [], seenActionIds: [],
  };
}
export function addDefusalPlayer(state: DefusalState, player: { id: string; name: string }): DefusalState {
  if (state.players.some((entry) => entry.id === player.id)) return state;
  if (state.status !== 'waiting' || state.players.length >= 4) return state;
  return { ...state, players: assignDefusalRoles([...state.players, player]), revision: state.revision + 1 };
}
export function startDefusal(state: DefusalState, actorId: string, now: number): DefusalTransition {
  if (actorId !== state.hostId) return { state, accepted: false, reason: 'Only the host can start.' };
  if (state.status !== 'waiting') return { state, accepted: false, reason: 'This run has already started.' };
  if (state.mode === 'live' && state.players.length < 2) return { state, accepted: false, reason: 'Invite at least one other phone first.' };
  return { accepted: true, state: { ...state, status: 'playing', startedAt: now, deadline: now + state.game.durationMs, revision: state.revision + 1, feedback: undefined } };
}
export function tickDefusal(state: DefusalState, now: number): DefusalState {
  if (state.status !== 'playing' || state.deadline === undefined || now < state.deadline) return state;
  return { ...state, status: 'failed', finishedAt: state.deadline, revision: state.revision + 1, feedback: 'The lantern went dark. Regroup and try a fresh device.' };
}
export function normalizeDefusalPhrase(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[.,!?;:'"-]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function checkDefusalAnswer(module: DefusalModule, answer: string[]): boolean {
  if (module.device.textEntry) return answer.length === 1 && normalizeDefusalPhrase(answer[0]) === normalizeDefusalPhrase(module.solution[0]);
  if (answer.length !== module.device.selectionCount || new Set(answer).size !== answer.length) return false;
  return module.device.ordered
    ? answer.every((part, i) => part === module.solution[i])
    : answer.every((part) => module.solution.includes(part));
}
function malformedAnswer(module: DefusalModule, answer: string[]): string | undefined {
  if (module.device.textEntry) return answer.length !== 1 || !answer[0].trim() || answer[0].length > 160 ? 'Enter the complete phrase before locking it.' : undefined;
  if (answer.length !== module.device.selectionCount || new Set(answer).size !== answer.length) return `Choose ${module.device.selectionCount} different ${module.kind === 'route' ? 'places' : module.kind === 'leads' ? 'leads' : 'objects'} first.`;
  if (answer.some((id) => !module.device.options.some((option) => option.id === id))) return 'That selection is not on this device.';
  if (module.kind === 'route') {
    if (answer[0] !== module.device.start || answer.at(-1) !== module.device.end) return 'Start at Home and finish at Lighthouse.';
    const edges = module.device.edges ?? [];
    if (answer.some((id, i) => i > 0 && !edges.some(([a, b]) => (a === answer[i - 1] && b === id) || (b === answer[i - 1] && a === id)))) return 'Follow a drawn path between each pair of places.';
  }
  return undefined;
}
export function applyDefusalAction(original: DefusalState, actorId: string, action: DefusalAction, now: number): DefusalTransition {
  const state = tickDefusal(original, now);
  const reject = (reason: string): DefusalTransition => ({ state, accepted: false, reason });
  if (state.status !== 'playing') return reject('This device is not running.');
  if (state.id !== action.operationId || action.stageIndex !== state.stageIndex) return reject('The module changed. Read the current page.');
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor) return reject('This phone is not assigned to the device.');
  if (state.seenActionIds.includes(action.actionId)) return { state, accepted: true };
  if (action.type === 'ready') {
    if (actor.role === 'operator' && state.mode === 'live') return reject('The readers confirm their clues. The Operator controls the device.');
    if (state.readyNodeIds.includes(actorId)) return { state, accepted: true };
    return { accepted: true, state: { ...state, readyNodeIds: [...state.readyNodeIds, actorId], seenActionIds: [...state.seenActionIds, action.actionId].slice(-128), revision: state.revision + 1 } };
  }
  if (actor.role !== 'operator') return reject('Only the Operator can lock the device.');
  if (now < state.cooldownUntil) return reject('Pause and compare clues before trying again.');
  const readers = state.players.filter((player) => player.role !== 'operator');
  if (state.mode === 'live' && readers.some((player) => !state.readyNodeIds.includes(player.id))) return reject('Wait for the Archivist and Witness to finish sharing their clues.');
  const module = state.game.modules[state.stageIndex];
  const malformed = malformedAnswer(module, action.answer);
  if (malformed) return reject(malformed);
  const correct = checkDefusalAnswer(module, action.answer);
  const seenActionIds = [...state.seenActionIds, action.actionId].slice(-128);
  if (!correct) {
    const strikes = state.strikes + 1;
    const failed = strikes >= state.game.maxStrikes;
    return { accepted: true, state: { ...state, strikes, seenActionIds, cooldownUntil: now + 4_000, revision: state.revision + 1,
      status: failed ? 'failed' : 'playing', finishedAt: failed ? now : undefined,
      feedback: failed ? 'The safety lock closed. Nothing explodes—start fresh and compare clues again.' : 'The full combination did not match. One strike. Check the riddle, rule and order together.',
    } };
  }
  const stageIndex = state.stageIndex + 1;
  const defused = stageIndex === state.game.modules.length;
  return { accepted: true, state: { ...state, stageIndex, seenActionIds, readyNodeIds: [], revision: state.revision + 1, cooldownUntil: 0,
    status: defused ? 'defused' : 'playing', finishedAt: defused ? now : undefined,
    feedback: defused ? 'Light restored. Every role brought part of the answer.' : `${module.title} restored. Keep its seal for later.`,
  } };
}

/** Project from scratch instead of spreading state: solved answers, seeds and future clues never cross the wire. */
export function projectDefusal(state: DefusalState, playerId: string, practiceRole?: DefusalRole): DefusalView | undefined {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return undefined;
  const role = state.mode === 'practice' && practiceRole ? practiceRole : player.role;
  const module = state.game.modules[state.stageIndex];
  const view: DefusalView = {
    id: state.id, mode: state.mode, tutorial: state.game.tutorial, status: state.status, role,
    players: state.players.map((entry) => ({ ...entry })), stageIndex: state.stageIndex,
    moduleCount: state.game.modules.length, revision: state.revision, strikes: state.strikes,
    maxStrikes: state.game.maxStrikes, startedAt: state.startedAt, deadline: state.deadline,
    finishedAt: state.finishedAt, cooldownUntil: state.cooldownUntil, readyNodeIds: [...state.readyNodeIds], feedback: state.feedback,
    seals: state.game.modules.slice(0, state.stageIndex).map((entry) => ({ title: entry.title, text: entry.seal })),
  };
  if (module && state.status === 'playing') {
    view.module = { id: module.id, kind: module.kind, title: module.title, objective: module.objective };
    if (role === 'operator') view.module.device = structuredCloneSafe(module.device);
    if (role === 'archivist') view.module.manual = structuredCloneSafe(module.manual);
    if (role === 'witness' || (role === 'archivist' && state.mode === 'live' && state.players.length === 2)) view.module.witness = structuredCloneSafe(module.witness);
  }
  if (state.status === 'failed') view.review = state.game.modules.slice(state.stageIndex).map(entry => ({
    title: entry.title,
    answer: entry.solution.map(id => { const option = entry.device.options.find(o => o.id === id); return option ? `${option.label}${option.detail ? ` (${option.detail})` : ''}` : id; }).join(' → '),
    explanation: `${entry.objective} ${entry.manual.lines.join(' ')}`,
  }));
  return view;
}
function structuredCloneSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
