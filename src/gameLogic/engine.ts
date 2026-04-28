import {
  BallResult,
  GameState,
  GameStatus,
  MatchEvent,
  Player,
  Room,
  TeamId,
  TurnQueue,
} from '../types';
import {
  getBallOutcomeLabel,
  MAX_SELECTION,
  normalizeBallResult,
  SELECTION_OPTIONS,
} from './ballRules';
import { buildMatchSummary } from './matchSummary';

function biasedRandom(): number {
  return Math.floor(Math.random() * (MAX_SELECTION + 1));
}

export const botPick = biasedRandom;

export function aiPick(
  role: 'batter' | 'bowler',
  history: BallResult[],
  myId: string
): number {
  if (history.length < 2) return biasedRandom();

  const freq = Object.fromEntries(
    SELECTION_OPTIONS.map((value) => [value, 0])
  ) as Record<number, number>;

  for (const ball of history) {
    if (role === 'batter') {
      if (ball.bowlingPlayerId !== myId) {
        freq[ball.bowler] = (freq[ball.bowler] || 0) + 1;
      }
      continue;
    }

    if (ball.battingPlayerId !== myId) {
      freq[ball.batter] = (freq[ball.batter] || 0) + 1;
    }
  }

  const total = Object.values(freq).reduce((a, b) => a + b, 0);
  if (total === 0) return biasedRandom();

  if (role === 'batter') {
    const minCount = Math.min(...Object.values(freq));
    const candidates = Object.entries(freq)
      .filter(([, count]) => count === minCount)
      .map(([value]) => Number(value));
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  const maxCount = Math.max(...Object.values(freq));
  const candidates = Object.entries(freq)
    .filter(([, count]) => count === maxCount)
    .map(([value]) => Number(value));
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

function clonePlayers(players: Record<string, Player>) {
  return Object.fromEntries(
    Object.entries(players).map(([id, player]) => [id, { ...player }])
  ) as Record<string, Player>;
}

function cloneQueue(queue: TurnQueue): TurnQueue {
  return {
    A: [...queue.A],
    B: [...queue.B],
  };
}

function getQueue(gameState: GameState, team: TeamId): string[] {
  const nextQueue = gameState.playersQueue?.[team];
  if (Array.isArray(nextQueue) && nextQueue.length > 0) return nextQueue;
  return gameState.turnQueue[team] ?? [];
}

function nextAliveBatterId(
  queue: string[],
  currentPlayerId: string,
  players: Record<string, Player>
): string | null {
  if (queue.length === 0) return null;

  const currentIndex = Math.max(queue.indexOf(currentPlayerId), 0);
  for (let offset = 1; offset <= queue.length; offset += 1) {
    const candidateId = queue[(currentIndex + offset) % queue.length];
    if (candidateId && players[candidateId] && !players[candidateId].isOut) {
      return candidateId;
    }
  }

  return null;
}

function selectNextBowlerId(
  queue: string[],
  currentBowlerId: string | null,
  blockedBowlerId: string | null,
  players: Record<string, Player>
): string | null {
  const available = queue.filter((playerId) => Boolean(players[playerId]));
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];

  const startIndex = currentBowlerId ? Math.max(available.indexOf(currentBowlerId), 0) : -1;

  for (let offset = 1; offset <= available.length; offset += 1) {
    const candidateId = available[(startIndex + offset + available.length) % available.length];
    if (candidateId !== blockedBowlerId) {
      return candidateId;
    }
  }

  return available[0];
}

function syncCurrentTurn(gameState: GameState) {
  if (!gameState.currentBatterId || !gameState.currentBowlerId) {
    gameState.currentTurn = null;
    return;
  }

  gameState.currentTurn = {
    battingPlayerId: gameState.currentBatterId,
    bowlingPlayerId: gameState.currentBowlerId,
  };
}

function pushEvent(
  gameState: GameState,
  event: Omit<MatchEvent, 'id' | 'sequence' | 'createdAt'>
) {
  const nextSequence = (gameState.eventSequence ?? 0) + 1;
  const nextEvent: MatchEvent = {
    ...event,
    id: `event_${nextSequence}`,
    sequence: nextSequence,
    createdAt: Date.now(),
  };

  const history = [...(gameState.matchEvents ?? []), nextEvent].slice(-12);
  gameState.eventSequence = nextSequence;
  gameState.latestEvent = nextEvent;
  gameState.matchEvents = history;
}

function startNextInnings(
  gameState: GameState,
  players: Record<string, Player>,
  nextBattingTeam: TeamId
) {
  const nextBowlingTeam = otherTeam(nextBattingTeam);
  const battingQueue = getQueue(gameState, nextBattingTeam);
  const bowlingQueue = getQueue(gameState, nextBowlingTeam);
  const openingBatterId = battingQueue.find((playerId) => players[playerId] && !players[playerId].isOut) ?? null;
  const openingBowlerId = selectNextBowlerId(bowlingQueue, null, null, players);

  gameState.currentInnings = 2;
  gameState.battingTeam = nextBattingTeam;
  gameState.bowlingTeam = nextBowlingTeam;
  gameState.target = gameState.teamScores[otherTeam(nextBattingTeam)] + 1;
  gameState.ballCount = 0;
  gameState.overNumber = 1;
  gameState.lastBowlerId = null;
  gameState.currentBatterId = openingBatterId;
  gameState.currentBowlerId = openingBowlerId;
  syncCurrentTurn(gameState);
}

export const processTurn = (room: Room): Partial<Room> | null => {
  const { gameState, players } = room;
  const currentBatterId = gameState.currentBatterId ?? gameState.currentTurn?.battingPlayerId ?? null;
  const currentBowlerId = gameState.currentBowlerId ?? gameState.currentTurn?.bowlingPlayerId ?? null;

  if (!currentBatterId || !currentBowlerId) return null;

  const batter = players[currentBatterId];
  const bowler = players[currentBowlerId];
  if (!batter || !bowler) return null;
  if (batter.selection === null || bowler.selection === null) return null;

  const batterSelection = batter.selection;
  const bowlerSelection = bowler.selection;
  const battingTeam = gameState.battingTeam;
  const bowlingTeam = gameState.bowlingTeam;
  const battingQueue = getQueue(gameState, battingTeam);
  const bowlingQueue = getQueue(gameState, bowlingTeam);

  const nextPlayers = clonePlayers(players);
  const nextGameState: GameState = {
    ...gameState,
    status: room.status,
    turnQueue: cloneQueue(gameState.turnQueue),
    playersQueue: cloneQueue(gameState.playersQueue ?? gameState.turnQueue),
    teamScores: { ...gameState.teamScores },
    teamWickets: { ...gameState.teamWickets },
    ballHistory: [...(gameState.ballHistory ?? [])],
    matchEvents: [...(gameState.matchEvents ?? [])],
  };
  let nextStatus = room.status;

  const ballInOver = (nextGameState.ballCount ?? 0) + 1;
  const overNumber = nextGameState.overNumber ?? 1;
  const ball: BallResult = normalizeBallResult({
    batter: batterSelection,
    bowler: bowlerSelection,
    innings: nextGameState.currentInnings,
    overNumber,
    ballInOver,
    battingPlayerId: currentBatterId,
    bowlingPlayerId: currentBowlerId,
  });

  nextGameState.ballHistory.push(ball);
  nextGameState.lastResult = normalizeBallResult({
    batter: batterSelection,
    bowler: bowlerSelection,
    overNumber,
    ballInOver,
    battingPlayerId: currentBatterId,
    bowlingPlayerId: currentBowlerId,
  });

  for (const playerId of Object.keys(nextPlayers)) {
    nextPlayers[playerId].selection = null;
  }

  nextGameState.ballCount = ballInOver;

  if (ball.isOut) {
    nextPlayers[currentBatterId].isOut = true;
    nextGameState.teamWickets[battingTeam] -= 1;

    pushEvent(nextGameState, {
      type: 'wicket',
      innings: nextGameState.currentInnings,
      overNumber,
      ballInOver,
      title: getBallOutcomeLabel(ball),
      subtitle:
        ball.outcome === 'wicket_dot'
          ? `${batter.name} is OUT on the double-dot trap`
          : `Player ${batter.name} is OUT`,
      detail:
        ball.outcome === 'wicket_dot'
          ? `${bowler.name} matched the Dot Ball`
          : `Taken by ${bowler.name}`,
      batterId: currentBatterId,
      bowlerId: currentBowlerId,
      nextPlayerId: null,
    });

    const nextBatterId = nextAliveBatterId(battingQueue, currentBatterId, nextPlayers);
    const inningsOver = !nextBatterId || nextGameState.teamWickets[battingTeam] <= 0;

    if (!inningsOver && nextBatterId) {
      nextGameState.currentBatterId = nextBatterId;
      pushEvent(nextGameState, {
        type: 'next_batter',
        innings: nextGameState.currentInnings,
        overNumber,
        ballInOver,
        title: 'New Batter',
        subtitle: `${nextPlayers[nextBatterId].name} is now batting`,
        batterId: currentBatterId,
        bowlerId: currentBowlerId,
        nextPlayerId: nextBatterId,
      });
    } else {
      nextGameState.currentBatterId = null;
    }

    if (inningsOver) {
      if (nextGameState.currentInnings === 1) {
        const nextBattingTeam = otherTeam(battingTeam);
        for (const playerId of getQueue(nextGameState, nextBattingTeam)) {
          if (nextPlayers[playerId]) nextPlayers[playerId].isOut = false;
        }
        startNextInnings(nextGameState, nextPlayers, nextBattingTeam);
      } else {
        nextStatus = GameStatus.FINISHED;
        nextGameState.status = GameStatus.FINISHED;
        nextGameState.over = true;
        const summary = buildMatchSummary(nextPlayers, nextGameState);
        nextGameState.winner = summary.winner;
        nextGameState.teamSummary = summary.teamSummary;
        nextGameState.playerStats = summary.playerStats;
        nextGameState.mvp = summary.mvp;
        nextGameState.finishedAt = Date.now();
        nextGameState.currentBatterId = null;
        nextGameState.currentBowlerId = null;
        syncCurrentTurn(nextGameState);
      }
    }
  } else {
    nextPlayers[currentBatterId].score += ball.runs;
    nextGameState.teamScores[battingTeam] += ball.runs;

    if (
      nextGameState.currentInnings === 2 &&
      nextGameState.target !== null &&
      nextGameState.teamScores[battingTeam] >= nextGameState.target
    ) {
      nextStatus = GameStatus.FINISHED;
      nextGameState.status = GameStatus.FINISHED;
      nextGameState.over = true;
      const summary = buildMatchSummary(nextPlayers, {
        ...nextGameState,
        winner: battingTeam,
      });
      nextGameState.winner = summary.winner;
      nextGameState.teamSummary = summary.teamSummary;
      nextGameState.playerStats = summary.playerStats;
      nextGameState.mvp = summary.mvp;
      nextGameState.finishedAt = Date.now();
      nextGameState.currentBatterId = null;
      nextGameState.currentBowlerId = null;
      syncCurrentTurn(nextGameState);
    }
  }

  const overComplete =
    nextStatus === GameStatus.PLAYING &&
    nextGameState.currentBatterId !== null &&
    nextGameState.ballCount >= 6;

  if (overComplete) {
    const nextBowlerId = selectNextBowlerId(
      bowlingQueue,
      currentBowlerId,
      currentBowlerId,
      nextPlayers
    );

    nextGameState.lastBowlerId = currentBowlerId;
    nextGameState.ballCount = 0;
    nextGameState.overNumber = overNumber + 1;
    nextGameState.currentBowlerId = nextBowlerId;

    if (nextBowlerId) {
      pushEvent(nextGameState, {
        type: 'over_complete',
        innings: nextGameState.currentInnings,
        overNumber,
        ballInOver: 6,
        title: 'Over Complete',
        subtitle: `Over ${overNumber} completed`,
        detail: `${nextPlayers[nextBowlerId].name} will bowl next`,
        batterId: nextGameState.currentBatterId,
        bowlerId: currentBowlerId,
        nextPlayerId: nextBowlerId,
      });
    }
  } else if (nextStatus === GameStatus.PLAYING && nextGameState.currentBowlerId === null) {
    nextGameState.currentBowlerId = currentBowlerId;
  }

  if (nextStatus === GameStatus.PLAYING && nextGameState.currentBatterId === null) {
    nextGameState.currentBatterId = currentBatterId;
  }

  if (nextStatus === GameStatus.PLAYING && !nextGameState.currentBowlerId) {
    nextGameState.currentBowlerId =
      selectNextBowlerId(bowlingQueue, currentBowlerId, nextGameState.lastBowlerId, nextPlayers) ??
      currentBowlerId;
  }

  syncCurrentTurn(nextGameState);

  return {
    players: nextPlayers,
    gameState: nextGameState,
    status: nextStatus,
  };
};
