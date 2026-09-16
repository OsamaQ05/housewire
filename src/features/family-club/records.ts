import { familyTriviaTeamRateBasisPoints, type FamilyTriviaSessionState } from '../../domain/family-trivia';
import type { MissionResult, CrewNode, SessionMode } from '../../store/use-housewire-store';
import type { FamilyFrequencyResult } from '../../store/use-family-frequency-store';
import type { CircuitRaceResult } from '../race/runtime-state';
import { buildFrequencyScoreboard } from '../trivia/frequency-scoreboard';
import type { ClubGameInput } from './model';

const TITLES = { 'line-13': 'Line 13', 'dead-air': 'Dead Air', 'night-glass': 'Night Glass', 'long-table': 'The Long Table' };
export function escapeRecord(result: MissionResult, crew?: readonly CrewNode[], mode?: SessionMode): ClubGameInput {
  return {
    id: `escape:${result.missionId}:${result.routeSeed}:${result.completedAt}`, mode: 'escape', title: TITLES[result.missionId],
    playedAt: result.completedAt, durationSeconds: result.durationSeconds, retries: result.retries, caseId: result.missionId,
    practice: mode === 'preview', legacy: !crew, source: 'authored',
    participants: crew?.filter((p) => !p.simulated).map((p) => ({ name: p.name, won: true })) ?? [],
  };
}
export function frequencyRecord(session: FamilyTriviaSessionState, source: 'ai' | 'offline', startedAt?: number, now = Date.now()): ClubGameInput {
  const teamMode = session.setup.teams.length > 0;
  const winnerIds = new Set(buildFrequencyScoreboard(session).entries.filter((entry) => entry.rank === 1).map((entry) => entry.id));
  const rounds = session.results.filter((r) => !r.skipped).length;
  return {
    id: `frequency:${session.id}`, mode: 'frequency', title: teamMode ? 'Family Frequency · teams' : 'Family Frequency',
    playedAt: new Date(now).toISOString(), durationSeconds: startedAt ? Math.max(0, (now - startedAt) / 1000) : undefined,
    practice: false, source, rounds,
    standings: teamMode ? session.teamScores.map((score) => ({
      label: session.setup.teams.find((team) => team.id === score.teamId)?.name ?? score.teamId,
      value: `${(familyTriviaTeamRateBasisPoints(score) / 100).toFixed(0)}% · ${score.exactMatches}/${score.opportunities} exact`,
      won: rounds > 0 && winnerIds.has(score.teamId),
    })) : undefined,
    participants: session.setup.players.map((player) => {
      const score = session.playerScores.find((s) => s.playerId === player.id)!;
      const team = session.setup.teams.find((t) => t.memberPlayerIds.includes(player.id));
      return { name: player.name, team: team?.name, score: score.points, exact: score.exactMatches,
        guesses: session.results.flatMap((r) => r.playerPoints).filter((p) => p.playerId === player.id).length,
        won: rounds > 0 && winnerIds.has(teamMode ? team?.id ?? '' : player.id),
      };
    }),
  };
}
export function oldFrequencyRecord(result: FamilyFrequencyResult): ClubGameInput {
  return { id: `frequency:${result.id}`, mode: 'frequency', title: 'Family Frequency', playedAt: result.playedAt,
    practice: false, legacy: true, rounds: result.roundCount, source: result.source, participants: [],
    standings: result.scores.map((score) => ({ label: score.label, won: result.winners.includes(score.label), value: result.format === 'teams' ? `${(score.points / 100).toFixed(0)}%` : `${score.points} pts` })),
  };
}
export function raceRecord(result: CircuitRaceResult, participants?: readonly { label: string; simulated: boolean; teamId: string }[]): ClubGameInput {
  return { id: `race:${result.id}`, mode: 'race', title: 'Circuit Race', playedAt: result.playedAt,
    practice: result.mode === 'practice', legacy: !participants, source: 'authored', rounds: 4,
    durationSeconds: Math.max(0, ...result.standings.map((s) => s.elapsedMs / 1000)),
    participants: participants?.filter((p) => !p.simulated).map((p) => ({ name: p.label, team: p.teamId === 'mint' ? 'Mint' : 'Coral', won: result.winningTeamIds.includes(p.teamId), elapsedSeconds: (result.standings.find((s) => s.teamId === p.teamId)?.elapsedMs ?? 0) / 1000 })) ?? [],
    standings: result.standings.map((s) => ({ label: s.teamId === 'mint' ? 'Mint team' : 'Coral team', won: result.winningTeamIds.includes(s.teamId), value: s.failed ? 'DNF · Did not finish' : `${(s.elapsedMs / 1000).toFixed(1)}s` })),
  };
}
