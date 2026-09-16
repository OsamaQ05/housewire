import type { CompiledEscapeCase } from './escape-case-compiler';
import { sealRiddle } from './seal-riddles';
import type { AnswerReviewItem } from '../components/AnswerReview';

/** Must only be called after the cooperative case ends; never feed these into the guide. */
export function escapeAnswerReview(game: CompiledEscapeCase, failedStage: number): AnswerReviewItem[] {
  const items: AnswerReviewItem[] = [];
  const add = (stage: number, title: string, answer: string, explanation?: string) => { if (stage >= failedStage) items.push({ title, answer, explanation }); };
  const seals = (stage: number, entries: readonly { nodeId: string; pose: string }[]) => entries.map(a => {
    const riddle = sealRiddle(`${game.effectiveSeed}:${stage}:${a.nodeId}:${a.pose}`);
    return `${riddle.clue} → ${riddle.answers[0]}`;
  }).join('\n');
  if (game.id === 'dead-air') {
    add(0, 'Three ducts', game.ductOrder.map(id => `Player ${game.nodeIds.indexOf(id) + 1}`).join(' → '), 'Match each tone signature with the duct decoder, then arrange the crew by duct.');
    add(1, 'Service plates', game.serviceScans.map(r => `Plate ${r.step}: ${r.liveValve}`).join(' · '));
    add(2, 'Private words', game.privateChannel.rounds.map(r => `${r.round}: ${r.codeword} (${r.gate})`).join(' · '));
    add(3, 'Echo matrix', game.echoMatrix.envelope.join(' → '), 'Combine the glyph mappings with the resonator ordering and mirror rule.');
    add(4, 'Countertone', game.countertone.beats.map(b => `${b.beat}: ${b.level}`).join(' → '), game.countertone.tunerNodeId ? seals(4, [{ nodeId: game.countertone.tunerNodeId, pose: game.countertone.tunerPose }]) : undefined);
  } else if (game.id === 'night-glass') {
    add(0, 'Threshold word seals', seals(0, game.threshold.assignments));
    add(1, 'Parallax doors', game.parallaxRounds.map(r => `Door ${r.round}: ${r.targetGlyph} → ${r.revealedBearing}; word: ${sealRiddle(`${game.effectiveSeed}:1:${r.hingeNodeId}:${r.round}:${r.requiredPose}`).answers[0]}`).join('\n'));
    const rooms = ['', 'LANTERN', 'MIRROR', 'BELL', 'KEY', 'EYE', 'BOOK', 'CLOCK', 'DOOR', 'MOON'];
    add(2, 'Impossible floorplan', game.maze.path.map(cell => rooms[cell] ?? String(cell)).join(' → '), `Combine the door layer with the ${game.maze.wallLayerRotation}° glass rotation.`);
    add(3, 'Corridor', game.corridor.anchorSteps.map(s => `Anchor ${s.step}: Player ${game.nodeIds.indexOf(s.anchorOwnerNodeId) + 1}`).join(' → '));
    add(4, 'Final fold', seals(4, game.finale.assignments));
  } else {
    add(0, 'Take your places', game.artifactOrder.join(' → '), `The timeline runs from oldest to newest.\n${seals(0, game.nodeIds.map(nodeId => ({ nodeId, pose: 'FLAT' })))}`);
    add(1, 'Stolen photograph', game.photograph.readOrder.map(p => game.photograph.fragments.find(f => f.position === p)?.anchor ?? p).join(' → '));
    add(2, 'What the house kept', game.keepsakes.map(r => `${r.round}: ${r.prompt}`).join('\n'), 'These are open-ended real objects, not one fixed answer. Another player must inspect the object.');
    add(3, 'Service pass', game.serviceRoute.map(r => `Pass ${r.step}: Player ${game.nodeIds.indexOf(r.stationOwnerNodeId) + 1}; word: ${sealRiddle(`${game.effectiveSeed}:3:${r.courierNodeId}:${r.step}:${r.requiredPose}`).answers[0]}`).join('\n'));
    add(4, 'Last bell', seals(4, game.finale.assignments), game.finale.assignments.map((a, i) => `Player ${i + 1} voice: ${a.voiceLevel}`).join(' · '));
  }
  return items;
}
