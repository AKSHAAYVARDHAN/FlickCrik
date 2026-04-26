import { useMemo, useState } from 'react';
import { Bot, Check, Copy, Crown, Shield, UserRound, X } from 'lucide-react';
import type { Player, Room, TeamId } from '../../types';
import { getTeamName } from '../../utils/teamNames';
import { Badge, Button, Card, cn } from '../UI';

interface LeftSidebarProps {
  className?: string;
  copied: boolean;
  myId?: string | null;
  onClose?: () => void;
  onCopy: () => void;
  room: Room;
  roomId: string;
}

function teamTone(team: TeamId) {
  return team === 'A'
    ? {
        accent: 'text-brand-blue',
        border: 'border-brand-blue/35',
        dot: 'bg-brand-blue',
        selected: 'border-brand-blue/40 bg-brand-blue/10 text-copy-primary',
      }
    : {
        accent: 'text-brand-purple',
        border: 'border-brand-purple/35',
        dot: 'bg-brand-purple',
        selected: 'border-brand-purple/40 bg-brand-purple/10 text-copy-primary',
      };
}

function statusLabel(status: Room['status']) {
  switch (status) {
    case 'lobby':
      return 'Lobby';
    case 'toss':
      return 'Toss';
    case 'toss_result':
      return 'Result';
    case 'decision':
      return 'Decision';
    case 'playing':
      return 'Live';
    case 'finished':
      return 'Finished';
    default:
      return 'Room';
  }
}

function getPlayerLabel(player: Player) {
  return player.isBot ? 'AI Bot' : player.name;
}

export default function LeftSidebar({
  className,
  copied,
  myId,
  onClose,
  onCopy,
  room,
  roomId,
}: LeftSidebarProps) {
  const [activeTeam, setActiveTeam] = useState<TeamId>('A');
  const allPlayers = useMemo(
    () => (Object.values(room.players) as Player[]).sort((a, b) => a.order - b.order),
    [room.players]
  );
  const activePlayers = allPlayers.filter((player) => player.team === activeTeam);
  const tone = teamTone(activeTeam);
  const wicketsLost = Math.max(0, activePlayers.length - room.gameState.teamWickets[activeTeam]);
  const wicketsByBowler = useMemo(() => {
    return (room.gameState.ballHistory || []).reduce<Record<string, number>>((totals, ball) => {
      if (!ball.isOut) return totals;
      totals[ball.bowlingPlayerId] = (totals[ball.bowlingPlayerId] ?? 0) + 1;
      return totals;
    }, {});
  }, [room.gameState.ballHistory]);

  return (
    <Card className={cn('panel-shell flex h-full min-h-0 flex-col overflow-hidden rounded-lg', className)}>
      <div className="border-b border-surface-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-copy-secondary">Room</div>
            <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-surface-border bg-surface-850 px-3 py-1 font-mono text-sm font-black text-copy-primary">
              <span className="truncate">{roomId}</span>
            </div>
          </div>
          <Badge tone={room.status === 'playing' ? 'green' : 'zinc'}>{statusLabel(room.status)}</Badge>
        </div>

        <Button
          onClick={onCopy}
          variant="ghost"
          icon={copied ? Check : Copy}
          className="mt-4 w-full"
        >
          {copied ? 'Copied!' : 'Invite'}
        </Button>

        {onClose ? (
          <Button onClick={onClose} variant="ghost" size="sm" icon={X} className="mt-2 w-full lg:hidden">
            Close
          </Button>
        ) : null}
      </div>

      <div className="border-b border-surface-border p-5">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-surface-border bg-surface-950 p-1">
          {(['A', 'B'] as TeamId[]).map((team) => {
            const players = allPlayers.filter((player) => player.team === team);
            const selected = activeTeam === team;
            const teamStyles = teamTone(team);

            return (
              <button
                key={team}
                type="button"
                onClick={() => setActiveTeam(team)}
                className={cn(
                  'min-h-10 rounded-md border px-2 text-left text-xs font-black transition',
                  selected
                    ? teamStyles.selected
                    : 'border-transparent text-copy-secondary hover:bg-surface-850 hover:text-copy-primary'
                )}
              >
                <span className="block truncate">{getTeamName(room, team)}</span>
                <span className="text-[10px] text-copy-muted">{players.length} players</span>
              </button>
            );
          })}
        </div>

        <div className="panel-section mt-4 rounded-lg p-4">
          <div className={cn('truncate text-[11px] font-black uppercase tracking-[0.22em]', tone.accent)}>
            {getTeamName(room, activeTeam)} score
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="text-3xl font-black text-copy-primary tabular-nums">
              {room.gameState.teamScores[activeTeam]}
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-copy-secondary">
                <Shield className="h-3.5 w-3.5" />
                {wicketsLost}/{activePlayers.length}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase text-copy-muted">wickets</div>
            </div>
          </div>
        </div>
      </div>

      <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase text-copy-secondary">Scorecard</div>
          <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
        </div>

        <div className="space-y-2.5">
          {activePlayers.map((player) => {
            const playerWickets = wicketsByBowler[player.id] ?? 0;
            const isCurrentPlayer = player.id === myId;

            return (
              <div
                key={player.id}
                className={cn(
                  'panel-section rounded-lg p-4 transition hover:-translate-y-0.5 hover:bg-surface-850'
                )}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-black',
                      player.isBot
                        ? 'border-brand-yellow/35 bg-brand-yellow/10 text-brand-yellow'
                        : cn(tone.border, 'bg-transparent', tone.accent)
                    )}
                  >
                    {player.isBot ? <Bot className="h-4 w-4" /> : getPlayerLabel(player).charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="truncate text-base font-black leading-none text-copy-primary">
                        {getPlayerLabel(player)}
                      </span>
                      {player.isCaptain ? <Crown className="h-3.5 w-3.5 shrink-0 text-brand-yellow" /> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {isCurrentPlayer ? <Badge tone="zinc">You</Badge> : null}
                      {player.isOut ? <Badge tone="red">Out</Badge> : <Badge tone="green">In</Badge>}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-surface-border bg-surface-950 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase text-copy-muted">Runs</div>
                    <div className="mt-1 text-2xl font-black leading-none text-copy-primary tabular-nums">{player.score}</div>
                  </div>
                  <div className="rounded-lg border border-surface-border bg-surface-950 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase text-copy-muted">Wkts</div>
                    <div className="mt-1 text-2xl font-black leading-none text-copy-primary tabular-nums">{playerWickets}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {activePlayers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-surface-border bg-surface-950 py-8 text-center">
              <UserRound className="mx-auto mb-2 h-5 w-5 text-copy-muted" />
              <div className="text-sm font-semibold text-copy-muted">No players yet</div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
