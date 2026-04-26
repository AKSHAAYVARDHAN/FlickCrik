
export enum GameStatus {
  LOBBY = 'lobby',
  TOSS = 'toss',
  TOSS_RESULT = 'toss_result',
  DECISION = 'decision',
  PLAYING = 'playing',
  FINISHED = 'finished',
}

export type TeamId = 'A' | 'B';
export type TeamNames = Record<TeamId, string>;
export type TossChoice = 'heads' | 'tails';
export type TossDecision = 'bat' | 'bowl';

export interface Player {
  id: string;
  name: string;
  team: TeamId;
  isCaptain: boolean;
  isBot: boolean;
  score: number;       // individual runs scored (batting)
  isOut: boolean;
  selection: number | null;
  order: number;       // join order within team (used for queue sort)
}

export interface BallResult {
  batter: number;
  bowler: number;
  isOut: boolean;
  innings: 1 | 2;
  runs: number;
  battingPlayerId: string;
  bowlingPlayerId: string;
}

export interface CurrentTurn {
  battingPlayerId: string;
  bowlingPlayerId: string;
}

export interface TurnQueue {
  A: string[]; // ordered playerIds for team A
  B: string[]; // ordered playerIds for team B
}

export interface TeamData {
  score: number;
  wickets: number; // remaining wickets (starts = number of players in team)
}

export interface GameState {
  status: GameStatus;
  currentInnings: 1 | 2;
  battingTeam: TeamId;
  bowlingTeam: TeamId;
  target: number | null;
  over: boolean;
  winner: TeamId | 'TIE' | null;
  toss: TossState;
  currentTurn: CurrentTurn | null;
  turnQueue: TurnQueue;
  teamScores: Record<TeamId, number>;
  teamWickets: Record<TeamId, number>;  // remaining wickets
  lastResult: {
    batter: number;
    bowler: number;
    isOut: boolean;
    runs: number;
    battingPlayerId: string;
    bowlingPlayerId: string;
  } | null;
  ballHistory: BallResult[];
  mvpPlayerId: string | null;
}

export interface TossState {
  selectedBy: TeamId | null;
  choice: TossChoice | null;
  result: TossChoice | null;
  winnerTeam: TeamId | null;
  decision: TossDecision | null;
  tossCompleted: boolean;
  completedAt: number | null;
}

export interface Room {
  id: string;
  hostId: string;
  status: GameStatus;
  teamNames: TeamNames;
  players: Record<string, Player>;
  gameState: GameState;
  chat?: ChatMessage[];
  createdAt: any; // Firestore Timestamp
}

export interface ChatMessage {
  id: string;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: any;
}
