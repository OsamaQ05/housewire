import { describe, expect, it } from 'vitest';
import {
  addDefusalPlayer, applyDefusalAction, checkDefusalAnswer, compileDefusal,
  createDefusalState, projectDefusal, startDefusal, tickDefusal, type DefusalState,
} from '../src/domain/defusal';
import { acceptDefusalSnapshot, defusalDeliveries, handleDefusalMessage } from '../src/features/defusal/coordinator';
import { defusalMessageSchema } from '../src/features/defusal/protocol';
import { makeDefusalJoinTicket, parseDefusalJoinTicket } from '../src/features/defusal/join-ticket';
import { parseDefusalRuntime, serializeDefusalRuntime } from '../src/features/defusal/runtime-state';

function room(count = 3, mode: 'live' | 'practice' = 'live'): DefusalState {
  return createDefusalState({ id: 'device-one', hostId: 'local', seed: 749, mode, players: [
    { id: 'local', name: 'Mara' }, ...Array.from({ length: count - 1 }, (_, i) => ({ id: `reader-${i}`, name: `Reader ${i + 1}` })),
  ] });
}
function playing(count = 3, mode: 'live' | 'practice' = 'live'): DefusalState { return startDefusal(room(count, mode), 'local', 1_000).state; }
function ready(state: DefusalState): DefusalState {
  for (const player of state.players.slice(1)) state = applyDefusalAction(state, player.id, { type: 'ready', actionId: `ready-${player.id}-${state.stageIndex}`, operationId: state.id, stageIndex: state.stageIndex }, 2_000).state;
  return state;
}
function solve(state: DefusalState, now = 3_000): DefusalState {
  return applyDefusalAction(ready(state), 'local', { type: 'commit', actionId: `solve-${state.stageIndex}`, operationId: state.id, stageIndex: state.stageIndex, answer: state.game.modules[state.stageIndex].solution }, now).state;
}
describe('Last Light deterministic puzzle engine', () => {
  it('compiles 1,000 seeds into four varied, valid and solvable modules', () => {
    for (let seed = 0; seed < 1_000; seed++) {
      const game = compileDefusal(seed);
      expect(game.modules.map((module) => module.kind)).toEqual(['sockets', 'leads', 'route', 'phrase']);
      for (const module of game.modules) expect(checkDefusalAnswer(module, module.solution)).toBe(true);
      const path = game.modules[2];
      expect(path.solution[0]).toBe(path.device.start);
      expect(path.solution.at(-1)).toBe(path.device.end);
      expect(new Set(path.solution).size).toBe(5);
      for (let i = 1; i < path.solution.length; i++) expect(path.device.edges?.some(([a, b]) => [a, b].includes(path.solution[i - 1]) && [a, b].includes(path.solution[i]))).toBe(true);
    }
  });
  it('is repeatable by seed but varies object choices, orders, sleeves, routes and final words', () => {
    expect(compileDefusal(19)).toEqual(compileDefusal(19));
    const answers = Array.from({ length: 100 }, (_, seed) => compileDefusal(seed).modules.map((module) => module.solution.join(':')));
    expect(new Set(answers.map((answer) => answer.join('|'))).size).toBe(100);
    for (let i = 0; i < 4; i++) expect(new Set(answers.map((answer) => answer[i])).size).toBeGreaterThan(4);
  });
  it('offers a real one-module training run, not a simulated solved button', () => {
    const training = createDefusalState({ id: 'training', hostId: 'local', mode: 'practice', seed: 20, tutorial: true, players: [{ id: 'local', name: 'You' }] });
    expect(training.game.modules).toHaveLength(1);
    expect(training.game.maxStrikes).toBe(5);
    expect(startDefusal(training, 'local', 1_000).state.status).toBe('playing');
  });
  it('requires a host and actual second player before live start', () => {
    expect(startDefusal(room(1), 'local', 100).accepted).toBe(false);
    expect(startDefusal(room(3), 'reader-0', 100).accepted).toBe(false);
    expect(startDefusal(room(1, 'practice'), 'local', 100).accepted).toBe(true);
  });
  it('assigns two-player combined reader and three-player split clues without leaks', () => {
    const two = projectDefusal(playing(2), 'reader-0')!;
    expect(two.module?.manual).toBeDefined(); expect(two.module?.witness).toBeDefined(); expect(two.module?.device).toBeUndefined();
    const three = playing();
    const operator = projectDefusal(three, 'local')!;
    const archivist = projectDefusal(three, 'reader-0')!;
    const witness = projectDefusal(three, 'reader-1')!;
    expect(operator.module?.manual).toBeUndefined(); expect(operator.module?.witness).toBeUndefined();
    expect(archivist.module?.witness).toBeUndefined(); expect(witness.module?.manual).toBeUndefined(); expect(witness.module?.device).toBeUndefined();
    for (const view of [operator, archivist, witness]) {
      const json = JSON.stringify(view);
      expect(json).not.toContain('"seed"'); expect(json).not.toContain('"solution"'); expect(json).not.toContain('"last-word"');
    }
    expect(projectDefusal(three, 'intruder')).toBeUndefined();
    expect(projectDefusal(three, 'reader-0', 'operator')?.role).toBe('archivist');
  });
  it('does not expose clues in the lobby and limits practice switching to practice', () => {
    expect(projectDefusal(room(), 'local')?.module).toBeUndefined();
    expect(projectDefusal(playing(1, 'practice'), 'local', 'witness')?.module?.witness).toBeDefined();
  });
  it('requires readers to share clues; reader phones cannot submit guesses', () => {
    const state = playing();
    const action = { type: 'commit' as const, actionId: 'try-1', operationId: state.id, stageIndex: 0, answer: state.game.modules[0].solution };
    expect(applyDefusalAction(state, 'local', action, 2_000).accepted).toBe(false);
    expect(applyDefusalAction(ready(state), 'reader-0', action, 2_000).accepted).toBe(false);
    expect(applyDefusalAction(ready(state), 'local', action, 2_000).state.stageIndex).toBe(1);
  });
  it('ignores duplicate ready/commit messages and stale prior-module moves', () => {
    const state = ready(playing());
    const action = { type: 'commit' as const, actionId: 'one-lock', operationId: state.id, stageIndex: 0, answer: state.game.modules[0].solution };
    const next = applyDefusalAction(state, 'local', action, 2_000).state;
    expect(applyDefusalAction(next, 'local', action, 3_000).state).toEqual(next);
    expect(applyDefusalAction(state, 'intruder', action, 2_000).accepted).toBe(false);
  });
  it('does not charge a strike for incomplete/duplicate/non-connected input', () => {
    let state = ready(playing());
    const action = { type: 'commit' as const, actionId: 'incomplete', operationId: state.id, stageIndex: 0, answer: ['key', 'key'] };
    const result = applyDefusalAction(state, 'local', action, 2_000);
    expect(result.accepted).toBe(false); expect(result.state.strikes).toBe(0);
    state = solve(solve(state));
    const route = applyDefusalAction(ready(state), 'local', { ...action, actionId: 'bad-path', stageIndex: 2, answer: ['home', 'tower', 'quay', 'garden', 'lighthouse'] }, 4_000);
    expect(route.accepted).toBe(false); expect(route.state.strikes).toBe(0);
  });
  it('penalizes full wrong combinations without partial feedback and enforces cooldown', () => {
    const state = ready(playing());
    const answer = [...state.game.modules[0].solution].reverse();
    const action = { type: 'commit' as const, actionId: 'wrong', operationId: state.id, stageIndex: 0, answer };
    const next = applyDefusalAction(state, 'local', action, 2_000).state;
    expect(next.strikes).toBe(1); expect(next.stageIndex).toBe(0);
    expect(next.feedback).not.toMatch(/correct|\d.*position/);
    expect(applyDefusalAction(next, 'local', { ...action, actionId: 'rapid' }, 3_000).accepted).toBe(false);
    expect(applyDefusalAction(next, 'local', action, 7_000).state.strikes).toBe(1);
  });
  it('fails after three wrong whole-module commits and cannot solve after failure', () => {
    let state = ready(playing());
    for (let i = 0; i < 3; i++) state = applyDefusalAction(state, 'local', { type: 'commit', actionId: `bad-${i}`, operationId: state.id, stageIndex: 0, answer: [...state.game.modules[0].solution].reverse() }, 2_000 + i * 5_000).state;
    expect(state.status).toBe('failed'); expect(state.strikes).toBe(3);
    expect(solve(state).status).toBe('failed');
  });
  it('uses the real deadline even after backgrounding, including exact-deadline submissions', () => {
    const state = playing();
    expect(tickDefusal(state, state.deadline! - 1).status).toBe('playing');
    expect(tickDefusal(state, state.deadline!).status).toBe('failed');
    expect(solve(state, state.deadline!).status).toBe('failed');
  });
  it('finishes a complete run and exposes earned seals, not answer payloads', () => {
    let state = playing();
    for (let i = 0; i < 4; i++) state = solve(state, 3_000 + i * 1_000);
    expect(state.status).toBe('defused'); expect(state.finishedAt).toBe(6_000);
    expect(projectDefusal(state, 'local')?.seals).toHaveLength(4);
    expect(projectDefusal(state, 'local')?.module).toBeUndefined();
  });
  it('accepts readable casing and punctuation in the final phrase but never a partial word', () => {
    const module = compileDefusal(432).modules[3];
    expect(checkDefusalAnswer(module, [`  ${module.solution[0].toUpperCase().replaceAll(' ', ', ')}!  `])).toBe(true);
    expect(checkDefusalAnswer(module, [module.solution[0].split(' ')[0]])).toBe(false);
  });
});

describe('Last Light authenticated private messaging', () => {
  it('admits readers with real sender identity, handles reconnect requests and bounds the lobby', () => {
    let state = room(1);
    for (let i = 0; i < 3; i++) state = handleDefusalMessage(state, `guest-${i}`, { channel: 'last-light-v1', type: 'join', name: `G ${i}` }, 200).state;
    expect(state.players).toHaveLength(4);
    expect(handleDefusalMessage(state, 'fifth', { channel: 'last-light-v1', type: 'join', name: 'Fifth' }, 300).state.players).toHaveLength(4);
    const result = handleDefusalMessage(startDefusal(state, 'local', 500).state, 'guest-1', { channel: 'last-light-v1', type: 'request' }, 600);
    expect(result.deliveries).toHaveLength(1); expect(result.deliveries[0].recipientId).toBe('guest-1');
    expect(result.deliveries[0].message.type).toBe('snapshot');
  });
  it('all private snapshots satisfy a strict role allowlist and reject extra hidden answers', () => {
    for (const delivery of defusalDeliveries(playing(), 2_000)) {
      expect(defusalMessageSchema.safeParse(delivery.message).success).toBe(true);
      expect(JSON.stringify(delivery.message)).not.toContain('"solution"');
      expect(defusalMessageSchema.safeParse({ ...delivery.message, answer: 'secret' }).success).toBe(false);
    }
    const view = projectDefusal(playing(), 'reader-0')!;
    expect(defusalMessageSchema.safeParse({ channel: 'last-light-v1', type: 'snapshot', recipientId: 'reader-0', hostNow: 2_000, view: { ...view, module: { ...view.module, device: playing().game.modules[0].device } } }).success).toBe(false);
  });
  it('rejects guest-authored snapshots, wrong-recipient delivery and older revisions', () => {
    const state = ready(playing());
    const delivery = defusalDeliveries(state, 3_000)[0];
    const options = { senderId: 'local', localNodeId: 'reader-0', hostId: 'local', raw: delivery.message };
    expect(acceptDefusalSnapshot(options)?.view.role).toBe('archivist');
    expect(acceptDefusalSnapshot({ ...options, senderId: 'reader-1' })).toBeUndefined();
    expect(acceptDefusalSnapshot({ ...options, localNodeId: 'reader-1' })).toBeUndefined();
    expect(acceptDefusalSnapshot({ ...options, current: { ...projectDefusal(state, 'reader-0')!, revision: 900 } })).toBeUndefined();
    expect(handleDefusalMessage(state, 'reader-0', delivery.message, 4_000).state).toBe(state);
  });
  it('roundtrips Expo Go and custom-scheme QR tickets without credentials or secrets', () => {
    for (const base of ['housewire://defusal', 'exp://192.168.1.9:8081/--/defusal', 'http://localhost:8081/defusal']) {
      const encoded = makeDefusalJoinTicket('ABC23', 'ws://192.168.1.9:8787', base);
      expect(parseDefusalJoinTicket(encoded)).toEqual({ code: 'ABC23', relayUrl: 'ws://192.168.1.9:8787' });
      expect(encoded).not.toContain('seed');
    }
    expect(parseDefusalJoinTicket('https://bad.test/race-join?c=ABC23&r=ws://bad.test:8787')).toBeUndefined();
  });
});

describe('Last Light persistence', () => {
  const identity = { localNodeId: 'local', sessionCode: 'ABC23', relayUrl: 'ws://localhost:8787', sessionMode: 'lan' };
  it('restores host progress from seed and validated fields, including elapsed deadline', () => {
    const state = solve(playing());
    const value = serializeDefusalRuntime({ authority: state, mode: 'live', code: 'ABC23', relayUrl: 'ws://localhost:8787', practiceRole: 'operator' }, 'local')!;
    expect(value).not.toContain('solution');
    expect(parseDefusalRuntime(value, identity, 4_000)?.authority).toEqual(state);
    expect(parseDefusalRuntime(value, identity, state.deadline! + 1)?.authority?.status).toBe('failed');
  });
  it('does not restore a former session or disclose host state into a guest identity', () => {
    const value = serializeDefusalRuntime({ authority: playing(), mode: 'live', code: 'ABC23', relayUrl: 'ws://localhost:8787', practiceRole: 'operator' }, 'local')!;
    expect(parseDefusalRuntime(value, { ...identity, sessionCode: 'NEW23' }, 4_000)).toBeUndefined();
    expect(parseDefusalRuntime(value, { ...identity, localNodeId: 'reader-0' }, 4_000)).toBeUndefined();
    expect(parseDefusalRuntime(value, { ...identity, sessionMode: 'preview' }, 4_000)).toBeUndefined();
  });
  it('saves guests as private role packets only and validates tampered/invalid data', () => {
    const state = playing();
    const guestView = projectDefusal(state, 'reader-0')!;
    const value = serializeDefusalRuntime({ guestView, mode: 'live', code: 'ABC23', relayUrl: 'ws://localhost:8787', practiceRole: 'operator' }, 'reader-0')!;
    expect(value).not.toContain('seed'); expect(value).not.toContain('solution');
    const restored = parseDefusalRuntime(value, { ...identity, localNodeId: 'reader-0' }, 3_000);
    expect(restored?.authority).toBeUndefined(); expect(restored?.guestView).toEqual(guestView);
    expect(parseDefusalRuntime('{bad', identity, 3_000)).toBeUndefined();
    expect(parseDefusalRuntime(JSON.stringify({ ...JSON.parse(value), authority: { seed: 1 } }), identity, 3_000)).toBeUndefined();
  });
  it('allows a practice run to restore without a live relay', () => {
    const state = playing(1, 'practice');
    const value = serializeDefusalRuntime({ authority: state, mode: 'practice', practiceRole: 'witness' }, 'local')!;
    expect(parseDefusalRuntime(value, { localNodeId: 'different', sessionMode: 'preview' }, 3_000)?.practiceRole).toBe('witness');
  });
  it('does not admit extra players after start and preserves existing reconnect roles', () => {
    const state = playing();
    expect(addDefusalPlayer(state, { id: 'late', name: 'Late' })).toBe(state);
    expect(addDefusalPlayer(state, { id: 'reader-0', name: 'Renamed' })).toBe(state);
  });
});
