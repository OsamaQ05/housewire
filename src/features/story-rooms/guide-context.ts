import { puzzleContext } from '../director/guide-context';
import type { GuideMechanic } from '../director/guide-domain';
import { pipePorts, rotateFilm } from './interaction-rules';
import type { StoryPlayerView, StoryStage, StoryState } from './types';
import { isActivityKind } from './activities/contracts';
import { activitySummary } from './activities/registry';

/** The visible interaction, not a legacy story tag, determines useful guide suggestions. */
export function storyGuideMechanic(stage: Pick<StoryStage, 'kind' | 'interaction'>): GuideMechanic {
  const interaction = stage.interaction;
  if (isActivityKind(interaction?.kind)) return interaction.kind === 'tool-search' ? 'deduction' : 'coordination';
  if (interaction?.kind === 'table-scene') return interaction.mode === 'riddles' ? 'riddle' : 'deduction';
  if (interaction?.kind === 'lightbox') return 'coordination';
  if (interaction?.kind === 'route-map' || interaction?.kind === 'pipe-grid') return 'route';
  if (interaction?.kind === 'patch-panel' || interaction?.kind === 'workbench' || interaction?.kind === 'control-console') return 'deduction';
  if (stage.kind === 'rhythm') return 'audio';
  if (stage.kind === 'sequence') return 'sequence';
  if (stage.kind === 'map' || stage.kind === 'circuit' || stage.kind === 'routing') return 'route';
  return 'deduction';
}

/** Explicit projection: no hidden evidence, raw answers, future stages, seed, or player identities. */
export function storyGuideContext(state: StoryState, view: StoryPlayerView, revealedLensIds: readonly string[], stageCount: number) {
  const visibleClues = view.stage.clues.filter(clue => clue.medium !== 'lens' || revealedLensIds.includes(clue.id));
  const model = view.stage.interaction;
  const visual = state.activity && state.activity.kind === model?.kind ? activitySummary(state.activity, view.ownedSlots) : view.ownedSlots.flatMap(slot => {
    const name = view.stage.slots[slot].label;
    const selected = view.stage.options.find(option => option.id === state.draft[slot]);
    if (model?.kind === 'pipe-grid') {
      const edges = pipePorts(view.stage, state.draft, slot);
      const shown = edges.length ? edges : model.tiles[slot];
      return [`My ${name} pipe has open ends at ${shown.map(edge => ['top', 'right', 'bottom', 'left'][edge]).join(' and ')}. ${selected ? 'This orientation is set.' : 'It is displayed in its starting orientation; not set yet.'}`];
    }
    if (model?.kind === 'lightbox') {
      const coordinates = rotateFilm(model.films[slot], selected?.turn ?? 0).map(cell => `row ${Math.floor(cell / 5) + 1} column ${cell % 5 + 1}`).join('; ');
      return [`My ${name} glass marks: ${coordinates}. Only this player's layers are shown here.`];
    }
    return [`My ${name} control: ${selected?.label ?? 'not set'}.`];
  });
  return puzzleContext(`${view.room.title} · ${view.stage.title}`, `${view.stage.objective} ${view.stage.instruction}`, view.roleNames.join(' / '),
    [...visual, ...visibleClues.flatMap(clue => [clue.title, ...clue.lines, ...(clue.observations?.filter(observation => observation.probeId === state.activeProbe).flatMap(observation => observation.lines) ?? [])])],
    `Chapter ${state.stageIndex + 1}/${stageCount}. Each person controls only their marked station. ${isActivityKind(model?.kind) ? 'This is a shared physical activity. Moves and progress checks do not spend attempts. Explain visible controls and encourage comparing observations. Do not provide a complete move sequence, reveal undiscovered items, or describe another player’s private view.' : model?.kind === 'lightbox' ? 'This is cooperative picture-making, not a riddle. Every layer starts placed and can rotate either way immediately; picture checks are free. Help people understand the buttons and compare visible shapes, never prescribe the final angles.' : `${state.assistedStages.length ? state.chapterAttemptsUsed : state.attemptsUsed}/${view.room.attemptLimit} attempts used ${state.assistedStages.length ? 'in this chapter; untimed assisted exploration' : 'in this case'}.`} Explain the interaction in simple language. Do not solve or confirm a proposed answer. Other phones have private evidence not included here.`);
}
