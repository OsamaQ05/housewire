import type { DefusalView } from '../../domain/defusal/types';
import type { ForgePlayerStage, ForgeStage } from '../../domain/case-forge/types';
import type { CircuitRaceDisplayStage } from '../race/course-projection';
import type { GuideContext } from './guide-domain';

/** Bounded display text only. Callers must explicitly select fields, not pass whole games. */
export function puzzleContext(title: string, objective: string, role: string, clues: readonly string[], progress = ''): GuideContext {
  return { title: title.slice(0, 200), objective: objective.slice(0, 1200), role: role.slice(0, 100), clues: clues.slice(0, 20).map(clue => clue.slice(0, 1800)), progress: progress.slice(0, 1000) };
}

export function defusalGuideContext(view: DefusalView): GuideContext {
  const module = view.module;
  const clues: string[] = [];
  if (module?.device) {
    const d = module.device;
    clues.push(d.instruction, `Choose ${d.selectionCount} items${d.ordered ? ' in order' : ''}.`);
    if (d.indicator) clues.push(`Device indicator: ${d.indicator}`);
    clues.push(`Visible options (NOT a solution): ${d.options.map(o => `${o.label}${o.detail ? ` (${o.detail})` : ''}`).join(', ')}`);
    if (d.edges) clues.push(`Visible connections: ${d.edges.map(edge => edge.map(id => d.options.find(o => o.id === id)?.label ?? id).join(' ↔ ')).join('; ')}`);
    if (d.start) clues.push(`Route starts at ${d.start}; ends at ${d.end}.`);
  }
  for (const paper of [module?.manual, module?.witness]) if (paper) clues.push(paper.heading, ...paper.lines);
  return puzzleContext(`Last Light · ${module?.title ?? 'Waiting room'}`, module?.objective ?? 'Work with your crew to restore the lighthouse.', view.role, clues,
    `Module ${view.stageIndex + 1}/${view.moduleCount}. ${view.strikes}/${view.maxStrikes} strikes. ${view.mode === 'practice' ? 'Solo: switch seats to read the other roles.' : `${view.readyNodeIds.length}/${view.players.length - 1} readers ready. Each non-operator must tap “I’ve shared my clues” every module before Lock unlocks.`} ${view.feedback ?? ''}`);
}

export function forgeGuideContext(stage: ForgeStage | ForgePlayerStage, playerId: string): GuideContext {
  const clues = stage.clues.filter(c => !c.private || c.audiencePlayerIds.includes(playerId)).map(c => {
    const p = c.payload;
    switch (p.kind) {
      case 'text': case 'riddle-fragment': return `${c.title}: ${p.text}`;
      case 'sequence': return `${c.title}: ${p.items.join(', ')}`;
      case 'mapping': return `${c.title}: ${p.pairs.map(pair => `${pair.left} → ${pair.right}`).join('; ')}`;
      case 'grid-edges': return `${c.title}: visible doorways ${p.edges.map(edge => edge.join(' ↔ ')).join('; ')}`;
      case 'audio-token': return `${c.title}: private audio is available to replay. Ask the player to describe what they heard.`;
      case 'camera-marker': case 'camera-scanner': return `${c.title}: camera clue shows ${p.symbol}. Scan the matching teammate's marker. Do not invent scanned content.`;
      case 'camera-display': return `${c.title}: show this marker to the scanning teammate.`;
      case 'pose': return `${c.title}: use the on-screen word seal; no directional movements are required.`;
    }
  });
  return puzzleContext(stage.title, `${stage.storyBeat} ${stage.instruction}`, 'Current clue-holder', clues, 'Only current-role clues are supplied. Ask teammates for missing information.');
}

export function raceGuideContext(stage: CircuitRaceDisplayStage): GuideContext {
  const c = stage.challenge;
  const clues: string[] = [];
  if (stage.mechanic === 'sequence-cipher') {
    const sc = stage.challenge;
    if ('panels' in sc) clues.push(...sc.panels.map(p => `Clue ${p.pulseOrder}: ${p.clue}`)); // NEVER include panel.glyph (riddle answer).
    if ('cipherWheel' in sc) clues.push(`Available objects: ${sc.cipherWheel.map(p => p.glyph).join(', ')}. Enter one for each spoken clue, in order.`);
  } else if (stage.mechanic === 'flat-phone') {
    if ('tiltSequence' in c && c.tiltSequence) clues.push(...c.tiltSequence.map((signal, i) => `Verse ${i + 1}: ${signalVerse(signal)}`));
    clues.push('Listen to the three verses and tap the three matching symbols in order. This is a riddle lock, not a phone movement task.');
  } else if (stage.mechanic === 'knock-pattern') clues.push('One station replays the sound; the other reconstructs the short/long rhythm. Ask the listener to describe it. Do not claim to have heard the audio.');
  else clues.push('Use the fragments earned by completing the earlier stations to assemble the final breaker. Ask the player which rule is confusing, not for a guess to validate.');
  return puzzleContext(stage.title, stage.instruction, 'station' in c ? c.station : 'Runner', clues, `Race station ${stage.index + 1}. Wrong attempts add time.`);
}

export function signalVerse(signal: string): string {
  switch (signal) {
    case 'TILT_LEFT': return 'I have no hands, yet I pull a garden awake. Look straight at me and your eyes complain.';
    case 'TILT_RIGHT': return 'My shape seems to change, but none of me is lost. I borrow all the light I wear.';
    case 'TIP_FORWARD': return 'I race toward the shore but never leave the sea. The wind writes my shape, then erases it.';
    case 'TIP_BACK': return 'I am born for a blink when two wires disagree. One of me can wake a sleeping fire.';
    default: return 'Ask your teammate to read the verse.';
  }
}
