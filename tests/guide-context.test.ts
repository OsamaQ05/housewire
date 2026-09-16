import { describe, expect, it } from 'vitest';
import { createDefusalState, projectDefusal, startDefusal } from '../src/domain/defusal';
import { generateOfflineForgeCase } from '../src/domain/case-forge';
import { defusalGuideContext, forgeGuideContext, puzzleContext, raceGuideContext } from '../src/features/director/guide-context';
import { guideContextSchema, makeGuideRequest, parseGuideHistory } from '../src/features/director/guide-domain';
import { STORY_ROOMS } from '../src/features/story-rooms/catalog';
import { storyGuideMechanic } from '../src/features/story-rooms/guide-context';

describe('current-role guide context', () => {
  it('selects useful guide suggestions from the actual interaction in all thirteen authored chapters', () => {
    expect(Object.fromEntries(STORY_ROOMS.flatMap(room => room.stages.map(stage => [stage.id, storyGuideMechanic(stage)])))).toEqual({
      callers: 'deduction',
      'rescue-route': 'route',
      intervention: 'coordination',
      'last-delivery': 'coordination',
      'clockwork-parade': 'coordination',
      'night-glass-negative': 'coordination',
      'night-glass-passage': 'deduction',
      'night-glass-courtyard': 'coordination',
      'night-glass-watermark': 'deduction',
      'long-table-guests': 'deduction',
      'long-table-marble': 'coordination',
      'long-table-serving': 'coordination',
      'long-table-shadows': 'coordination',
    });
  });
  it('keeps legacy mechanics as fallbacks without overriding a newer board', () => {
    expect(storyGuideMechanic({ kind: 'rhythm' })).toBe('audio');
    expect(storyGuideMechanic({ kind: 'sequence' })).toBe('sequence');
    expect(storyGuideMechanic({ kind: 'map' })).toBe('route');
    expect(storyGuideMechanic({ kind: 'routing', interaction: { kind: 'table-scene', mode: 'envelopes' } })).toBe('deduction');
    expect(storyGuideMechanic({ kind: 'circuit', interaction: { kind: 'patch-panel' } })).toBe('deduction');
  });
  it('sends actual Last Light clues and readiness, without other roles or the answer key', () => {
    const room = createDefusalState({ id: 'test', hostId: 'host', seed: 749, mode: 'live', players: [{ id: 'host', name: 'Secret Name' }, { id: 'reader', name: 'Other Name' }, { id: 'witness', name: 'Hidden Name' }] });
    const state = startDefusal(room, 'host', 1000).state;
    const operator = defusalGuideContext(projectDefusal(state, 'host')!);
    const witness = defusalGuideContext(projectDefusal(state, 'witness')!);
    expect(operator.progress).toContain('0/2 readers ready');
    expect(operator.clues.join(' ')).not.toContain(state.game.modules[0].witness.lines[0]);
    expect(witness.clues).toContain(state.game.modules[0].witness.lines[0]);
    expect(JSON.stringify(operator)).not.toMatch(/Secret Name|Other Name|Hidden Name|"solution"|"seed"/);
    expect(guideContextSchema.safeParse(operator).success).toBe(true);
  });
  it('filters forged clues by audience even in solo mode', () => {
    const game = generateOfflineForgeCase({ seed: 'guide-test', generatedAt: 1000, playerIds: ['a', 'b', 'c'], difficulty: 3, targetMinutes: 30, tone: 'mystery', intensity: 'balanced', safeMovement: true, noiseAllowed: true });
    const stage = { ...game.stages[0], clues: [
      { id: 'own', title: 'Mine', audiencePlayerIds: ['a'], private: true, payload: { kind: 'text' as const, text: 'VISIBLE_CLUE' } },
      { id: 'other', title: 'Other', audiencePlayerIds: ['b'], private: true, payload: { kind: 'text' as const, text: 'HIDDEN_CLUE' } },
    ] };
    const context = forgeGuideContext(stage, 'a');
    expect(context.clues).toContain('Mine: VISIBLE_CLUE');
    expect(JSON.stringify(context)).not.toContain('HIDDEN_CLUE');
    expect(JSON.stringify(context)).not.toContain('"solution"');
  });
  it('sends race riddles without their hidden glyph answer field', () => {
    const context = raceGuideContext({ id: 'relay-order', index: 0, mechanic: 'sequence-cipher', title: 'Riddles', instruction: 'Read in order', difficulty: 1, estimatedSeconds: 30, kicker: 'Test', hints: [], challenge: { station: 'PLATES', readingRule: 'LOWEST_PULSE_FIRST', panels: [{ panelId: 'p', pulseOrder: 1, glyph: 'KEY', clue: 'I turn but never walk.' }] } });
    expect(context.clues).toEqual(['Clue 1: I turn but never walk.']);
    expect(JSON.stringify(context)).not.toContain('KEY');
  });
  it('bounds supplied screen data and recent conversation', () => {
    const context = puzzleContext('t'.repeat(500), 'o'.repeat(2000), 'r'.repeat(200), Array(30).fill('c'.repeat(3000)));
    expect(guideContextSchema.safeParse(context).success).toBe(true);
    expect(makeGuideRequest('Hi', 'defusal', [], context, Array(20).fill({ question: 'Hi', reply: 'Hello' })).history).toHaveLength(6);
  });
  it('persists actual GPT wording and still reads legacy history', () => {
    const message = { id: '1', question: 'How?', intent: 'explain', source: 'ai', reply: 'Compare the badge with the rule before choosing.' };
    expect(parseGuideHistory(JSON.stringify([message]))[0].reply).toBe(message.reply);
    const { reply: _reply, ...legacy } = message;
    expect(parseGuideHistory(JSON.stringify([legacy]))).toHaveLength(1);
  });
});
