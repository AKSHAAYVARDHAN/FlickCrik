import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Bot, Crown, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { SUMMARY_VISIBILITY_DELAY_MS } from '../gameLogic/matchSummary';
import { Player, Room, TeamId } from '../types';
import { getTeamName } from '../utils/teamNames';
import { Badge, Button, cn } from './UI';

interface MatchSummaryProps {
  onReturnToLobby: () => void;
  otherSummaryPlayersCount: number;
  returning: boolean;
  room: Room;
}

function teamTone(team: TeamId) {
  return team === 'A'
    ? {
        accent: 'text-brand-blue',
        border: 'border-brand-blue/30',
        badge: 'blue' as const,
        glow: 'from-brand-blue/20 via-brand-blue/8 to-transparent',
      }
    : {
        accent: 'text-brand-purple',
        border: 'border-brand-purple/30',
        badge: 'purple' as const,
        glow: 'from-brand-purple/18 via-brand-purple/8 to-transparent',
      };
}

function getPlayerLabel(player: Player | null | undefined) {
  if (!player) return 'Unknown player';
  return player.isBot ? 'AI Bot' : player.name;
}

function winnerHeadline(room: Room) {
  const winner = room.gameState.winner;

  if (winner === 'TIE') {
    return {
      badge: 'Match Draw',
      title: 'Match Draw',
      subtitle: 'Both sides finished level after a tense finish.',
      tone: 'zinc' as const,
      glowClass: 'from-white/12 via-white/5 to-transparent',
    };
  }

  if (winner) {
    const winnerName = getTeamName(room, winner);
    return {
      badge: `${winnerName} won`,
      title: `${winnerName} Won \u{1F389}`,
      subtitle: 'The final whistle is in. Full scorecard below.',
      tone: teamTone(winner).badge,
      glowClass: teamTone(winner).glow,
    };
  }

  return {
    badge: 'Match complete',
    title: 'Match Complete',
    subtitle: 'Final scorecard ready.',
    tone: 'zinc' as const,
    glowClass: 'from-white/10 via-white/4 to-transparent',
  };
}

function formatSummaryLine(runs: number, wicketsLost: number, oversPlayed: string) {
  return `${runs}/${wicketsLost} (${oversPlayed} overs)`;
}

function StatCell({
  label,
  value,
  align = 'left',
  emphasis = false,
}: {
  label: string;
  value: string | number;
  align?: 'left' | 'center' | 'right';
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right'
      )}
    >
      <div
        className={cn(
          'truncate tabular-nums text-copy-primary',
          emphasis ? 'text-4xl font-black sm:text-[2.6rem]' : 'text-2xl font-black sm:text-3xl'
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-copy-secondary">
        {label}
      </div>
    </div>
  );
}

export default function MatchSummary({
  onReturnToLobby,
  otherSummaryPlayersCount,
  returning,
  room,
}: MatchSummaryProps) {
  const [now, setNow] = useState(() => Date.now());
  const { gameState, players } = room;
  const winnerMeta = winnerHeadline(room);
  const mvpPlayer = gameState.mvp ? players[gameState.mvp.playerId] ?? null : null;
  const finishedAt = gameState.finishedAt ?? null;
  const returnAvailableAt = finishedAt ? finishedAt + SUMMARY_VISIBILITY_DELAY_MS : null;
  const remainingMs = returnAvailableAt ? Math.max(0, returnAvailableAt - now) : 0;
  const canReturnToLobby = remainingMs <= 0;
  const winnerTeam = gameState.winner && gameState.winner !== 'TIE' ? gameState.winner : null;

  const orderedPlayers = useMemo(
    () => (Object.values(players) as Player[]).sort((a, b) => a.team.localeCompare(b.team) || a.order - b.order),
    [players]
  );

  useEffect(() => {
    if (canReturnToLobby) return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(timer);
  }, [canReturnToLobby]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-[#121315]/95 px-3 py-3 backdrop-blur-md sm:px-6 sm:py-6"
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={cn(
            'absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-gradient-to-b blur-3xl',
            winnerMeta.glowClass
          )}
        />
        <div className="absolute bottom-8 left-8 h-24 w-24 rounded-full bg-brand-yellow/8 blur-3xl" />
        <div className="absolute right-8 top-16 h-24 w-24 rounded-full bg-white/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[#1F2937] bg-[#121315] shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <div className="border-b border-[#1F2937] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge tone={winnerMeta.tone} className="mb-3">
                <Sparkles className="h-3.5 w-3.5" />
                {winnerMeta.badge}
              </Badge>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-copy-primary sm:text-4xl">
                {winnerMeta.title}
              </h2>
              <p className="mt-2 text-sm font-semibold text-copy-secondary">
                {winnerMeta.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[20rem]">
              {(['A', 'B'] as TeamId[]).map((team) => {
                const summary = gameState.teamSummary[team];
                const styles = teamTone(team);

                return (
                  <div
                    key={team}
                    className={cn(
                      'rounded-2xl border px-4 py-4',
                      styles.border,
                      winnerTeam === team && 'bg-surface-900'
                    )}
                  >
                    <div className={cn('truncate text-[11px] font-black uppercase tracking-[0.22em]', styles.accent)}>
                      {getTeamName(room, team)}
                    </div>
                    <div className="mt-2 text-2xl font-black text-copy-primary tabular-nums">
                      {summary.runs}/{summary.wicketsLost}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-copy-secondary">
                      {summary.oversPlayed} overs
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-3xl border border-[#1F2937] bg-surface-900/70 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-brand-yellow" />
                <div className="text-sm font-black uppercase tracking-[0.22em] text-copy-secondary">
                  Match Result
                </div>
              </div>
              <div className="grid gap-3">
                {(['A', 'B'] as TeamId[]).map((team) => {
                  const summary = gameState.teamSummary[team];
                  const styles = teamTone(team);

                  return (
                    <div
                      key={team}
                      className={cn(
                        'rounded-2xl border px-4 py-4',
                        styles.border,
                        winnerTeam === team && 'bg-surface-850/90'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={cn('text-sm font-black', styles.accent)}>
                            {getTeamName(room, team)}
                          </div>
                          <div className="mt-1 text-lg font-black text-copy-primary tabular-nums">
                            {formatSummaryLine(
                              summary.runs,
                              summary.wicketsLost,
                              summary.oversPlayed
                            )}
                          </div>
                        </div>
                        {winnerTeam === team ? <Badge tone={styles.badge}>Winner</Badge> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-[#1F2937] bg-surface-900/70 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-brand-yellow" />
                <div className="text-sm font-black uppercase tracking-[0.22em] text-copy-secondary">
                  MVP
                </div>
              </div>

              {mvpPlayer && gameState.mvp ? (
                <div className="rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 text-brand-yellow">
                      {mvpPlayer.isBot ? <Bot className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xl font-black text-copy-primary">
                        {getPlayerLabel(mvpPlayer)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-copy-secondary">
                        {getTeamName(room, mvpPlayer.team)}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-brand-yellow/20 bg-black/10 px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-copy-muted">
                            Runs
                          </div>
                          <div className="mt-1 text-2xl font-black text-copy-primary tabular-nums">
                            {gameState.mvp.runs}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-brand-yellow/20 bg-black/10 px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-copy-muted">
                            Wickets
                          </div>
                          <div className="mt-1 text-2xl font-black text-copy-primary tabular-nums">
                            {gameState.mvp.wickets}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#1F2937] px-4 py-8 text-center text-sm font-semibold text-copy-muted">
                  MVP summary will appear here once the scorecard is ready.
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-[#1F2937] bg-surface-900/70 p-5 xl:col-span-2">
              <div className="mb-5 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-copy-secondary" />
                <div className="text-sm font-black uppercase tracking-[0.22em] text-copy-secondary">
                  Player Scorecard
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                {(['A', 'B'] as TeamId[]).map((team) => {
                  const teamPlayers = orderedPlayers.filter((player) => player.team === team);
                  const styles = teamTone(team);

                  return (
                    <div key={team}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className={cn('text-lg font-black', styles.accent)}>
                          {getTeamName(room, team)}
                        </div>
                        <Badge tone={styles.badge}>
                          {formatSummaryLine(
                            gameState.teamSummary[team].runs,
                            gameState.teamSummary[team].wicketsLost,
                            gameState.teamSummary[team].oversPlayed
                          )}
                        </Badge>
                      </div>

                      <div className="grid gap-3">
                        {teamPlayers.map((player) => {
                          const stats = gameState.playerStats[player.id];

                          return (
                            <div
                              key={player.id}
                              className={cn(
                                'rounded-2xl border p-4',
                                styles.border,
                                gameState.mvp?.playerId === player.id && 'bg-brand-yellow/6'
                              )}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-base font-black text-copy-primary">
                                      {getPlayerLabel(player)}
                                    </div>
                                    {player.isCaptain ? <Crown className="h-4 w-4 text-brand-yellow" /> : null}
                                    {gameState.mvp?.playerId === player.id ? <Badge tone="yellow">MVP</Badge> : null}
                                    {player.id === room.hostId ? <Badge tone="zinc">Host</Badge> : null}
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-copy-secondary">
                                    {player.isOut ? 'Dismissed' : 'Not out / fielded'}
                                  </div>
                                </div>
                                <Badge tone={styles.badge}>{player.team}</Badge>
                              </div>

                              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                                <div className="rounded-2xl border border-[#1F2937] bg-black/10 p-4 sm:p-5">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-copy-muted">
                                    Batting
                                  </div>
                                  <div className="mt-4 grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)] items-end gap-4 sm:gap-6">
                                    <StatCell
                                      label="runs"
                                      value={stats?.runsScored ?? 0}
                                      emphasis
                                    />
                                    <StatCell
                                      label="balls"
                                      value={stats?.ballsFaced ?? 0}
                                      align="right"
                                    />
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-[#1F2937] bg-black/10 p-4 sm:p-5">
                                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-copy-muted">
                                    Bowling
                                  </div>
                                  <div className="mt-4 grid grid-cols-3 gap-4 sm:gap-5">
                                    <StatCell
                                      label="wkts"
                                      value={stats?.wicketsTaken ?? 0}
                                    />
                                    <StatCell
                                      label="runs"
                                      value={stats?.runsConceded ?? 0}
                                      align="center"
                                    />
                                    <StatCell
                                      label="overs"
                                      value={stats?.oversBowled ?? '0.0'}
                                      align="right"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="border-t border-[#1F2937] bg-[#121315]/96 px-5 py-4 sm:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-copy-secondary">
              {canReturnToLobby
                ? otherSummaryPlayersCount > 0
                  ? `${otherSummaryPlayersCount} player${otherSummaryPlayersCount !== 1 ? 's are' : ' is'} still viewing summary.`
                  : 'You are the last player viewing the summary.'
                : `Return to lobby unlocks in ${Math.ceil(remainingMs / 1000)}s so everyone can see the summary.`}
            </div>
            <Button
              onClick={onReturnToLobby}
              loading={returning}
              disabled={!canReturnToLobby || returning}
              icon={RotateCcw}
              size="lg"
              className="w-full sm:w-auto"
            >
              Return to the lobby
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
