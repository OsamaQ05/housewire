import type { CompiledEscapeCase } from '../../domain/escape-case-compiler';
import type { Line13Game } from '../../domain/line-13-game';
import { sealRiddle } from '../../domain/seal-riddles';
import { puzzleContext } from './guide-context';

const RULES = {
  'dead-air': ['Compare your private tone signatures and duct decoder to order the crew.', 'Scan the service plate held by the other player; ask the decoder which corrosion rule applies.', 'Caller sends a private word only to Receiver. The tuner opens the gate but cannot hear the message.', 'Compare the resonator order, mirror rule, and private glyph mappings to reconstruct the envelope.', 'Coordinate the voice levels with the tuner. Use the accessible input if the microphone is unavailable.'],
  'night-glass': ['Each player solves their own word seal. Once everyone is ready, unlock together.', 'Watcher, Frame and Hinge work together: scan the target, solve the hinge word seal, then describe the revealed bearing.', 'One phone has room names, another doorways, another the glass rotation. Describe your layer and build a connected route.', 'The courier scans the next anchor held on another phone. Ask teammates to identify the next stop.', 'Solve your word seal and coordinate the final unlock with the crew.'],
  'long-table': ['Compare the privately held objects and their clues. Arrange oldest to newest, then solve your word seal.', 'Each phone holds a photograph fragment. The rule-reader provides the order and the keeper enters the corresponding anchors.', 'Find the real-world object described in your prompt. A different family member checks and confirms it.', 'The courier solves a word seal and scans the next person’s place seal.', 'Solve your word seal, then coordinate the final voice action with the crew.'],
} as const;

/** Explicit role/stage filters: no solutions, seeds, future rounds, or whole compiled games. */
export function escapeGuideContext(game: CompiledEscapeCase, stage: number, node: string, completed: readonly string[]) {
  const clues: string[] = [];
  const addSeal = (pose: string, round?: number) => clues.push(`Your word seal: ${sealRiddle(`${game.effectiveSeed}:${stage}:${node}${round !== undefined ? `:${round}` : ''}:${pose}`).clue}`);
  if (game.id === 'night-glass') {
    if (stage === 0 || stage === 4) {
      const a = (stage === 0 ? game.threshold : game.finale).assignments.find(a => a.nodeId === node);
      if (a) addSeal(a.pose);
    }
    if (stage === 1) {
      const r = game.parallaxRounds.find(r => !completed.includes(`parallax:${r.round}`));
      if (r) {
        if (r.targetClueOwnerNodeId === node) clues.push(`Target glyph clue: ${r.targetGlyph}`);
        if (r.hingeNodeId === node) addSeal(r.requiredPose, r.round);
      }
    }
    if (stage === 2) {
      const m = game.maze;
      if (m.wallLayerOwnerNodeId === node) clues.push(`Your doorway layer: ${m.edges.map(e => e.join(' ↔ ')).join('; ')}. Coordinates are internal; explain using the player's room names.`);
      if (m.transformDecoderOwnerNodeId === node) clues.push(`Glass rotation: ${m.wallLayerRotation} degrees.`);
      if (m.startExitOwnerNodeId === node) clues.push(`Start position ${m.startCell}; exit position ${m.exitCell}.`);
    }
  } else if (game.id === 'long-table') {
    if (stage === 0) { clues.push(...game.artifacts.filter(a => a.ownerNodeId === node).map(a => `${a.id}: ${a.clue}`)); addSeal('FLAT'); }
    if (stage === 1) {
      clues.push(...game.photograph.fragments.filter(f => f.ownerNodeId === node).map(f => `Photo fragment: ${f.anchor} at ${f.position}`));
      if (game.photograph.ruleOwnerNodeId === node) clues.push(`Read positions in this order: ${game.photograph.readOrder.join(', ')}`);
    }
    if (stage === 2) {
      const r = game.keepsakes.find(r => !completed.includes(`keepsake:${r.round}`));
      if (r && (r.seekerNodeId === node || r.witnessNodeId === node)) clues.push(r.prompt);
    }
    if (stage === 3) { const r = game.serviceRoute.find(r => !completed.includes(`pass:${r.step}`)); if (r?.courierNodeId === node) addSeal(r.requiredPose, r.step); }
    if (stage === 4) { const a = game.finale.assignments.find(a => a.nodeId === node); if (a) addSeal(a.pose); }
  } else if (stage === 0) {
    for (const clue of game.ductClues) {
      if (clue.clueOwnerNodeId === node) clues.push(`Your tone signature: ${clue.signature.join(', ')}`);
      if (clue.decoderOwnerNodeId === node) clues.push(`Your decoder maps ${clue.signature.join(', ')} to duct ${clue.duct}`);
    }
  } else if (stage === 3) {
    clues.push(...game.echoMatrix.mappings.filter(m => m.decoderOwnerNodeId === node).map(m => `Your mapping: ${m.glyph} → ${m.level}`));
  }
  return puzzleContext(game.id, RULES[game.id][stage] ?? 'Compare your current clues.', 'Current player', clues, `Stage ${stage + 1}. ${completed.length} proofs collected. Some live screen details may be missing; ask a focused question rather than inventing them.`);
}

export function lineGuideContext(game: Line13Game, kind: string, node: string, title: string, objective: string) {
  const clues: string[] = [];
  if (kind === 'cipher') {
    for (const f of game.cipherFragments.filter(f => f.nodeId === node)) clues.push(...f.positions.map(p => `Position ${p.index}: ${p.glyph}`));
    for (const f of game.decoderFragments.filter(f => f.nodeId === node)) clues.push(...f.mappings.map(m => `${m.glyph} → ${m.digit}`));
  }
  if (kind === 'route') for (const s of game.routeScraps.filter(s => s.nodeId === node)) clues.push(`Incoming ${s.incoming}; solid exit ${s.solidExit}; broken exit ${s.brokenExit}.`);
  return puzzleContext(title, objective, 'Current player', clues, 'Only this phone’s clue fragments are available. Ask teammates to describe the missing information.');
}
