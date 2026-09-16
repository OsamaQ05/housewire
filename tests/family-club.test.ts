import { describe, expect, it } from 'vitest';
import { countsForBoard, insertGame, isSharedVictory, leaderboard, parseClubData, selectGames, weekStart, type ClubData, type ClubGameInput } from '../src/features/family-club/model';
import { escapeRecord, frequencyRecord, oldFrequencyRecord, raceRecord } from '../src/features/family-club/records';
import { advanceFamilyTriviaQuestion, createFamilyTriviaSession, createQuickFamilyTriviaSetup, generateOfflineFamilyTriviaPack, revealFamilyTriviaQuestion, submitFamilyTriviaGuess, submitFamilyTriviaReference, type FamilyTriviaAnswer } from '../src/domain/family-trivia';

const empty = (): ClubData => ({ members: [], games: [] });
const game = (overrides: Partial<ClubGameInput> = {}): ClubGameInput => ({ id: 'one', mode: 'escape', title: 'Line 13', playedAt: '2026-09-11T12:00:00Z', durationSeconds: 180, practice: false, participants: [{ name: 'Osama', won: true }, { name: 'Feras', won: true }], ...overrides });

describe('Family Club records and standings', () => {
  it('records Last Light wins as shared victories and restores the new mode', () => {
    const data = insertGame(empty(), game({ mode: 'defusal', title: 'Last Light', rounds: 3 }));
    expect(data.games).toHaveLength(1);
    expect(isSharedVictory(data.games[0])).toBe(true);
    expect(leaderboard(data, { mode: 'defusal' }).map(p => [p.games, p.wins, p.escapes, p.modes.defusal])).toEqual([[1, 1, 1, 1], [1, 1, 1, 1]]);
    expect(parseClubData(JSON.stringify({ version: 1, ...data })).games[0].mode).toBe('defusal');
  });
  it('counts a failed defusal as a played game, never a shared victory—even at zero modules', () => {
    const data = insertGame(empty(), game({ mode: 'defusal', title: 'Last Light', rounds: 0, participants: [{ name: 'Osama', won: false }, { name: 'Feras', won: false }] }));
    expect(countsForBoard(data.games[0])).toBe(true);
    expect(isSharedVictory(data.games[0])).toBe(false);
    expect(leaderboard(data).map(p => [p.games, p.wins, p.escapes])).toEqual([[1, 0, 0], [1, 0, 0]]);
  });
  it('retains Last Light practice without leaderboard credit', () => {
    const data = insertGame(empty(), game({ mode: 'defusal', practice: true }));
    expect(countsForBoard(data.games[0])).toBe(false);
    expect(leaderboard(data).every(p => p.games === 0 && p.wins === 0 && p.escapes === 0)).toBe(true);
  });
  it('records each finish only once, including repeated result visits', () => {
    const first = insertGame(empty(), game());
    expect(insertGame(first, game())).toBe(first);
    expect(leaderboard(first).map((p) => p.wins)).toEqual([1, 1]);
  });
  it('gives co-op players a shared rank, with normal competition ranking after ties', () => {
    let data = insertGame(empty(), game());
    data = insertGame(data, game({ id: 'two', participants: [{ name: 'Mohammed', won: false }] }));
    expect(leaderboard(data).map((p) => p.rank)).toEqual([1, 1, 3]);
  });
  it('keeps practice and unscored rounds in history, without competitive stats', () => {
    let data = insertGame(empty(), game({ practice: true }));
    data = insertGame(data, game({ id: 'skip', mode: 'frequency', rounds: 0 }));
    expect(data.games).toHaveLength(2);
    expect(data.games.every((g) => !countsForBoard(g))).toBe(true);
    expect(leaderboard(data).every((p) => p.games === 0 && p.wins === 0)).toBe(true);
  });
  it('normalizes names and keeps stats through a renamed profile alias', () => {
    const data = insertGame(empty(), game({ participants: [{ name: '  Osama  ', won: true }] }));
    data.members[0].name = 'Oss'; data.members[0].aliases.push('oss');
    const next = insertGame(data, game({ id: 'two', participants: [{ name: 'OSAMA', won: true }] }));
    expect(next.members).toHaveLength(1);
    expect(leaderboard(next)[0]).toMatchObject({ wins: 2, member: { name: 'Oss' } });
  });
  it('does not double-count one player listed twice in a receipt', () => {
    const data = insertGame(empty(), game({ participants: [{ name: 'Osama', won: true }, { name: 'osama', won: true }] }));
    expect(data.games[0].participants).toHaveLength(1);
  });
  it('filters each mode and week without mixing scores from incompatible games', () => {
    let data = insertGame(empty(), game({ playedAt: '2026-09-01T12:00:00Z' }));
    data = insertGame(data, game({ id: 'two', mode: 'frequency', rounds: 4, participants: [{ name: 'Feras', won: true, exact: 2, guesses: 3 }, { name: 'Osama', won: false, exact: 0, guesses: 1 }] }));
    const rows = leaderboard(data, { mode: 'frequency', since: Date.parse('2026-09-07') });
    expect(rows[0]).toMatchObject({ member: { name: 'Feras' }, wins: 1, exact: 2, guesses: 3 });
    expect(selectGames(data.games, { since: Date.parse('2026-09-07') })).toHaveLength(1);
    expect(new Date(weekStart(new Date(2026, 8, 13, 15))).getDay()).toBe(1);
  });
  it('salvages valid persisted rows and ignores malformed entries', () => {
    const data = insertGame(empty(), game());
    const restored = parseClubData(JSON.stringify({ version: 1, members: [...data.members, { name: '' }], games: [...data.games, { id: 'broken' }] }));
    expect(restored).toEqual(data);
    expect(parseClubData('{')).toEqual(empty());
  });
  it('can upgrade a legacy receipt without duplicating it', () => {
    const data = insertGame(empty(), game({ legacy: true, participants: [] }));
    const next = insertGame(data, game());
    expect(next.games).toHaveLength(1);
    expect(leaderboard(next)[0].wins).toBe(1);
    expect(insertGame(next, game({ legacy: true }))).toBe(next);
  });
  it('imports older team results without inventing individual participants', () => {
    const record = oldFrequencyRecord({ id: 'old', playedAt: '2026-09-01', format: 'teams', roundCount: 4, source: 'offline', winners: ['Mint'], scores: [{ label: 'Mint', points: 10000 }] });
    expect(record.participants).toEqual([]);
    expect(record.legacy).toBe(true);
  });
  it('excludes simulated crew from escape credit and preserves practice provenance', () => {
    const result = { missionId: 'line-13' as const, completedAt: '2026-09-11', durationSeconds: 60, retries: 1, routeSeed: 1, events: [] };
    const crew = [{ id: 'a', name: 'Osama', initials: 'O', nodeNumber: 1, role: 'relay' as const, roomId: 'one', color: '#FFD166', connected: true, simulated: false }];
    const record = escapeRecord(result, [...crew, { ...crew[0], id: 'bot', name: 'Bot', simulated: true }], 'preview');
    expect(record.participants.map((p) => p.name)).toEqual(['Osama']);
    expect(record.practice).toBe(true);
  });
  it('records both race teams and uses each player’s team time', () => {
    const input = raceRecord({ id: 'race1', playedAt: '2026-09-11', mode: 'live', winningTeamIds: ['mint'], standings: [{ teamId: 'mint', elapsedMs: 60000 }, { teamId: 'ember', elapsedMs: 90000 }] }, [{ label: 'Osama', simulated: false, teamId: 'mint' }, { label: 'Feras', simulated: false, teamId: 'ember' }, { label: 'Ghost', simulated: true, teamId: 'ember' }]);
    const rows = leaderboard(insertGame(empty(), input));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ wins: 1, seconds: 60 });
    expect(rows[1]).toMatchObject({ wins: 0, seconds: 90 });
  });
  it('keeps Frequency point ties shared and never saves answer text', () => {
    const setup = createQuickFamilyTriviaSetup(['Osama', 'Feras', 'Noor']);
    const generated = generateOfflineFamilyTriviaPack({ questionCount: 4, seed: 42, setup });
    const pack = { ...generated, questions: generated.questions.map((question) => ({ ...question, authorityPlayerId: 'player-3', respondentPlayerIds: ['player-1', 'player-2'] })) };
    let session = createFamilyTriviaSession(setup, pack, 'test-finish');
    for (const question of pack.questions) {
      const answer: FamilyTriviaAnswer = question.answerKind === 'choice' ? { kind: 'choice', optionId: question.options[0].id }
        : question.answerKind === 'ordering' ? { kind: 'ordering', optionIds: question.options.map((option) => option.id) }
          : question.answerKind === 'spectrum' ? { kind: 'spectrum', value: 50 }
            : { kind: 'text', value: 'popcorn' };
      session = submitFamilyTriviaReference(session, question.authorityPlayerId, answer).state;
      for (const playerId of question.respondentPlayerIds) session = submitFamilyTriviaGuess(session, playerId, answer).state;
      session = revealFamilyTriviaQuestion(session, setup.hostPlayerId).state;
      session = advanceFamilyTriviaQuestion(session, setup.hostPlayerId).state;
    }
    expect(session.phase).toBe('complete');
    const record = frequencyRecord(session, 'offline');
    expect(record.participants.map((p) => p.won)).toEqual([true, true, false]);
    expect(JSON.stringify(record)).not.toContain('referenceAnswers');
    expect(JSON.stringify(record)).not.toContain('optionId');
  });
});
