import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Bot,
  CircleDot,
  Shield,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import { SELECTION_OPTIONS } from '../gameLogic/ballRules';
import { GameState, Player, Room, TeamId, TeamNames } from '../types';
import { getTeamName } from '../utils/teamNames';
import { Badge, Button, Card, cn } from './UI';

interface TeamScoreboardProps {
  room: Room;
  myTeam: TeamId | null;
}

function teamTone(team: TeamId) {
  return team === 'A'
    ? {
        text: 'text-brand-blue',
        border: 'border-brand-blue/35',
        dot: 'bg-brand-blue',
      }
    : {
        text: 'text-brand-purple',
        border: 'border-brand-purple/35',
        dot: 'bg-brand-purple',
      };
}

function ScoreNumber({ value, className }: { value: number; className?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className={cn('block tabular-nums', className)}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

export function TeamScoreboard({ room, myTeam }: TeamScoreboardProps) {
  const { battingTeam, teamScores, teamWickets } = room.gameState;
  const teamAPlayers = Object.values(room.players).filter((player) => player.team === 'A');
  const teamBPlayers = Object.values(room.players).filter((player) => player.team === 'B');

  const renderTeam = (team: TeamId, players: Player[]) => {
    const tone = teamTone(team);
    const isBatting = battingTeam === team;
    const isMyTeam = myTeam === team;
    const wicketsLost = Math.max(0, players.length - teamWickets[team]);

    return (
      <Card
        className={cn(
          'panel-section rounded-lg p-3.5 sm:p-4',
          isBatting && tone.border,
          isBatting && 'bg-surface-850 shadow-[0_14px_30px_rgba(0,0,0,0.2)]'
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn('truncate text-xs font-bold', tone.text)}>{getTeamName(room, team)}</div>
            <div className="mt-1 text-xs font-medium text-copy-secondary">{isMyTeam ? 'Your side' : 'Opponent'}</div>
          </div>
          {isBatting ? (
            <Badge tone="green" icon={Activity} className="shrink-0">
              Batting
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 sm:mt-5">
          <ScoreNumber value={teamScores[team]} className={cn('text-4xl font-black leading-none sm:text-5xl', tone.text)} />
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-copy-secondary">
              <Shield className="h-3.5 w-3.5" />
              {wicketsLost}/{players.length}
            </div>
            <div className="mt-0.5 text-[11px] text-copy-muted">wickets</div>
          </div>
        </div>

        <div className="mt-3 flex min-h-3 flex-wrap gap-1.5 sm:mt-4">
          {players.map((player) => (
            <span
              key={player.id}
              title={player.name}
              className={cn(
                'h-2.5 w-2.5 rounded-full ring-2 ring-black/25',
                player.isOut ? 'bg-brand-red/80' : tone.dot
              )}
            />
          ))}
        </div>
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {renderTeam('A', teamAPlayers)}
      {renderTeam('B', teamBPlayers)}
    </div>
  );
}

interface InningsBadgeProps {
  innings: 1 | 2;
  target: number | null;
  battingTeam: TeamId;
  teamNames: TeamNames;
  overNumber: number;
  ballCount: number;
}

export function InningsBadge({
  innings,
  target,
  battingTeam,
  teamNames,
  overNumber,
  ballCount,
}: InningsBadgeProps) {
  return (
    <motion.div
      key={`${innings}-${target ?? 'open'}-${overNumber}-${ballCount}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="panel-section flex items-center justify-between gap-3 rounded-lg p-3 sm:px-4 sm:py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="zinc" icon={CircleDot}>{innings === 1 ? 'First innings' : 'Second innings'}</Badge>
          <Badge tone="zinc">Over {overNumber} · {ballCount}/6</Badge>
        </div>
        {target !== null ? <Badge tone="purple">Target {target}</Badge> : <Badge tone="zinc">{getTeamName(teamNames, battingTeam)} bats</Badge>}
      </Card>
    </motion.div>
  );
}

interface MatchupBannerProps {
  batter: Player | null;
  bowler: Player | null;
  myId: string | null | undefined;
}

function PlayerAvatar({ player, active, tone }: { player: Player; active: boolean; tone: TeamId }) {
  const styles = teamTone(tone);

  return (
    <div
      className={cn(
        'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-black transition duration-200',
        active
          ? cn(styles.border, styles.text, 'bg-surface-850 shadow-[0_12px_24px_rgba(0,0,0,0.16)]')
          : 'border-surface-border bg-surface-900 text-copy-secondary'
      )}
    >
      {player.isBot ? <Bot className="h-6 w-6" /> : player.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function MatchupBanner({ batter, bowler, myId }: MatchupBannerProps) {
  if (!batter || !bowler) return null;

  const isBatterMe = batter.id === myId;
  const isBowlerMe = bowler.id === myId;

  return (
    <motion.div
      key={`${batter.id}-${bowler.id}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
    >
      <Card className="panel-section rounded-lg p-5">
        <div className="mb-3 flex items-center justify-center">
          <Badge tone="zinc" icon={Swords}>Current matchup</Badge>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0 text-center">
            <PlayerAvatar player={batter} active={isBatterMe} tone={batter.team} />
            <div className={cn('mt-2.5 truncate text-sm font-extrabold', isBatterMe ? 'text-brand-blue' : 'text-copy-primary')}>
              {isBatterMe ? 'You' : batter.name}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-copy-secondary">Batting</div>
            {isBatterMe ? <Badge className="mt-1.5" tone="green" icon={Zap}>Live</Badge> : null}
          </div>

          <div className="flex flex-col items-center gap-2 px-1">
            <div className="rounded-full border border-surface-border bg-surface-900 px-3 py-1 text-xs font-black text-copy-secondary">VS</div>
            <Swords className="h-4 w-4 text-copy-muted" />
          </div>

          <div className="min-w-0 text-center">
            <PlayerAvatar player={bowler} active={isBowlerMe} tone={bowler.team} />
            <div className={cn('mt-2.5 truncate text-sm font-extrabold', isBowlerMe ? 'text-brand-purple' : 'text-copy-primary')}>
              {isBowlerMe ? 'You' : bowler.name}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-copy-secondary">Bowling</div>
            {isBowlerMe ? <Badge className="mt-1.5" tone="green" icon={Zap}>Live</Badge> : null}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

interface ControlsProps {
  onSelect: (n: number) => void;
  disabled: boolean;
  selection: number | null;
}

export function GameControls({ onSelect, disabled, selection }: ControlsProps) {
  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7 sm:gap-3">
      {SELECTION_OPTIONS.map((num) => {
        const selected = selection === num;
        const isDotBall = num === 0;

        return (
          <motion.button
            key={num}
            whileHover={!disabled ? { y: -3, scale: 1.03 } : undefined}
            whileTap={!disabled ? { scale: 0.95 } : undefined}
            onClick={() => onSelect(num)}
            disabled={disabled}
            className={cn(
              'relative aspect-square min-h-16 overflow-hidden rounded-lg border text-2xl font-black tabular-nums transition duration-200 sm:min-h-0 sm:text-3xl',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/35 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
              selected
                ? 'border-brand-yellow-deep bg-brand-yellow text-[#120a00] shadow-[0_14px_26px_rgba(245,183,0,0.22)]'
                : isDotBall
                  ? 'border-brand-blue/30 bg-brand-blue/8 text-brand-blue hover:border-brand-blue/45 hover:bg-brand-blue/12 hover:text-brand-blue'
                  : 'border-surface-border bg-surface-900 text-copy-secondary hover:border-brand-blue/30 hover:bg-surface-850 hover:text-copy-primary',
              disabled && !selected && 'opacity-35'
            )}
          >
            <span className="relative z-10 flex h-full flex-col items-center justify-center">
              <span>{num}</span>
              {isDotBall ? (
                <span className="mt-1 text-[10px] font-extrabold tracking-[0.18em] sm:text-[11px]">
                  DOT
                </span>
              ) : null}
            </span>
            {selected ? (
              <motion.span
                layoutId="number-selection-glow"
                className="absolute inset-0 bg-white/10"
                transition={{ duration: 0.18 }}
              />
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

interface ResultOverlayProps {
  winner: TeamId | 'TIE' | null;
  myTeam: TeamId | null;
  gameState: GameState;
  teamNames: TeamNames;
  players: Record<string, Player>;
  mvp: Player | null;
  onRestart?: () => void;
  isHost: boolean;
}

export function ResultOverlay({
  winner,
  myTeam,
  gameState,
  teamNames,
  mvp,
  onRestart,
  isHost,
}: ResultOverlayProps) {
  const isTie = winner === 'TIE';
  const myTeamWon = !isTie && winner !== null && myTeam === winner;
  const teamAScore = gameState.teamScores?.A ?? 0;
  const teamBScore = gameState.teamScores?.B ?? 0;
  const tone = isTie ? 'zinc' : myTeamWon ? 'green' : 'red';
  const winnerName = winner && winner !== 'TIE' ? getTeamName(teamNames, winner) : null;
  const headline = isTie ? 'Match tied' : `${winnerName ?? 'Winner'} wins`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-md"
      >
        <Card className="panel-shell overflow-hidden rounded-lg p-6 text-center sm:p-7">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-surface-border bg-surface-900">
            <Trophy className={cn('h-8 w-8', tone === 'green' ? 'text-brand-green' : tone === 'red' ? 'text-brand-red' : 'text-copy-secondary')} />
          </div>

          <Badge tone={tone} className="mb-3">{isTie ? 'Final result' : myTeamWon ? 'Victory' : 'Match complete'}</Badge>
          <h2 className="text-3xl font-black text-copy-primary">Game over</h2>
          <p className="mt-2 text-sm font-semibold text-copy-secondary">{headline}</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="panel-section-muted rounded-lg p-4">
              <div className="truncate text-xs font-bold text-brand-blue">{getTeamName(teamNames, 'A')}</div>
              <div className="mt-1 text-4xl font-black text-copy-primary tabular-nums">{teamAScore}</div>
            </div>
            <div className="panel-section-muted rounded-lg p-4">
              <div className="truncate text-xs font-bold text-brand-purple">{getTeamName(teamNames, 'B')}</div>
              <div className="mt-1 text-4xl font-black text-copy-primary tabular-nums">{teamBScore}</div>
            </div>
          </div>

          {mvp ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-brand-yellow/35 bg-brand-yellow/10 p-3 text-left">
              <Trophy className="h-5 w-5 shrink-0 text-brand-yellow" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-brand-yellow">MVP</div>
                <div className="truncate text-sm font-black text-copy-primary">{mvp.name}</div>
                <div className="text-xs font-semibold text-copy-secondary">
                  {mvp.score} runs, {getTeamName(teamNames, mvp.team)}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            {isHost && onRestart ? (
              <Button onClick={onRestart} size="lg" variant="primary" className="w-full">
                Back to lobby
              </Button>
            ) : (
              <div className="text-sm font-semibold text-copy-secondary">Waiting for host</div>
            )}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
