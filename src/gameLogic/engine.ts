
import { Room, Player, GameStatus, GameState, TeamId, BallResult } from '../types';

// ─── Bot Logic ────────────────────────────────────────────────────────────────

/** Biased-random fallback pick: slightly weighted toward middle numbers */
function biasedRandom(): number {
  const weights = [1, 2, 3, 4, 3, 2]; // 1→w1, 2→w2, 3→w3, 4→w4, 5→w3, 6→w2
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return i + 1;
  }
  return 3;
}

/** Legacy alias kept for any leftover call-sites */
export const botPick = biasedRandom;

/**
 * Intelligent AI pick that reads match history to make a prediction.
 *
 * - **Batting** (want to NOT match the bowler): pick the number the opponent
 *   has bowled *least* often — least likely to be repeated.
 * - **Bowling** (want to MATCH the batter): pick the number the opponent
 *   has batted *most* often — most likely pattern to exploit.
 *
 * Falls back to biasedRandom when there's insufficient history.
 */
export function aiPick(
  role: 'batter' | 'bowler',
  history: BallResult[],
  myId: string
): number {
  if (history.length < 2) return biasedRandom();

  // Build frequency table of opponent's choices
  const freq: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  for (const ball of history) {
    if (role === 'batter') {
      // Opponent is the bowler — track what they threw
      if (ball.bowlingPlayerId !== myId) {
        freq[ball.bowler] = (freq[ball.bowler] || 0) + 1;
      }
    } else {
      // Opponent is the batter — track what they scored with
      if (ball.battingPlayerId !== myId) {
        freq[ball.batter] = (freq[ball.batter] || 0) + 1;
      }
    }
  }

  const total = Object.values(freq).reduce((a, b) => a + b, 0);
  if (total === 0) return biasedRandom();

  if (role === 'batter') {
    // Pick the number bowled *least* — minimise chance of a match
    const minCount = Math.min(...Object.values(freq));
    const candidates = Object.entries(freq)
      .filter(([, cnt]) => cnt === minCount)
      .map(([n]) => Number(n));
    return candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // Pick the number batted *most* — maximise chance of a match (wicket)
    const maxCount = Math.max(...Object.values(freq));
    const candidates = Object.entries(freq)
      .filter(([, cnt]) => cnt === maxCount)
      .map(([n]) => Number(n));
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

// ─── Queue Helpers ────────────────────────────────────────────────────────────

/**
 * Get the next player index in a round-robin queue of playerIds.
 * Returns the index of the *first alive/non-out* player starting from
 * the one AFTER currentIdx (wraps around).
 */
function nextAliveIdx(
  queue: string[],
  currentIdx: number,
  players: Record<string, Player>
): number {
  const len = queue.length;
  for (let i = 1; i <= len; i++) {
    const idx = (currentIdx + i) % len;
    const pid = queue[idx];
    if (pid && players[pid] && !players[pid].isOut) return idx;
  }
  return -1; // all out
}

/** 
 * Rotate bowling queue — always loops (bowlers keep taking turns even if "out" as batters).
 * Returns new index after advancing by 1.
 */
function nextBowlerIdx(queue: string[], currentIdx: number): number {
  return (currentIdx + 1) % queue.length;
}

// ─── Main Turn Processor ──────────────────────────────────────────────────────

export const processTurn = (room: Room): Partial<Room> | null => {
  const { gameState, players } = room;
  const { currentTurn, battingTeam } = gameState;

  if (!currentTurn) return null;

  const { battingPlayerId, bowlingPlayerId } = currentTurn;
  const batter = players[battingPlayerId];
  const bowler = players[bowlingPlayerId];

  if (!batter || !bowler) return null;
  if (batter.selection === null || bowler.selection === null) return null;

  const batterSel = batter.selection;
  const bowlerSel = bowler.selection;
  const isOut = batterSel === bowlerSel;

  const bowlingTeam: TeamId = battingTeam === 'A' ? 'B' : 'A';
  const battingQueue = gameState.turnQueue[battingTeam];
  const bowlingQueue = gameState.turnQueue[bowlingTeam];

  // Clone mutable state
  let nextPlayers = Object.fromEntries(
    Object.entries(players).map(([id, p]) => [id, { ...p }])
  );
  let nextGameState: GameState = {
    ...gameState,
    status: room.status,
    teamScores: { ...gameState.teamScores },
    teamWickets: { ...gameState.teamWickets },
    turnQueue: {
      A: [...gameState.turnQueue.A],
      B: [...gameState.turnQueue.B],
    },
    ballHistory: [...(gameState.ballHistory || [])],
  };
  let nextStatus = room.status;

  // ── Record ball ──
  const ball: BallResult = {
    batter: batterSel,
    bowler: bowlerSel,
    isOut,
    innings: nextGameState.currentInnings,
    runs: isOut ? 0 : batterSel,
    battingPlayerId,
    bowlingPlayerId,
  };
  nextGameState.ballHistory.push(ball);

  nextGameState.lastResult = {
    batter: batterSel,
    bowler: bowlerSel,
    isOut,
    runs: isOut ? 0 : batterSel,
    battingPlayerId,
    bowlingPlayerId,
  };

  // Clear all selections
  for (const pid of Object.keys(nextPlayers)) {
    nextPlayers[pid].selection = null;
  }

  if (isOut) {
    // ── Wicket ──
    nextPlayers[battingPlayerId].isOut = true;
    nextGameState.teamWickets[battingTeam] -= 1;

    const currentBatterIdx = battingQueue.indexOf(battingPlayerId);
    const nextBatterIdx = nextAliveIdx(battingQueue, currentBatterIdx, nextPlayers);

    if (nextBatterIdx === -1 || nextGameState.teamWickets[battingTeam] === 0) {
      // ── All wickets fallen → innings over ──
      if (nextGameState.currentInnings === 1) {
        // Switch innings
        const newBattingTeam: TeamId = battingTeam === 'A' ? 'B' : 'A';
        const newBowlingTeam: TeamId = battingTeam;
        const target = nextGameState.teamScores[battingTeam] + 1;
        nextGameState.currentInnings = 2;
        nextGameState.battingTeam = newBattingTeam;
        nextGameState.bowlingTeam = newBowlingTeam;
        nextGameState.target = target;

        // Reset new batting team's isOut flags
        for (const pid of nextGameState.turnQueue[newBattingTeam]) {
          if (nextPlayers[pid]) nextPlayers[pid].isOut = false;
        }

        // Set first turn of innings 2
        const newBattingQueue = nextGameState.turnQueue[newBattingTeam];
        const newBowlingQueue = nextGameState.turnQueue[newBowlingTeam];
        nextGameState.currentTurn = {
          battingPlayerId: newBattingQueue[0],
          bowlingPlayerId: newBowlingQueue[0],
        };
      } else {
        // ── Game Over ──
        nextStatus = GameStatus.FINISHED;
        nextGameState.status = GameStatus.FINISHED;
        nextGameState.over = true;
        nextGameState.winner = determineWinner(nextGameState);
        nextGameState.mvpPlayerId = findMVP(nextPlayers);
        nextGameState.currentTurn = null;
      }
    } else {
      // ── Next batter, same bowler (advance bowling by 1 too) ──
      const currentBowlerIdx = bowlingQueue.indexOf(bowlingPlayerId);
      const nextBowlIdx = nextBowlerIdx(bowlingQueue, currentBowlerIdx);
      nextGameState.currentTurn = {
        battingPlayerId: battingQueue[nextBatterIdx],
        bowlingPlayerId: bowlingQueue[nextBowlIdx],
      };
    }
  } else {
    // ── Runs scored ──
    nextPlayers[battingPlayerId].score += batterSel;
    nextGameState.teamScores[battingTeam] += batterSel;

    // Check target reached in innings 2
    if (
      nextGameState.currentInnings === 2 &&
      nextGameState.target !== null &&
      nextGameState.teamScores[battingTeam] >= nextGameState.target
    ) {
      nextStatus = GameStatus.FINISHED;
      nextGameState.status = GameStatus.FINISHED;
      nextGameState.over = true;
      nextGameState.winner = battingTeam;
      nextGameState.mvpPlayerId = findMVP(nextPlayers);
      nextGameState.currentTurn = null;
    } else {
      // Advance BOTH queues (this pair finished their mini-duel)
      const currentBatterIdx = battingQueue.indexOf(battingPlayerId);
      const currentBowlerIdx = bowlingQueue.indexOf(bowlingPlayerId);

      // Batter advances to next alive batter
      const nextBaterIdx2 = nextAliveIdx(battingQueue, currentBatterIdx, nextPlayers);
      const nextBowlIdx2 = nextBowlerIdx(bowlingQueue, currentBowlerIdx);

      if (nextBaterIdx2 === -1) {
        // All batters exhausted but no wickets — wrap around to start
        nextGameState.currentTurn = {
          battingPlayerId: battingQueue.find(pid => nextPlayers[pid] && !nextPlayers[pid].isOut) || battingPlayerId,
          bowlingPlayerId: bowlingQueue[nextBowlIdx2],
        };
      } else {
        nextGameState.currentTurn = {
          battingPlayerId: battingQueue[nextBaterIdx2],
          bowlingPlayerId: bowlingQueue[nextBowlIdx2],
        };
      }
    }
  }

  return {
    players: nextPlayers,
    gameState: nextGameState,
    status: nextStatus,
  };
};

// ─── Determine Winner ─────────────────────────────────────────────────────────

function determineWinner(gs: GameState): TeamId | 'TIE' {
  const { teamScores, battingTeam, target } = gs;
  const bowlingTeam: TeamId = battingTeam === 'A' ? 'B' : 'A';

  if (gs.currentInnings === 2 && target !== null) {
    const chaseScore = teamScores[battingTeam];
    const defScore = target - 1; // score the defending team got
    if (chaseScore > defScore) return battingTeam;
    if (chaseScore === defScore) return 'TIE';
    return bowlingTeam;
  }

  // Fallback comparison
  if (teamScores.A > teamScores.B) return 'A';
  if (teamScores.B > teamScores.A) return 'B';
  return 'TIE';
}

// ─── MVP ──────────────────────────────────────────────────────────────────────

function findMVP(players: Record<string, Player>): string | null {
  let topScore = -1;
  let mvp: string | null = null;
  for (const [pid, p] of Object.entries(players)) {
    if (!p.isBot && p.score > topScore) {
      topScore = p.score;
      mvp = pid;
    }
  }
  return mvp;
}
