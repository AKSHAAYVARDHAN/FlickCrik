import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from './config';
import {
  FirestoreErrorInfo,
  GameState,
  GameStatus,
  Player,
  Room,
  TeamId,
  TeamNames,
  TossChoice,
  TossDecision,
  TossState,
} from '../types';
import { processTurn } from '../gameLogic/engine';
import { DEFAULT_TEAM_NAMES, sanitizeTeamName } from '../utils/teamNames';

const ROOMS_COLLECTION = 'rooms';
const MAX_PLAYERS = 12;

function handleFirestoreError(error: any, operationType: any, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const flat: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      Object.assign(flat, flattenObject(value, fullKey));
    } else {
      flat[fullKey] = value;
    }
  }
  return flat;
}

function flattenRoomUpdate(updates: Partial<Room>): Record<string, any> {
  const flat: Record<string, any> = {};

  if (updates.players) {
    for (const [playerId, playerData] of Object.entries(updates.players)) {
      flat[`players.${playerId}`] = playerData;
    }
  }

  if (updates.gameState) {
    Object.assign(flat, flattenObject(updates.gameState as any, 'gameState'));
  }

  if (updates.status !== undefined) {
    flat.status = updates.status;
  }

  if (updates.teamNames) {
    flat.teamNames = updates.teamNames;
  }

  return flat;
}

function generateId(len = 10): string {
  return Math.random().toString(36).substring(2, 2 + len);
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A';
}

function sortPlayersByOrder(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.order - b.order);
}

function makeDefaultTossState(selectedBy: TeamId | null = null): TossState {
  return {
    selectedBy,
    choice: null,
    result: null,
    winnerTeam: null,
    decision: null,
    tossCompleted: false,
    completedAt: null,
  };
}

function makeDefaultGameState(): GameState {
  return {
    status: GameStatus.LOBBY,
    currentInnings: 1,
    battingTeam: 'A',
    bowlingTeam: 'B',
    target: null,
    over: false,
    winner: null,
    toss: makeDefaultTossState(),
    currentTurn: null,
    turnQueue: { A: [], B: [] },
    playersQueue: { A: [], B: [] },
    currentBatterId: null,
    currentBowlerId: null,
    ballCount: 0,
    overNumber: 1,
    lastBowlerId: null,
    teamScores: { A: 0, B: 0 },
    teamWickets: { A: 0, B: 0 },
    lastResult: null,
    ballHistory: [],
    latestEvent: null,
    matchEvents: [],
    eventSequence: 0,
    mvpPlayerId: null,
  };
}

function makeDefaultTeamNames(): TeamNames {
  return { ...DEFAULT_TEAM_NAMES };
}

function normalizeCaptains(players: Record<string, Player>): Record<string, Player> {
  const normalized = Object.fromEntries(
    Object.entries(players).map(([id, player]) => [
      id,
      {
        ...player,
        isCaptain: Boolean(player.isCaptain),
      },
    ])
  ) as Record<string, Player>;

  (['A', 'B'] as TeamId[]).forEach((team) => {
    const teamPlayers = sortPlayersByOrder(
      Object.values(normalized).filter((player) => player.team === team)
    );

    if (teamPlayers.length === 0) {
      return;
    }

    const humanPlayers = teamPlayers.filter((player) => !player.isBot);
    const captainPool = humanPlayers.length > 0 ? humanPlayers : teamPlayers;
    const chosenCaptain =
      captainPool.find((player) => player.isCaptain) ?? captainPool[0];

    teamPlayers.forEach((player) => {
      normalized[player.id] = {
        ...normalized[player.id],
        isCaptain: player.id === chosenCaptain.id,
      };
    });
  });

  return normalized;
}

function resetPlayersForPreMatch(players: Record<string, Player>): Record<string, Player> {
  return Object.fromEntries(
    Object.entries(normalizeCaptains(players)).map(([id, player]) => [
      id,
      {
        ...player,
        score: 0,
        isOut: false,
        selection: null,
      },
    ])
  ) as Record<string, Player>;
}

function normalizeRoomData(room: Room): Room {
  const status = room.status ?? room.gameState?.status ?? GameStatus.LOBBY;
  const baseState = makeDefaultGameState();
  const battingTeam = room.gameState?.battingTeam ?? baseState.battingTeam;

  return {
    ...room,
    status,
    teamNames: {
      ...makeDefaultTeamNames(),
      ...(room.teamNames ?? {}),
    },
    players: normalizeCaptains(room.players ?? {}),
    gameState: {
      ...baseState,
      ...room.gameState,
      status,
      battingTeam,
      bowlingTeam: room.gameState?.bowlingTeam ?? otherTeam(battingTeam),
      toss: {
        ...baseState.toss,
        ...room.gameState?.toss,
      },
      turnQueue: {
        A: room.gameState?.turnQueue?.A ?? room.gameState?.playersQueue?.A ?? [],
        B: room.gameState?.turnQueue?.B ?? room.gameState?.playersQueue?.B ?? [],
      },
      playersQueue: {
        A: room.gameState?.playersQueue?.A ?? room.gameState?.turnQueue?.A ?? [],
        B: room.gameState?.playersQueue?.B ?? room.gameState?.turnQueue?.B ?? [],
      },
      currentBatterId:
        room.gameState?.currentBatterId ?? room.gameState?.currentTurn?.battingPlayerId ?? null,
      currentBowlerId:
        room.gameState?.currentBowlerId ?? room.gameState?.currentTurn?.bowlingPlayerId ?? null,
      currentTurn:
        (room.gameState?.currentBatterId ?? room.gameState?.currentTurn?.battingPlayerId) &&
        (room.gameState?.currentBowlerId ?? room.gameState?.currentTurn?.bowlingPlayerId)
          ? {
              battingPlayerId:
                room.gameState?.currentBatterId ?? room.gameState?.currentTurn?.battingPlayerId!,
              bowlingPlayerId:
                room.gameState?.currentBowlerId ?? room.gameState?.currentTurn?.bowlingPlayerId!,
            }
          : null,
      ballCount: room.gameState?.ballCount ?? 0,
      overNumber: room.gameState?.overNumber ?? 1,
      lastBowlerId: room.gameState?.lastBowlerId ?? null,
      teamScores: {
        A: room.gameState?.teamScores?.A ?? 0,
        B: room.gameState?.teamScores?.B ?? 0,
      },
      teamWickets: {
        A: room.gameState?.teamWickets?.A ?? 0,
        B: room.gameState?.teamWickets?.B ?? 0,
      },
      lastResult: room.gameState?.lastResult ?? null,
      ballHistory: room.gameState?.ballHistory ?? [],
      latestEvent: room.gameState?.latestEvent ?? null,
      matchEvents: room.gameState?.matchEvents ?? [],
      eventSequence: room.gameState?.eventSequence ?? 0,
      mvpPlayerId: room.gameState?.mvpPlayerId ?? null,
    },
  };
}

function makeTossGameState(players: Record<string, Player>): GameState {
  return {
    ...makeDefaultGameState(),
    status: GameStatus.TOSS,
    toss: makeDefaultTossState('A'),
    battingTeam: 'A',
    bowlingTeam: 'B',
    teamWickets: {
      A: Object.values(players).filter((player) => player.team === 'A').length,
      B: Object.values(players).filter((player) => player.team === 'B').length,
    },
  };
}

function makePlayingGameState(room: Room, battingTeam: TeamId, decision: TossDecision): GameState {
  const players = normalizeCaptains(room.players);
  const teamA = sortPlayersByOrder(Object.values(players).filter((player) => player.team === 'A'));
  const teamB = sortPlayersByOrder(Object.values(players).filter((player) => player.team === 'B'));
  const bowlingTeam = otherTeam(battingTeam);

  if (teamA.length === 0 || teamB.length === 0) {
    throw new Error('Each team needs at least 1 player');
  }

  const queueA = teamA.map((player) => player.id);
  const queueB = teamB.map((player) => player.id);
  const battingQueue = battingTeam === 'A' ? queueA : queueB;
  const bowlingQueue = bowlingTeam === 'A' ? queueA : queueB;

  return {
    ...makeDefaultGameState(),
    status: GameStatus.PLAYING,
    battingTeam,
    bowlingTeam,
    turnQueue: { A: queueA, B: queueB },
    playersQueue: { A: queueA, B: queueB },
    teamWickets: {
      A: teamA.length,
      B: teamB.length,
    },
    currentTurn: {
      battingPlayerId: battingQueue[0],
      bowlingPlayerId: bowlingQueue[0],
    },
    currentBatterId: battingQueue[0],
    currentBowlerId: bowlingQueue[0],
    toss: {
      ...makeDefaultTossState(),
      selectedBy: room.gameState.toss.selectedBy,
      choice: room.gameState.toss.choice,
      result: room.gameState.toss.result,
      winnerTeam: room.gameState.toss.winnerTeam,
      decision,
      tossCompleted: room.gameState.toss.tossCompleted,
      completedAt: room.gameState.toss.completedAt,
    },
  };
}

function getCaptain(players: Record<string, Player>, team: TeamId): Player | null {
  return (
    sortPlayersByOrder(Object.values(players).filter((player) => player.team === team))
      .find((player) => player.isCaptain) ?? null
  );
}

function assertCaptain(player: Player | undefined, team: TeamId, action: string): Player {
  if (!player || player.team !== team || !player.isCaptain) {
    throw new Error(`Only Team ${team} captain can ${action}`);
  }
  return player;
}

function assertHost(room: Room, playerId: string, action: string) {
  if (room.hostId !== playerId) {
    throw new Error(`Only the host can ${action}`);
  }
}

function chooseAiTossDecision(): TossDecision {
  return Math.random() < 0.5 ? 'bat' : 'bowl';
}

export const createRoom = async (
  playerName: string
): Promise<{ roomId: string; playerId: string }> => {
  const roomId = generateRoomId();
  const playerId = auth.currentUser?.uid || generateId();

  const hostPlayer: Player = {
    id: playerId,
    name: playerName,
    team: 'A',
    isCaptain: true,
    isBot: false,
    score: 0,
    isOut: false,
    selection: null,
    order: 0,
  };

  const room: Omit<Room, 'id'> = {
    status: GameStatus.LOBBY,
    hostId: playerId,
    teamNames: makeDefaultTeamNames(),
    players: normalizeCaptains({ [playerId]: hostPlayer }),
    gameState: makeDefaultGameState(),
    chat: [],
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, ROOMS_COLLECTION, roomId), room);
    return { roomId, playerId };
  } catch (error) {
    handleFirestoreError(error, 'create', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const joinRoom = async (
  roomId: string,
  playerName: string
): Promise<string> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Room not found');

  const roomData = normalizeRoomData({ id: roomSnap.id, ...roomSnap.data() } as Room);

  if (roomData.status === GameStatus.FINISHED) throw new Error('Game is already finished');
  if (Object.keys(roomData.players).length >= MAX_PLAYERS) throw new Error('Room is full');

  const playerId = auth.currentUser?.uid || generateId();
  if (roomData.players[playerId]) return playerId;

  const teamACount = Object.values(roomData.players).filter((player) => player.team === 'A').length;
  const teamBCount = Object.values(roomData.players).filter((player) => player.team === 'B').length;
  const team: TeamId = teamACount <= teamBCount ? 'A' : 'B';
  const orderInTeam = team === 'A' ? teamACount : teamBCount;

  const newPlayer: Player = {
    id: playerId,
    name: playerName,
    team,
    isCaptain: (team === 'A' ? teamACount : teamBCount) === 0,
    isBot: false,
    score: 0,
    isOut: false,
    selection: null,
    order: orderInTeam,
  };

  try {
    const nextPlayers = normalizeCaptains({
      ...roomData.players,
      [playerId]: newPlayer,
    });
    await updateDoc(roomRef, { players: nextPlayers });
    return playerId;
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const switchTeam = async (roomId: string, playerId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Room not found');

  const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
  if (room.status !== GameStatus.LOBBY) throw new Error('Can only switch teams in lobby');

  const player = room.players[playerId];
  if (!player) throw new Error('Player not found');

  const nextTeam: TeamId = player.team === 'A' ? 'B' : 'A';
  const nextOrder = Object.values(room.players).filter((member) => member.team === nextTeam).length;
  const nextPlayers = normalizeCaptains({
    ...room.players,
    [playerId]: {
      ...player,
      team: nextTeam,
      order: nextOrder,
      isCaptain: false,
    },
  });

  try {
    await updateDoc(roomRef, { players: nextPlayers });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const autoAssignTeams = async (roomId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Room not found');

  const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
  const playerIds = Object.keys(room.players).filter((id) => !room.players[id].isBot);

  for (let index = playerIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [playerIds[index], playerIds[randomIndex]] = [playerIds[randomIndex], playerIds[index]];
  }

  const nextPlayers = Object.fromEntries(
    Object.entries(room.players).map(([id, player]) => [
      id,
      {
        ...player,
        isCaptain: false,
      },
    ])
  ) as Record<string, Player>;

  playerIds.forEach((playerId, index) => {
    const team: TeamId = index % 2 === 0 ? 'A' : 'B';
    nextPlayers[playerId] = {
      ...nextPlayers[playerId],
      team,
      order: Math.floor(index / 2),
    };
  });

  try {
    await updateDoc(roomRef, { players: normalizeCaptains(nextPlayers) });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const addAiPlayer = async (roomId: string, team: TeamId): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Room not found');

  const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
  if (room.status !== GameStatus.LOBBY) throw new Error('Can only add AI in lobby');

  const allPlayers = Object.values(room.players);
  const teamACount = allPlayers.filter((player) => player.team === 'A').length;
  const teamBCount = allPlayers.filter((player) => player.team === 'B').length;

  if (team === 'A' && teamACount > teamBCount) {
    throw new Error('Team A already has more players');
  }
  if (team === 'B' && teamBCount > teamACount) {
    throw new Error('Team B already has more players');
  }

  const existingAiOnTeam = allPlayers.filter((player) => player.isBot && player.team === team).length;
  if (existingAiOnTeam >= 1) throw new Error(`Team ${team} already has an AI player`);

  const aiId = `ai_${generateId(6)}`;
  const orderInTeam = team === 'A' ? teamACount : teamBCount;

  const aiPlayer: Player = {
    id: aiId,
    name: 'AI Bot',
    team,
    isCaptain: orderInTeam === 0,
    isBot: true,
    score: 0,
    isOut: false,
    selection: null,
    order: orderInTeam,
  };

  try {
    const nextPlayers = normalizeCaptains({
      ...room.players,
      [aiId]: aiPlayer,
    });
    await updateDoc(roomRef, { players: nextPlayers });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const removeAiPlayer = async (roomId: string, aiId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Room not found');

  const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
  if (room.status !== GameStatus.LOBBY) throw new Error('Can only remove AI in lobby');

  const player = room.players[aiId];
  if (!player || !player.isBot) throw new Error('Player is not an AI bot');

  try {
    const nextPlayers = { ...room.players };
    delete nextPlayers[aiId];
    await updateDoc(roomRef, { players: normalizeCaptains(nextPlayers) });
  } catch (error) {
    handleFirestoreError(error, 'delete', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const startMatch = async (roomId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Room not found');

  const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
  const players = resetPlayersForPreMatch(room.players);
  const teamA = Object.values(players).filter((player) => player.team === 'A');
  const teamB = Object.values(players).filter((player) => player.team === 'B');

  if (teamA.length === 0 || teamB.length === 0) {
    throw new Error('Each team needs at least 1 player');
  }

  try {
    await updateDoc(roomRef, {
      status: GameStatus.TOSS,
      players,
      gameState: makeTossGameState(players),
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const makeCaptain = async (
  roomId: string,
  currentCaptainId: string,
  nextCaptainId: string
): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.LOBBY) {
        throw new Error('Captain can only be changed in lobby');
      }

      const currentCaptain = room.players[currentCaptainId];
      const nextCaptain = room.players[nextCaptainId];

      if (!currentCaptain || !currentCaptain.isCaptain) {
        throw new Error('Only the current captain can transfer captaincy');
      }
      if (!nextCaptain || nextCaptain.team !== currentCaptain.team) {
        throw new Error('Captain must be transferred within the same team');
      }

      const nextPlayers = normalizeCaptains({
        ...room.players,
        [currentCaptainId]: {
          ...currentCaptain,
          isCaptain: false,
        },
        [nextCaptainId]: {
          ...nextCaptain,
          isCaptain: true,
        },
      });

      transaction.update(roomRef, { players: nextPlayers });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const updateTeamName = async (
  roomId: string,
  playerId: string,
  team: TeamId,
  teamName: string
): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status === GameStatus.FINISHED) {
        throw new Error('Team name cannot be changed after the match ends');
      }

      assertCaptain(room.players[playerId], team, 'rename the team');

      transaction.update(roomRef, {
        [`teamNames.${team}`]: sanitizeTeamName(teamName, team),
      });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const chooseTossSide = async (
  roomId: string,
  playerId: string,
  choice: TossChoice
): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.TOSS) throw new Error('Toss is not active');

      const selectedBy = room.gameState.toss.selectedBy ?? 'A';
      assertCaptain(room.players[playerId], selectedBy, 'choose toss side');

      if (room.gameState.toss.choice || room.gameState.toss.tossCompleted) {
        throw new Error('Toss side already selected');
      }

      transaction.update(roomRef, {
        'gameState.toss.selectedBy': selectedBy,
        'gameState.toss.choice': choice,
      });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const tossCoin = async (roomId: string, playerId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.TOSS) throw new Error('Toss is not active');
      assertHost(room, playerId, 'toss the coin');

      if (!room.gameState.toss.choice) throw new Error('Choose heads or tails first');
      if (room.gameState.toss.tossCompleted || room.gameState.toss.result) {
        throw new Error('Coin has already been tossed');
      }

      const selectedBy = room.gameState.toss.selectedBy ?? 'A';
      const result: TossChoice = Math.random() < 0.5 ? 'heads' : 'tails';
      const winnerTeam = room.gameState.toss.choice === result ? selectedBy : otherTeam(selectedBy);

      transaction.update(roomRef, {
        status: GameStatus.TOSS_RESULT,
        'gameState.status': GameStatus.TOSS_RESULT,
        'gameState.toss.result': result,
        'gameState.toss.winnerTeam': winnerTeam,
        'gameState.toss.tossCompleted': true,
        'gameState.toss.completedAt': Date.now(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const advanceTossToDecision = async (roomId: string, playerId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.TOSS_RESULT) throw new Error('Toss result is not active');
      assertHost(room, playerId, 'advance the toss');

      if (
        !room.gameState.toss.tossCompleted ||
        !room.gameState.toss.result ||
        !room.gameState.toss.winnerTeam
      ) {
        throw new Error('Toss result is not ready yet');
      }

      transaction.update(roomRef, {
        status: GameStatus.DECISION,
        'gameState.status': GameStatus.DECISION,
      });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const resolveAiTossDecision = async (
  roomId: string,
  playerId: string
): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.DECISION) throw new Error('Decision phase is not active');
      assertHost(room, playerId, 'resolve the AI toss decision');

      const winnerTeam = room.gameState.toss.winnerTeam;
      if (!winnerTeam) throw new Error('Toss winner not decided yet');
      if (room.gameState.toss.decision) throw new Error('Bat or bowl already selected');

      const winnerCaptain = getCaptain(room.players, winnerTeam);
      if (!winnerCaptain?.isBot) {
        throw new Error('Winning team is not controlled by AI');
      }

      const decision = chooseAiTossDecision();
      const battingTeam = decision === 'bat' ? winnerTeam : otherTeam(winnerTeam);
      const players = resetPlayersForPreMatch(room.players);
      const preMatchRoom: Room = {
        ...room,
        players,
        gameState: {
          ...room.gameState,
          toss: {
            ...room.gameState.toss,
            decision,
          },
        },
      };

      transaction.update(roomRef, {
        status: GameStatus.PLAYING,
        'gameState.status': GameStatus.PLAYING,
        players,
        gameState: makePlayingGameState(preMatchRoom, battingTeam, decision),
      });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const chooseTossDecision = async (
  roomId: string,
  playerId: string,
  decision: TossDecision
): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.DECISION) throw new Error('Decision phase is not active');

      const winnerTeam = room.gameState.toss.winnerTeam;
      if (!winnerTeam) throw new Error('Toss winner not decided yet');
      if (room.gameState.toss.decision) throw new Error('Bat or bowl already selected');

      const captain = assertCaptain(room.players[playerId], winnerTeam, 'choose bat or bowl');
      if (captain.isBot) throw new Error('AI captain cannot choose manually');

      const battingTeam = decision === 'bat' ? winnerTeam : otherTeam(winnerTeam);
      const players = resetPlayersForPreMatch(room.players);
      const preMatchRoom: Room = {
        ...room,
        players,
        gameState: {
          ...room.gameState,
          toss: {
            ...room.gameState.toss,
            decision,
          },
        },
      };

      transaction.update(roomRef, {
        status: GameStatus.PLAYING,
        'gameState.status': GameStatus.PLAYING,
        players,
        gameState: makePlayingGameState(preMatchRoom, battingTeam, decision),
      });
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const submitSelection = async (
  roomId: string,
  playerId: string,
  selection: number
): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  if (!Number.isInteger(selection) || selection < 1 || selection > 6) {
    throw new Error('Selection must be between 1 and 6');
  }

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      if (!snap.exists()) throw new Error('Room not found');

      const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
      if (room.status !== GameStatus.PLAYING || !room.gameState.currentTurn) {
        return;
      }

      const currentTurn = room.gameState.currentTurn;
      const isActivePlayer =
        currentTurn.battingPlayerId === playerId || currentTurn.bowlingPlayerId === playerId;
      if (!isActivePlayer) {
        return;
      }

      const player = room.players[playerId];
      if (!player || player.selection !== null) {
        return;
      }

      const nextPlayers: Record<string, Player> = {
        ...room.players,
        [playerId]: {
          ...player,
          selection,
        },
      };

      const roomWithSelection: Room = {
        ...room,
        players: nextPlayers,
      };

      const batter = nextPlayers[currentTurn.battingPlayerId];
      const bowler = nextPlayers[currentTurn.bowlingPlayerId];
      const updates =
        batter?.selection !== null && bowler?.selection !== null
          ? processTurn(roomWithSelection) ?? { players: nextPlayers }
          : { players: nextPlayers };

      transaction.update(roomRef, flattenRoomUpdate(updates));
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const updateRoomState = async (
  roomId: string,
  updates: Partial<Room>
): Promise<void> => {
  try {
    const flat = flattenRoomUpdate(updates);
    await updateDoc(doc(db, ROOMS_COLLECTION, roomId), flat);
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};

export const subscribeToRoom = (
  roomId: string,
  callback: (room: Room) => void
) => {
  return onSnapshot(
    doc(db, ROOMS_COLLECTION, roomId),
    (snap) => {
      if (snap.exists()) {
        callback(normalizeRoomData({ id: snap.id, ...snap.data() } as Room));
      }
    },
    (error) => {
      handleFirestoreError(error, 'get', `${ROOMS_COLLECTION}/${roomId}`);
    }
  );
};

export const resetRoom = async (roomId: string): Promise<void> => {
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Room not found');

  const room = normalizeRoomData({ id: snap.id, ...snap.data() } as Room);
  const resetPlayers: Record<string, Player> = {};
  let orderA = 0;
  let orderB = 0;

  for (const [playerId, player] of Object.entries(room.players)) {
    if (player.isBot) continue;

    resetPlayers[playerId] = {
      ...player,
      score: 0,
      isOut: false,
      selection: null,
      order: player.team === 'A' ? orderA++ : orderB++,
    };
  }

  try {
    await updateDoc(roomRef, {
      status: GameStatus.LOBBY,
      players: normalizeCaptains(resetPlayers),
      gameState: makeDefaultGameState(),
    });
  } catch (error) {
    handleFirestoreError(error, 'update', `${ROOMS_COLLECTION}/${roomId}`);
  }
};
