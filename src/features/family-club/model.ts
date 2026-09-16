import { z } from 'zod';

export const CLUB_COLORS = ['#FFD166', '#6ED8C7', '#FF7657', '#B9A7F8', '#86C9F4', '#F5AFCB'] as const;
export const MODE_LABELS = { escape: 'Escape Cases', frequency: 'Family Frequency', race: 'Circuit Race', forge: 'Case Forge', defusal: 'Last Light' } as const;
export type ClubMode = keyof typeof MODE_LABELS;
const name = z.string().trim().min(1).max(40);
const count = z.number().int().nonnegative();
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
export const gameInputSchema = z.object({
  id: z.string().min(1).max(200),
  mode: z.enum(['escape', 'frequency', 'race', 'forge', 'defusal']),
  title: z.string().min(1).max(160),
  playedAt: date,
  durationSeconds: z.number().finite().nonnegative().optional(),
  practice: z.boolean(),
  legacy: z.boolean().optional(),
  source: z.enum(['ai', 'offline', 'authored']).optional(),
  rounds: count.optional(),
  hints: count.optional(),
  retries: count.optional(),
  caseId: z.string().optional(),
  participants: z.array(z.object({
    name,
    won: z.boolean(),
    team: z.string().max(40).optional(),
    score: z.number().finite().nonnegative().optional(),
    exact: count.optional(),
    guesses: count.optional(),
    elapsedSeconds: z.number().finite().nonnegative().optional(),
  })).max(12),
  standings: z.array(z.object({ label: name, value: z.string().max(50), won: z.boolean() })).max(12).optional(),
});
export type ClubGameInput = z.infer<typeof gameInputSchema>;
const memberSchema = z.object({ id: z.string(), name, aliases: z.array(z.string()), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), createdAt: date });
export type ClubMember = z.infer<typeof memberSchema>;
const gameSchema = gameInputSchema.extend({ participants: z.array(gameInputSchema.shape.participants.element.extend({ memberId: z.string() })) });
export type ClubGame = z.infer<typeof gameSchema>;
export interface ClubData { members: ClubMember[]; games: ClubGame[] }

export const nameKey = (value: string) => value.trim().replace(/\s+/g, ' ').normalize('NFKC').toLocaleLowerCase();
export const cleanName = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 40);
export function initials(value: string): string { return value.trim().split(/\s+/u).map((part) => Array.from(part)[0]).slice(0, 2).join('').toLocaleUpperCase(); }
export function memberForName(members: readonly ClubMember[], value: string): ClubMember | undefined {
  const key = nameKey(value);
  return members.find((member) => nameKey(member.name) === key || member.aliases.includes(key));
}
export function newMember(value: string, index: number, color?: string): ClubMember {
  return { id: `member-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, name: cleanName(value), aliases: [nameKey(value)], color: color ?? CLUB_COLORS[index % CLUB_COLORS.length], createdAt: new Date().toISOString() };
}

/** A game ID represents a single finish, independent of how often a result screen opens. */
export function insertGame(data: ClubData, raw: ClubGameInput): ClubData {
  const parsed = gameInputSchema.safeParse(raw);
  if (!parsed.success) return data;
  const input = parsed.data;
  const previous = data.games.find((game) => game.id === input.id);
  if (previous && (!previous.legacy || input.legacy)) return data;
  const members = [...data.members];
  const seen = new Set<string>();
  const participants = input.participants.flatMap((player) => {
    let member = memberForName(members, player.name);
    if (!member) { member = newMember(player.name, members.length); members.push(member); }
    if (seen.has(member.id)) return [];
    seen.add(member.id);
    return [{ ...player, memberId: member.id }];
  });
  const game = { ...input, participants };
  return { members, games: [game, ...data.games.filter((item) => item.id !== game.id)].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || a.id.localeCompare(b.id)) };
}

export function parseClubData(raw: string | null): ClubData {
  const empty = { members: [], games: [] };
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 1) return empty;
    const members: ClubMember[] = [];
    for (const item of Array.isArray(value.members) ? value.members : []) {
      const parsed = memberSchema.safeParse(item);
      if (parsed.success && !members.some((m) => m.id === parsed.data.id || nameKey(m.name) === nameKey(parsed.data.name))) members.push(parsed.data);
    }
    const games: ClubGame[] = [];
    for (const item of Array.isArray(value.games) ? value.games : []) {
      const parsed = gameSchema.safeParse(item);
      if (parsed.success && !games.some((g) => g.id === parsed.data.id)) {
        games.push({ ...parsed.data, participants: parsed.data.participants.filter((p) => members.some((m) => m.id === p.memberId)) });
      }
    }
    return { members, games: games.sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt)) };
  } catch { return empty; }
}

export interface ClubFilter { mode?: ClubMode; since?: number }
export function selectGames(games: readonly ClubGame[], filter: ClubFilter = {}): ClubGame[] {
  return games.filter((g) => (!filter.mode || g.mode === filter.mode) && (!filter.since || Date.parse(g.playedAt) >= filter.since));
}
export function countsForBoard(game: ClubGame): boolean {
  return !game.practice && !game.legacy && game.participants.length > 0 && (game.mode === 'defusal' || game.rounds === undefined || game.rounds > 0);
}
export function isCooperativeMode(mode: ClubMode): boolean { return mode === 'escape' || mode === 'forge' || mode === 'defusal'; }
export function isSharedVictory(game: ClubGame): boolean { return isCooperativeMode(game.mode) && game.participants.length > 0 && game.participants.every(player => player.won); }
export interface MemberStats {
  member: ClubMember; rank: number; games: number; wins: number; seconds: number; timedGames: number;
  exact: number; guesses: number; escapes: number; modes: Record<ClubMode, number>;
}
export function leaderboard(data: ClubData, filter: ClubFilter = {}): MemberStats[] {
  const games = selectGames(data.games, filter).filter(countsForBoard);
  const rows = data.members.map((member): MemberStats => {
    const row: MemberStats = { member, rank: 0, games: 0, wins: 0, seconds: 0, timedGames: 0, exact: 0, guesses: 0, escapes: 0, modes: { escape: 0, frequency: 0, race: 0, forge: 0, defusal: 0 } };
    for (const game of games) {
      const player = game.participants.find((p) => p.memberId === member.id);
      if (!player) continue;
      row.games++; row.wins += player.won ? 1 : 0; row.modes[game.mode]++;
      const duration = player.elapsedSeconds ?? game.durationSeconds;
      if (duration !== undefined) { row.seconds += duration; row.timedGames++; }
      row.exact += player.exact ?? 0; row.guesses += player.guesses ?? 0;
      if (isSharedVictory(game) && player.won) row.escapes++;
    }
    return row;
  }).sort((a, b) => b.wins - a.wins || a.member.name.localeCompare(b.member.name));
  let previousWins = -1;
  let rank = 0;
  let activeIndex = 0;
  for (const row of rows) {
    if (!row.games) continue;
    activeIndex++;
    if (row.wins !== previousWins) rank = activeIndex;
    row.rank = rank; previousWins = row.wins;
  }
  return rows;
}
export function weekStart(now = new Date()): number {
  const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.getTime();
}
export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
