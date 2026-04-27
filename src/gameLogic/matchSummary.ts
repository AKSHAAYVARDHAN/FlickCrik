import {
  GameState,
  MatchMVP,
  Player,
  PlayerMatchStats,
  TeamId,
  TeamSummary,
} from '../types';

export const SUMMARY_VISIBILITY_DELAY_MS = 2500;

function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

export function formatOversFromBalls(balls: number): string {
  const completedOvers = Math.floor(Math.max(0, balls) / 6);
  const ballsIntoOver = Math.max(0, balls) % 6;
  return `${completedOvers}.${ballsIntoOver}`;
}

export function createEmptyTeamSummary(team: TeamId): TeamSummary {
  return {
    team,
    runs: 0,
    wicketsLost: 0,
    ballsPlayed: 0,
    oversPlayed: formatOversFromBalls(0),
  };
}

export function createEmptyPlayerStats(player: Player): PlayerMatchStats {
  return {
    playerId: player.id,
    team: player.team,
    runsScored: 0,
    ballsFaced: 0,
    wicketsTaken: 0,
    runsConceded: 0,
    ballsBowled: 0,
    oversBowled: formatOversFromBalls(0),
  };
}

export function buildEmptyPlayerStatsMap(
  players: Record<string, Player>
): Record<string, PlayerMatchStats> {
  return Object.fromEntries(
    Object.values(players).map((player) => [player.id, createEmptyPlayerStats(player)])
  ) as Record<string, PlayerMatchStats>;
}

function determineWinner(gameState: Pick<GameState, 'teamScores' | 'currentInnings' | 'battingTeam' | 'target'>): TeamId | 'TIE' {
  const { teamScores, battingTeam, target } = gameState;
  const bowlingTeam = otherTeam(battingTeam);

  if (gameState.currentInnings === 2 && target !== null) {
    const chaseScore = teamScores[battingTeam];
    const defendingScore = target - 1;

    if (chaseScore > defendingScore) return battingTeam;
    if (chaseScore === defendingScore) return 'TIE';
    return bowlingTeam;
  }

  if (teamScores.A > teamScores.B) return 'A';
  if (teamScores.B > teamScores.A) return 'B';
  return 'TIE';
}

function pickMvp(
  players: Record<string, Player>,
  playerStats: Record<string, PlayerMatchStats>
): MatchMVP | null {
  let best: MatchMVP | null = null;

  for (const player of Object.values(players)) {
    const stats = playerStats[player.id] ?? createEmptyPlayerStats(player);
    const rating = stats.runsScored + stats.wicketsTaken * 25;
    const candidate: MatchMVP = {
      playerId: player.id,
      runs: stats.runsScored,
      wickets: stats.wicketsTaken,
      rating,
    };

    if (
      !best ||
      candidate.rating > best.rating ||
      (candidate.rating === best.rating && candidate.wickets > best.wickets) ||
      (candidate.rating === best.rating &&
        candidate.wickets === best.wickets &&
        candidate.runs > best.runs) ||
      (candidate.rating === best.rating &&
        candidate.wickets === best.wickets &&
        candidate.runs === best.runs &&
        stats.runsConceded < (playerStats[best.playerId]?.runsConceded ?? Number.POSITIVE_INFINITY))
    ) {
      best = candidate;
    }
  }

  return best;
}

export function buildMatchSummary(
  players: Record<string, Player>,
  gameState: Pick<
    GameState,
    | 'ballHistory'
    | 'teamScores'
    | 'currentInnings'
    | 'battingTeam'
    | 'target'
    | 'winner'
    | 'playerStats'
  >
): Pick<GameState, 'winner' | 'teamSummary' | 'playerStats' | 'mvp'> {
  const playerStats = buildEmptyPlayerStatsMap(players);
  const fallbackStats = gameState.playerStats ?? {};
  const teamSummary: Record<TeamId, TeamSummary> = {
    A: createEmptyTeamSummary('A'),
    B: createEmptyTeamSummary('B'),
  };

  for (const ball of gameState.ballHistory ?? []) {
    const battingPlayer = players[ball.battingPlayerId];
    const bowlingPlayer = players[ball.bowlingPlayerId];
    const battingTeam = battingPlayer?.team ?? fallbackStats[ball.battingPlayerId]?.team ?? null;
    const bowlingTeam = bowlingPlayer?.team ?? fallbackStats[ball.bowlingPlayerId]?.team ?? null;

    if (battingPlayer) {
      const battingStats = playerStats[battingPlayer.id] ?? createEmptyPlayerStats(battingPlayer);
      battingStats.ballsFaced += 1;
      battingStats.runsScored += ball.runs;
      playerStats[battingPlayer.id] = {
        ...battingStats,
        oversBowled: formatOversFromBalls(battingStats.ballsBowled),
      };

      const battingTeamSummary = teamSummary[battingPlayer.team];
      battingTeamSummary.ballsPlayed += 1;
      battingTeamSummary.runs = gameState.teamScores[battingPlayer.team] ?? battingTeamSummary.runs;
      if (ball.isOut) {
        battingTeamSummary.wicketsLost += 1;
      }
      battingTeamSummary.oversPlayed = formatOversFromBalls(battingTeamSummary.ballsPlayed);
    } else if (battingTeam) {
      const battingTeamSummary = teamSummary[battingTeam];
      battingTeamSummary.ballsPlayed += 1;
      battingTeamSummary.runs = gameState.teamScores[battingTeam] ?? battingTeamSummary.runs;
      if (ball.isOut) {
        battingTeamSummary.wicketsLost += 1;
      }
      battingTeamSummary.oversPlayed = formatOversFromBalls(battingTeamSummary.ballsPlayed);
    }

    if (bowlingPlayer) {
      const bowlingStats = playerStats[bowlingPlayer.id] ?? createEmptyPlayerStats(bowlingPlayer);
      bowlingStats.ballsBowled += 1;
      bowlingStats.runsConceded += ball.runs;
      if (ball.isOut) {
        bowlingStats.wicketsTaken += 1;
      }
      bowlingStats.oversBowled = formatOversFromBalls(bowlingStats.ballsBowled);
      playerStats[bowlingPlayer.id] = bowlingStats;

      const bowlingTeamSummary = teamSummary[bowlingPlayer.team];
      bowlingTeamSummary.runs = gameState.teamScores[bowlingPlayer.team] ?? bowlingTeamSummary.runs;
    } else if (bowlingTeam) {
      const bowlingTeamSummary = teamSummary[bowlingTeam];
      bowlingTeamSummary.runs = gameState.teamScores[bowlingTeam] ?? bowlingTeamSummary.runs;
    }
  }

  for (const team of ['A', 'B'] as TeamId[]) {
    teamSummary[team] = {
      ...teamSummary[team],
      runs: gameState.teamScores[team] ?? 0,
      oversPlayed: formatOversFromBalls(teamSummary[team].ballsPlayed),
    };
  }

  return {
    winner: gameState.winner ?? determineWinner(gameState),
    teamSummary,
    playerStats,
    mvp: pickMvp(players, playerStats),
  };
}
