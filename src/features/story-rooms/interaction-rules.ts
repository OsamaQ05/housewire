import type { StoryInteraction } from './interaction-types';
import type { StoryOption, StoryStage } from './types';
import { isActivityKind } from './activities/contracts';

type BoardStage = Pick<StoryStage, 'slots' | 'options' | 'interaction'>;

/** Glass is already on the light table. Every piece can rotate immediately. */
export function initialStoryDraft(stage: BoardStage): string[] {
  if (isActivityKind(stage.interaction?.kind)) return [];
  return stage.slots.map((_, slot) => stage.interaction?.kind === 'lightbox'
    ? optionsForSlot(stage, slot).find(option => option.turn === 0)?.id ?? ''
    : '');
}

export function optionsForSlot(stage: Pick<StoryStage, 'slots' | 'options'>, slot: number): StoryOption[] {
  const control = stage.slots[slot];
  if (!control) return [];
  return control.optionIds ? stage.options.filter(option => control.optionIds!.includes(option.id)) : stage.options;
}

export function allowsStoryChoice(stage: Pick<StoryStage, 'slots' | 'options'>, slot: number, value: string): boolean {
  return Boolean(stage.slots[slot]) && (value === '' || optionsForSlot(stage, slot).some(option => option.id === value));
}

export function rotateFilm(cells: readonly number[], turns: number): number[] {
  return cells.map(cell => {
    let x = cell % 5; let y = Math.floor(cell / 5);
    for (let turn = 0; turn < ((turns % 4) + 4) % 4; turn++) [x, y] = [4 - y, x];
    return y * 5 + x;
  }).sort((a, b) => a - b);
}

export function filmComposite(stage: BoardStage, draft: readonly string[]): number[] {
  if (stage.interaction?.kind !== 'lightbox') return [];
  return [...new Set(stage.interaction.films.flatMap((film, i) => {
    const option = optionsForSlot(stage, i).find(option => option.id === draft[i]);
    return option?.turn === undefined ? [] : rotateFilm(film, option.turn);
  }))].sort((a, b) => a - b);
}

export function pipePorts(stage: BoardStage, draft: readonly string[], cell: number): number[] {
  if (stage.interaction?.kind !== 'pipe-grid') return [];
  const turn = optionsForSlot(stage, cell).find(option => option.id === draft[cell])?.turn;
  const ports = stage.interaction.tiles[cell];
  if (turn === undefined || !ports || ports.some(port => port < 0)) return [];
  return ports.map(edge => (edge + turn) % 4);
}

export function tracePipe(stage: BoardStage, draft: readonly string[]): { cells: number[]; connected: boolean } {
  const model = stage.interaction;
  if (model?.kind !== 'pipe-grid') return { cells: [], connected: false };
  const cells: number[] = [];
  let cell = model.source.cell; let entry = model.source.edge;
  while (cell >= 0 && cell < 4 && !cells.includes(cell)) {
    const ports = pipePorts(stage, draft, cell);
    if (ports.length !== 2 || !ports.includes(entry)) return { cells, connected: false };
    cells.push(cell);
    const exit = ports.find(edge => edge !== entry)!;
    if (cell === model.target.cell && exit === model.target.edge) return { cells, connected: cells.length === 4 };
    const x = cell % 2; const y = Math.floor(cell / 2);
    const nx = x + (exit === 1 ? 1 : exit === 3 ? -1 : 0);
    const ny = y + (exit === 2 ? 1 : exit === 0 ? -1 : 0);
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return { cells, connected: false };
    cell = ny * 2 + nx; entry = (exit + 2) % 4;
  }
  return { cells, connected: false };
}

export function satisfiesInteraction(stage: BoardStage, draft: readonly string[]): boolean {
  // Physical activities are validated from their structured state, never an empty answer array.
  if (isActivityKind(stage.interaction?.kind)) return false;
  if (stage.interaction?.kind === 'route-map') {
    const { edges } = stage.interaction;
    return draft.length === stage.slots.length && draft.every((id, index) =>
      Boolean(id) && (index === 0 || edges.some(([a, b]) => (a === draft[index - 1] && b === id) || (b === draft[index - 1] && a === id))));
  }
  if (stage.interaction?.kind === 'pipe-grid') return tracePipe(stage, draft).connected;
  if (stage.interaction?.kind === 'lightbox') {
    const target = [...new Set(stage.interaction.target)].sort((a, b) => a - b);
    return JSON.stringify(filmComposite(stage, draft)) === JSON.stringify(target);
  }
  return true;
}

/** Share progress, not another station's hidden pipe or transparency. */
export function projectInteraction(model: StoryInteraction | undefined, owned: readonly number[], open: boolean): StoryInteraction | undefined {
  if (!model || open) return model;
  if (model.kind === 'pipe-grid') return { ...model, tiles: model.tiles.map((tile, i) => owned.includes(i) ? tile : [-1, -1]) };
  if (model.kind === 'lightbox') return { ...model, films: model.films.map((film, i) => owned.includes(i) ? film : []) };
  return model;
}

export function interactionIssues(stage: StoryStage): string[] {
  const issues: string[] = [];
  const model = stage.interaction;
  for (const slot of stage.slots) if (slot.optionIds && (!slot.optionIds.length || slot.optionIds.length > 6 || new Set(slot.optionIds).size !== slot.optionIds.length || slot.optionIds.some(id => !stage.options.some(option => option.id === id)))) issues.push('Control choices must reference 1–6 distinct options.');
  if (!model) return issues;
  if (stage.slots.length !== 4) issues.push('Interactive boards need four shared stations.');
  if (model.kind === 'pipe-grid' || model.kind === 'lightbox') {
    for (let i = 0; i < stage.slots.length; i++) {
      const choices = optionsForSlot(stage, i);
      if (!stage.slots[i].optionIds || choices.length !== 4 || new Set(choices.map(option => option.turn)).size !== 4 || choices.some(option => !Number.isInteger(option.turn) || option.turn! < 0 || option.turn! > 3)) issues.push('Each rotating station needs its own four quarter-turn choices.');
    }
  }
  if (model.kind === 'pipe-grid') {
    if (model.tiles.length !== 4 || model.tiles.some(tile => tile.length !== 2 || new Set(tile).size !== 2 || tile.some(edge => !Number.isInteger(edge) || edge < 0 || edge > 3))) issues.push('Pipe tiles need two different valid edges.');
    const outside = ({ cell, edge }: { cell: number; edge: number }) => Number.isInteger(cell) && cell >= 0 && cell < 4 && ((edge === 0 && cell < 2) || (edge === 1 && cell % 2 === 1) || (edge === 2 && cell >= 2) || (edge === 3 && cell % 2 === 0));
    if (!outside(model.source) || !outside(model.target)) issues.push('Pipe inlet and outlet must be on outside edges.');
  }
  if (model.kind === 'lightbox') {
    const valid = (cells: number[]) => cells.length > 0 && cells.length <= 25 && new Set(cells).size === cells.length && cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 25);
    if (model.films.length !== 4 || model.films.some(film => !valid(film)) || !valid(model.target) || model.colors.length !== 4 || model.colors.some(color => !/^#[0-9a-f]{6}$/i.test(color))) issues.push('Lightbox needs four valid colored masks and one target.');
  }
  if ((model.kind === 'workbench' || model.kind === 'control-console') && (model.sites.length !== 4 || model.sites.some(site => !site.label.trim() || !site.description.trim()))) issues.push('The board needs four named stations.');
  if (model.kind === 'route-map') {
    const ids = model.nodes.map(node => node.id);
    if (new Set(ids).size !== ids.length || stage.options.some(option => !ids.includes(option.id)) || model.nodes.some(node => !node.label.trim() || !Number.isFinite(node.x) || !Number.isFinite(node.y) || node.x < 0 || node.x > 100 || node.y < 0 || node.y > 100)) issues.push('The route map needs named, positioned nodes for each option.');
    if (!model.edges.length || model.edges.some(([a, b]) => a === b || !ids.includes(a) || !ids.includes(b))) issues.push('Every corridor must join two different map locations.');
  }
  return issues;
}
