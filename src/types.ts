
export enum GameStatus {
  LOBBY = 'lobby',
  TOSS = 'toss',
  TOSS_RESULT = 'toss_result',
  DECISION = 'decision',
  PLAYING = 'playing',
  FINISHED = 'finished',
  ENDED = 'ended',
}

export type TeamId = 'A' | 'B';
export type TeamNames = Record<TeamId, string>;
export type TossChoice = 'heads' | 'tails';
export type TossDecision = 'bat' | 'bowl';
export type PlayerStatus = 'active' | 'in_lobby';
export type SelectionValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type BallOutcome = 'runs' | 'dot' | 'wicket_match' | 'wicket_dot';

export interface Player {
  id: string;
  name: string;
  team: TeamId;
  status: PlayerStatus;
  isCaptain: boolean;
  isBot: boolean;
  score: number;       // individual runs scored (batting)
  isOut: boolean;
  selection: SelectionValue | null;
  order: number;       // join order within team (used for queue sort)
}

export interface BallResult {
  batter: SelectionValue;
  bowler: SelectionValue;
  outcome: BallOutcome;
  isOut: boolean;
  innings: 1 | 2;
  runs: number;
  overNumber: number;
  ballInOver: number;
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

export type MatchEventType = 'wicket' | 'next_batter' | 'over_complete';

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  sequence: number;
  innings: 1 | 2;
  overNumber: number;
  ballInOver: number;
  title: string;
  subtitle: string;
  detail?: string;
  batterId?: string | null;
  bowlerId?: string | null;
  nextPlayerId?: string | null;
  createdAt: number;
}

export interface TeamData {
  score: number;
  wickets: number; // remaining wickets (starts = number of players in team)
}

export interface TeamSummary {
  team: TeamId;
  runs: number;
  wicketsLost: number;
  ballsPlayed: number;
  oversPlayed: string;
}

export interface PlayerMatchStats {
  playerId: string;
  team: TeamId;
  runsScored: number;
  ballsFaced: number;
  wicketsTaken: number;
  runsConceded: number;
  ballsBowled: number;
  oversBowled: string;
}

export interface MatchMVP {
  playerId: string;
  runs: number;
  wickets: number;
  rating: number;
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
  playersQueue: TurnQueue;
  currentBatterId: string | null;
  currentBowlerId: string | null;
  ballCount: number;
  overNumber: number;
  lastBowlerId: string | null;
  teamScores: Record<TeamId, number>;
  teamWickets: Record<TeamId, number>;  // remaining wickets
  lastResult: {
    batter: SelectionValue;
    bowler: SelectionValue;
    outcome: BallOutcome;
    isOut: boolean;
    runs: number;
    overNumber: number;
    ballInOver: number;
    battingPlayerId: string;
    bowlingPlayerId: string;
  } | null;
  ballHistory: BallResult[];
  latestEvent: MatchEvent | null;
  matchEvents: MatchEvent[];
  eventSequence: number;
  teamSummary: Record<TeamId, TeamSummary>;
  playerStats: Record<string, PlayerMatchStats>;
  mvp: MatchMVP | null;
  finishedAt: number | null;
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
