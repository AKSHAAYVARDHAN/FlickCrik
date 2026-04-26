import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  Bot,
  Coins,
  Crown,
  Loader2,
  Play,
  Plus,
  Shuffle,
  X,
} from 'lucide-react';
import Layout from '../components/Layout';
import {
  GameControls,
  InningsBadge,
  MatchupBanner,
  ResultOverlay,
  TeamScoreboard,
} from '../components/GameComponents';
import InningsAnnouncement, { type AnnouncementData } from '../components/InningsAnnouncement';
import MainLayout from '../components/layout/MainLayout';
import { Badge, Button, Card, cn } from '../components/UI';
import { auth } from '../firebase/config';
import {
  addAiPlayer,
  advanceTossToDecision,
  autoAssignTeams,
  chooseTossDecision,
  chooseTossSide,
  joinRoom,
  makeCaptain,
  removeAiPlayer,
  resetRoom,
  resolveAiTossDecision,
  startMatch,
  submitSelection,
  subscribeToRoom,
  switchTeam,
  tossCoin,
  updateTeamName,
  updateRoomState,
} from '../firebase/roomService';
import { aiPick, processTurn } from '../gameLogic/engine';
import { GameStatus, Player, Room, TeamId, TossChoice, TossDecision } from '../types';
import { getTeamName, sanitizeTeamName } from '../utils/teamNames';

const INNINGS_ANNOUNCEMENT_STORAGE_PREFIX = 'handcrik_seen_innings_';
const TOSS_REVEAL_DURATION_MS = 1150;
const TOSS_RESULT_POPUP_DURATION_MS = 2500;
const AI_TOSS_DECISION_DELAY_MS = 900;

function isTossFlowStatus(status: GameStatus | null | undefined): boolean {
  return (
    status === GameStatus.TOSS ||
    status === GameStatus.TOSS_RESULT ||
    status === GameStatus.DECISION
  );
}

function getAnnouncementPhase(room: Room): AnnouncementData['phase'] {
  return room.gameState.currentInnings === 1 ? 'first' : 'second';
}

function readSeenInningsPhases(roomId: string): AnnouncementData['phase'][] {
  try {
    const raw = sessionStorage.getItem(`${INNINGS_ANNOUNCEMENT_STORAGE_PREFIX}${roomId}`);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markInningsPhaseSeen(roomId: string, phase: AnnouncementData['phase']) {
  const seen = new Set(readSeenInningsPhases(roomId));
  seen.add(phase);
  sessionStorage.setItem(
    `${INNINGS_ANNOUNCEMENT_STORAGE_PREFIX}${roomId}`,
    JSON.stringify(Array.from(seen))
  );
}

function clearSeenInningsPhases(roomId: string) {
  sessionStorage.removeItem(`${INNINGS_ANNOUNCEMENT_STORAGE_PREFIX}${roomId}`);
}

function createAnnouncementData(room: Room, me: Player): AnnouncementData {
  return {
    phase: getAnnouncementPhase(room),
    role: room.gameState.battingTeam === me.team ? 'batting' : 'bowling',
    target: room.gameState.target ?? undefined,
  };
}

function formatCaptainName(player: Player | null): string {
  if (!player) return 'Waiting';
  return player.isBot ? 'AI Bot' : player.name;
}

function statusMessageForToss(
  room: Room,
  tossSelectingTeam: TeamId,
  canChooseTossSide: boolean,
  canTossCoin: boolean,
  canChooseDecision: boolean
): string {
  const toss = room.gameState.toss;

  if (room.status === GameStatus.TOSS && !toss.choice) {
    return canChooseTossSide
      ? 'Choose heads or tails'
      : `${getTeamName(room, tossSelectingTeam)} captain is choosing`;
  }

  if (room.status === GameStatus.TOSS && toss.choice && !toss.tossCompleted) {
    return canTossCoin ? 'Host can toss the coin now' : 'Waiting for host to toss the coin';
  }

  if (room.status === GameStatus.TOSS_RESULT && toss.winnerTeam) {
    return `${getTeamName(room, toss.winnerTeam)} won the toss`;
  }

  if (room.status === GameStatus.DECISION && !toss.decision && toss.winnerTeam) {
    return canChooseDecision
      ? 'Choose bat or bowl'
      : `Waiting for ${getTeamName(room, toss.winnerTeam)} captain`;
  }

  if (room.status === GameStatus.DECISION && toss.decision && toss.winnerTeam) {
    return `${getTeamName(room, toss.winnerTeam)} chose to ${toss.decision} first`;
  }

  return 'Watching the toss';
}

function teamClasses(team: TeamId) {
  return team === 'A'
    ? {
        text: 'text-brand-blue',
        border: 'border-brand-blue/35',
        badge: 'blue' as const,
      }
    : {
        text: 'text-brand-purple',
        border: 'border-brand-purple/35',
        badge: 'purple' as const,
      };
}

interface TeamLobbyCardProps {
  actionLoading: boolean;
  hostId: string;
  members: Player[];
  me: Player | null;
  myId: string | null | undefined;
  onMakeCaptain: (playerId: string) => void;
  onRemoveBot: (playerId: string) => void;
  onRenameTeam: (teamName: string) => void;
  team: TeamId;
  teamName: string;
}

function TeamLobbyCard({
  actionLoading,
  hostId,
  members,
  me,
  myId,
  onMakeCaptain,
  onRemoveBot,
  onRenameTeam,
  team,
  teamName,
}: TeamLobbyCardProps) {
  const styles = teamClasses(team);
  const humanCount = members.filter((player) => !player.isBot).length;
  const [draftName, setDraftName] = useState(teamName);
  const canEditTeamName = Boolean(me?.isCaptain && me.team === team);
  const normalizedDraftName = sanitizeTeamName(draftName, team);
  const canSaveTeamName = normalizedDraftName !== teamName;

  useEffect(() => {
    setDraftName(teamName);
  }, [teamName]);

  return (
    <Card className={cn('panel-section rounded-lg p-4 sm:p-5', styles.border)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={cn('text-[11px] font-black uppercase tracking-[0.22em]', styles.text)}>Side {team}</div>
          <div className="mt-1 truncate text-xl font-black text-copy-primary">{teamName}</div>
          <div className="mt-1 text-xs font-semibold text-copy-secondary">
            {members.length} total, {humanCount} human
          </div>
        </div>
        <Badge tone={styles.badge}>{members.length}</Badge>
      </div>

      {canEditTeamName ? (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSaveTeamName || actionLoading) return;
            onRenameTeam(normalizedDraftName);
          }}
        >
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={24}
            placeholder={`Rename ${teamName}`}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-950 px-3 text-sm font-semibold text-copy-primary outline-none transition placeholder:text-copy-muted focus:border-brand-blue/45 focus:ring-4 focus:ring-brand-blue/10"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={actionLoading || !canSaveTeamName}
          >
            Save
          </Button>
        </form>
      ) : null}

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {members.map((player) => (
            <motion.div
              key={player.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-surface-border bg-surface-900 p-3 transition hover:-translate-y-0.5 hover:bg-surface-850'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-black',
                  player.isBot ? 'border-brand-yellow/35 bg-brand-yellow/10 text-brand-yellow' : cn(styles.border, 'bg-transparent', styles.text)
                )}
              >
                {player.isBot ? <Bot className="h-5 w-5" /> : player.name.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-black', player.isBot ? 'text-brand-yellow' : 'text-copy-primary')}>
                  {player.isBot ? 'AI Bot' : player.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {player.isCaptain ? <Badge tone="yellow" icon={Crown}>Captain</Badge> : null}
                  {player.id === myId ? <Badge tone="zinc">You</Badge> : null}
                  {!player.isBot && player.id === hostId ? <Badge tone="zinc">Host</Badge> : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {me?.isCaptain && me.team === player.team && player.id !== myId && !player.isBot ? (
                  <Button
                    onClick={() => onMakeCaptain(player.id)}
                    disabled={actionLoading}
                    size="sm"
                    variant="outline"
                  >
                    Captain
                  </Button>
                ) : null}
                {player.isBot ? (
                  <Button
                    onClick={() => onRemoveBot(player.id)}
                    disabled={actionLoading}
                    size="icon"
                    variant="ghost"
                    aria-label="Remove AI player"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-border bg-surface-900 py-8 text-center text-sm font-semibold text-copy-muted">
            Empty team
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isCoinFlipping, setIsCoinFlipping] = useState(false);
  const [revealedTossResult, setRevealedTossResult] = useState<TossChoice | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcementData, setAnnouncementData] = useState<AnnouncementData | null>(null);
  const processingRef = useRef(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossDecisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiDecisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnimatedTossResultRef = useRef<TossChoice | null>(null);
  const lastAnnouncementKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const storedName = localStorage.getItem('handcrik_name');
    if (!storedName) {
      navigate('/');
      return;
    }

    const unsubscribe = subscribeToRoom(roomId, (updatedRoom) => {
      setRoom(updatedRoom);

      let currentId = auth.currentUser?.uid || playerId;
      if (!currentId) {
        const storedPlayerId = localStorage.getItem(`handcrik_player_${roomId}`);
        if (storedPlayerId) {
          currentId = storedPlayerId;
          setPlayerId(storedPlayerId);
        }
      }

      const isAlreadyInRoom = currentId ? Boolean(updatedRoom.players[currentId]) : false;
      if (!isAlreadyInRoom && updatedRoom.status === GameStatus.LOBBY && !joining) {
        setJoining(true);
        joinRoom(roomId, storedName)
          .then((nextPlayerId) => {
            setPlayerId(nextPlayerId);
            localStorage.setItem(`handcrik_player_${roomId}`, nextPlayerId);
          })
          .catch((error) => {
            console.error(error);
          })
          .finally(() => {
            setJoining(false);
          });
      }
    });

    return () => unsubscribe();
  }, [navigate, playerId, roomId, joining]);

  useEffect(() => {
    if (!room || !roomId || room.status !== GameStatus.PLAYING) return;

    const myCurrentId = playerId || auth.currentUser?.uid;
    if (myCurrentId !== room.hostId || processingRef.current) return;

    const currentTurn = room.gameState.currentTurn;
    if (!currentTurn) return;

    const batter = room.players[currentTurn.battingPlayerId];
    const bowler = room.players[currentTurn.bowlingPlayerId];
    if (!batter || !bowler) return;

    const needsBotMove =
      (batter.isBot && batter.selection === null) ||
      (bowler.isBot && bowler.selection === null);

    if (needsBotMove) {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);

      const delay = 200 + Math.random() * 300;
      botTimerRef.current = setTimeout(() => {
        const updates: Promise<void>[] = [];
        if (batter.isBot && batter.selection === null) {
          updates.push(
            submitSelection(
              roomId,
              batter.id,
              aiPick('batter', room.gameState.ballHistory || [], batter.id)
            )
          );
        }
        if (bowler.isBot && bowler.selection === null) {
          updates.push(
            submitSelection(
              roomId,
              bowler.id,
              aiPick('bowler', room.gameState.ballHistory || [], bowler.id)
            )
          );
        }
        void Promise.all(updates);
      }, delay);

      return () => {
        if (botTimerRef.current) clearTimeout(botTimerRef.current);
      };
    }

    if (batter.selection !== null && bowler.selection !== null) {
      processingRef.current = true;
      const nextUpdates = processTurn(room);
      if (nextUpdates) {
        updateRoomState(roomId, nextUpdates).finally(() => {
          processingRef.current = false;
        });
      } else {
        processingRef.current = false;
      }
    }
  }, [room, roomId, playerId]);

  useEffect(() => {
    if (!room || !isTossFlowStatus(room.status)) {
      setIsCoinFlipping(false);
      setRevealedTossResult(null);
      lastAnimatedTossResultRef.current = null;
      if (tossRevealTimerRef.current) clearTimeout(tossRevealTimerRef.current);
      return;
    }

    const nextResult = room.gameState.toss.result;
    if (!nextResult) {
      setIsCoinFlipping(false);
      setRevealedTossResult(null);
      lastAnimatedTossResultRef.current = null;
      if (tossRevealTimerRef.current) clearTimeout(tossRevealTimerRef.current);
      return;
    }

    const tossCompletedAt = room.gameState.toss.completedAt ?? Date.now();
    const elapsedSinceToss = Math.max(0, Date.now() - tossCompletedAt);

    if (room.status === GameStatus.DECISION) {
      if (tossRevealTimerRef.current) clearTimeout(tossRevealTimerRef.current);
      lastAnimatedTossResultRef.current = nextResult;
      setIsCoinFlipping(false);
      setRevealedTossResult(nextResult);
      return;
    }

    if (elapsedSinceToss >= TOSS_REVEAL_DURATION_MS) {
      if (tossRevealTimerRef.current) clearTimeout(tossRevealTimerRef.current);
      lastAnimatedTossResultRef.current = nextResult;
      setIsCoinFlipping(false);
      setRevealedTossResult(nextResult);
      return;
    }

    if (lastAnimatedTossResultRef.current === nextResult) {
      return;
    }

    lastAnimatedTossResultRef.current = nextResult;
    setIsCoinFlipping(true);
    setRevealedTossResult(null);
    if (tossRevealTimerRef.current) clearTimeout(tossRevealTimerRef.current);
    tossRevealTimerRef.current = setTimeout(() => {
      setIsCoinFlipping(false);
      setRevealedTossResult(nextResult);
    }, TOSS_REVEAL_DURATION_MS - elapsedSinceToss);

    return () => {
      if (tossRevealTimerRef.current) clearTimeout(tossRevealTimerRef.current);
    };
  }, [room?.status, room?.gameState.toss.completedAt, room?.gameState.toss.result]);

  const myId = playerId || auth.currentUser?.uid;
  const me = myId && room?.players[myId] ? (room.players[myId] as Player) : null;
  const isHost = myId === room?.hostId;
  const currentTurn = room?.gameState.currentTurn ?? null;
  const toss = room?.gameState.toss ?? null;
  const chatSenderName = me?.name || localStorage.getItem('handcrik_name') || 'Player';

  const isMyTurn = Boolean(
    currentTurn &&
    myId &&
    (currentTurn.battingPlayerId === myId || currentTurn.bowlingPlayerId === myId)
  );
  const iAmBatting = Boolean(currentTurn && myId && currentTurn.battingPlayerId === myId);

  useEffect(() => {
    if (tossDecisionTimerRef.current) clearTimeout(tossDecisionTimerRef.current);

    if (
      !room ||
      !roomId ||
      !myId ||
      !isHost ||
      room.status !== GameStatus.TOSS_RESULT ||
      !room.gameState.toss.tossCompleted ||
      !room.gameState.toss.completedAt ||
      !room.gameState.toss.result ||
      !room.gameState.toss.winnerTeam
    ) {
      return;
    }

    const delay = Math.max(
      0,
      TOSS_REVEAL_DURATION_MS +
        TOSS_RESULT_POPUP_DURATION_MS -
        (Date.now() - room.gameState.toss.completedAt)
    );

    tossDecisionTimerRef.current = setTimeout(() => {
      void advanceTossToDecision(roomId, myId).catch((error) => {
        console.error(error);
      });
    }, delay);

    return () => {
      if (tossDecisionTimerRef.current) clearTimeout(tossDecisionTimerRef.current);
    };
  }, [
    isHost,
    myId,
    room?.gameState.toss.completedAt,
    room?.gameState.toss.result,
    room?.gameState.toss.tossCompleted,
    room?.gameState.toss.winnerTeam,
    room?.status,
    roomId,
  ]);

  useEffect(() => {
    if (aiDecisionTimerRef.current) clearTimeout(aiDecisionTimerRef.current);

    if (
      !room ||
      !roomId ||
      !myId ||
      !isHost ||
      room.status !== GameStatus.DECISION ||
      !room.gameState.toss.winnerTeam ||
      room.gameState.toss.decision
    ) {
      return;
    }

    const winningCaptain = Object.values(room.players).find(
      (player) => player.team === room.gameState.toss.winnerTeam && player.isCaptain
    );

    if (!winningCaptain?.isBot) {
      return;
    }

    aiDecisionTimerRef.current = setTimeout(() => {
      void resolveAiTossDecision(roomId, myId).catch((error) => {
        console.error(error);
      });
    }, AI_TOSS_DECISION_DELAY_MS);

    return () => {
      if (aiDecisionTimerRef.current) clearTimeout(aiDecisionTimerRef.current);
    };
  }, [
    isHost,
    myId,
    room?.gameState.toss.decision,
    room?.gameState.toss.winnerTeam,
    room?.players,
    room?.status,
    roomId,
  ]);

  useEffect(() => {
    if (!roomId || !room) return;

    if (room.status === GameStatus.LOBBY) {
      clearSeenInningsPhases(roomId);
      lastAnnouncementKeyRef.current = null;
      setShowAnnouncement(false);
      setAnnouncementData(null);
      return;
    }

    if (room.status !== GameStatus.PLAYING || !me) return;

    const phase = getAnnouncementPhase(room);
    const announcementKey = `${roomId}:${phase}`;

    if (lastAnnouncementKeyRef.current === announcementKey) {
      return;
    }

    lastAnnouncementKeyRef.current = announcementKey;

    if (readSeenInningsPhases(roomId).includes(phase)) {
      return;
    }

    setAnnouncementData(createAnnouncementData(room, me));
    setShowAnnouncement(true);
    markInningsPhaseSeen(roomId, phase);
  }, [me, room, roomId]);

  const dismissAnnouncement = () => {
    setShowAnnouncement(false);
  };

  const announcementOverlay = (
    <InningsAnnouncement
      open={showAnnouncement}
      data={announcementData}
      onDismiss={dismissAnnouncement}
    />
  );

  if (!room) {
    return (
      <>
        <Layout className="items-center">
          <Card className="panel-shell mx-auto flex w-full max-w-sm flex-col items-center justify-center rounded-lg p-8 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-brand-yellow" />
            <div className="text-sm font-bold text-copy-secondary">Loading room</div>
          </Card>
        </Layout>
        {announcementOverlay}
      </>
    );
  }

  const allPlayers = (Object.values(room.players) as Player[]).sort((a, b) => a.order - b.order);
  const teamAPlayers = allPlayers.filter((player) => player.team === 'A');
  const teamBPlayers = allPlayers.filter((player) => player.team === 'B');
  const teamAName = getTeamName(room, 'A');
  const teamBName = getTeamName(room, 'B');
  const teamACaptain = teamAPlayers.find((player) => player.isCaptain) ?? null;
  const teamBCaptain = teamBPlayers.find((player) => player.isCaptain) ?? null;
  const playerCount = allPlayers.length;
  const humanCount = allPlayers.filter((player) => !player.isBot).length;
  const isSinglePlayer = humanCount === 1;
  const isOddPlayers = humanCount > 1 && playerCount % 2 !== 0;
  const canAddAiToA = teamAPlayers.filter((player) => player.isBot).length === 0 && teamAPlayers.length <= teamBPlayers.length;
  const canAddAiToB = teamBPlayers.filter((player) => player.isBot).length === 0 && teamBPlayers.length <= teamAPlayers.length;
  const tossSelectingTeam = toss?.selectedBy ?? 'A';
  const canChooseTossSide = room.status === GameStatus.TOSS && Boolean(me?.isCaptain && me.team === tossSelectingTeam && !toss?.choice);
  const canTossCoin = room.status === GameStatus.TOSS && Boolean(isHost && toss?.choice && !toss?.tossCompleted);
  const canChooseDecision =
    room.status === GameStatus.DECISION &&
    Boolean(me?.isCaptain && me.team === toss?.winnerTeam && toss?.result && !toss?.decision);
  const isMyTeamWinner = Boolean(me && toss?.winnerTeam && me.team === toss.winnerTeam);
  const tossResultPopupMessage = toss?.winnerTeam
    ? me
      ? isMyTeamWinner
        ? 'Your Team won the toss \u{1F389}'
        : 'Opponent Team won the toss'
      : `${getTeamName(room, toss.winnerTeam)} won the toss`
    : 'Toss complete';

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const withLoad = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try {
      await fn();
    } catch (error: any) {
      alert(error.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelect = (value: number) => {
    if (!roomId || !myId || !isMyTurn || me?.selection !== null) return;
    void submitSelection(roomId, myId, value);
  };

  const handleStartVsAi = async () => {
    if (!roomId) return;
    setActionLoading(true);
    try {
      await addAiPlayer(roomId, 'B');
      await startMatch(roomId);
    } catch (error: any) {
      alert(error.message || 'Failed to start toss');
    } finally {
      setActionLoading(false);
    }
  };

  if (room.status === GameStatus.LOBBY) {
    return (
      <>
        <MainLayout
          copied={copied}
          myId={myId}
          onCopy={copyLink}
          room={room}
          roomId={roomId!}
          senderName={chatSenderName}
          title="Match lobby"
          subtitle={`${humanCount} player${humanCount !== 1 ? 's' : ''} joined`}
        >
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <TeamLobbyCard
                actionLoading={actionLoading}
                hostId={room.hostId}
                members={teamAPlayers}
                me={me}
                myId={myId}
                onMakeCaptain={(targetId) => withLoad(() => makeCaptain(roomId!, myId!, targetId))}
                onRemoveBot={(targetId) => withLoad(() => removeAiPlayer(roomId!, targetId))}
                onRenameTeam={(nextName) => withLoad(() => updateTeamName(roomId!, myId!, 'A', nextName))}
                team="A"
                teamName={teamAName}
              />
              <TeamLobbyCard
                actionLoading={actionLoading}
                hostId={room.hostId}
                members={teamBPlayers}
                me={me}
                myId={myId}
                onMakeCaptain={(targetId) => withLoad(() => makeCaptain(roomId!, myId!, targetId))}
                onRemoveBot={(targetId) => withLoad(() => removeAiPlayer(roomId!, targetId))}
                onRenameTeam={(nextName) => withLoad(() => updateTeamName(roomId!, myId!, 'B', nextName))}
                team="B"
                teamName={teamBName}
              />
            </div>

            {me ? (
              <Button
                onClick={() => withLoad(() => switchTeam(roomId!, myId!))}
                disabled={actionLoading}
                variant={me.team === 'A' ? 'secondary' : 'outline'}
                icon={ArrowLeftRight}
                className="w-full"
              >
                Switch to {getTeamName(room, me.team === 'A' ? 'B' : 'A')}
              </Button>
            ) : null}

            {isHost ? (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {isSinglePlayer ? (
                    <motion.div
                      key="solo"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      <Card className="panel-section rounded-lg p-4 sm:p-5">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Badge tone="yellow" icon={Bot}>Solo match</Badge>
                            <p className="mt-3 text-sm font-semibold text-copy-secondary">Add an AI captain and start the toss.</p>
                          </div>
                          <Button onClick={handleStartVsAi} disabled={actionLoading} loading={actionLoading} variant="warning" icon={Play}>
                            Start vs AI
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {isOddPlayers ? (
                  <Card className="panel-section rounded-lg p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Bot className="h-4 w-4 text-brand-yellow" />
                      <span className="text-sm font-black text-copy-primary">Balance teams with AI</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        onClick={() => withLoad(() => addAiPlayer(roomId!, 'A'))}
                        disabled={actionLoading || !canAddAiToA}
                        variant="outline"
                        icon={Plus}
                      >
                        AI to {teamAName}
                      </Button>
                      <Button
                        onClick={() => withLoad(() => addAiPlayer(roomId!, 'B'))}
                        disabled={actionLoading || !canAddAiToB}
                        variant="outline"
                        icon={Plus}
                      >
                        AI to {teamBName}
                      </Button>
                    </div>
                  </Card>
                ) : null}

                {!isSinglePlayer ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                    <Button
                      onClick={() => withLoad(() => autoAssignTeams(roomId!))}
                      disabled={actionLoading}
                      variant="outline"
                      icon={Shuffle}
                    >
                      Auto assign
                    </Button>
                    <Button
                      onClick={() => withLoad(() => startMatch(roomId!))}
                      loading={actionLoading}
                      disabled={playerCount < 2 || actionLoading}
                      icon={Play}
                    >
                      Start toss
                    </Button>
                  </div>
                ) : null}

                {playerCount < 2 && !isSinglePlayer ? (
                  <p className="text-center text-sm font-semibold text-copy-muted">Need at least 2 players</p>
                ) : null}
              </div>
            ) : (
              <Card className="panel-section rounded-lg p-5 text-center">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-brand-yellow" />
                <p className="text-sm font-bold text-copy-secondary">Waiting for host</p>
              </Card>
            )}
          </div>
        </MainLayout>
        {announcementOverlay}
      </>
    );
  }

  if (isTossFlowStatus(room.status)) {
    const tossStatus = statusMessageForToss(room, tossSelectingTeam, canChooseTossSide, canTossCoin, canChooseDecision);
    const visibleTossResult = revealedTossResult ?? null;

    return (
      <>
        <MainLayout
          copied={copied}
          myId={myId}
          onCopy={copyLink}
          room={room}
          roomId={roomId!}
          senderName={chatSenderName}
          title="Captain toss"
          subtitle={tossStatus}
        >
          <div className="space-y-6">
            <Card className="panel-section rounded-lg p-5 sm:p-6">
              <div className="mb-6 text-center">
                <div className="text-sm font-black text-copy-primary">
                  {formatCaptainName(teamACaptain)} vs {formatCaptainName(teamBCaptain)}
                </div>
                <p className="mt-2 text-sm font-semibold text-copy-secondary">{tossStatus}</p>
              </div>

              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                {([
                  ['A', teamACaptain],
                  ['B', teamBCaptain],
                ] as const).map(([team, captain]) => {
                  const styles = teamClasses(team);

                  return (
                    <div key={team} className={cn('panel-section-muted rounded-lg p-4', styles.border)}>
                      <div className={cn('truncate text-xs font-bold', styles.text)}>{getTeamName(room, team)} captain</div>
                      <div className="mt-2 truncate text-lg font-black text-copy-primary">{formatCaptainName(captain)}</div>
                      <div className="mt-1 text-xs font-semibold text-copy-secondary">
                        {captain?.isBot ? 'AI captain' : captain?.id === myId ? 'You' : 'Watching'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mb-6 flex justify-center">
                <div className="[perspective:1200px]">
                  <motion.div
                    animate={
                      isCoinFlipping
                        ? { rotateY: [0, 720, 1440], scale: [1, 1.08, 1] }
                        : { rotateY: visibleTossResult ? 180 : 0, scale: 1 }
                    }
                    transition={{ duration: 1.1, ease: 'easeInOut' }}
                    className="relative h-28 w-28 [transform-style:preserve-3d]"
                  >
                    <div className="absolute inset-0 flex items-center justify-center rounded-full border border-brand-yellow-deep bg-brand-yellow text-[#120a00] shadow-[0_12px_28px_rgba(245,183,0,0.2)] [backface-visibility:hidden]">
                      <div className="flex flex-col items-center">
                        <Coins className="mb-1 h-8 w-8" />
                        <span className="text-lg font-black">
                          {isCoinFlipping ? '...' : visibleTossResult ? 'Result' : 'Toss'}
                        </span>
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full border border-brand-yellow-deep bg-brand-yellow text-[#120a00] shadow-[0_12px_28px_rgba(245,183,0,0.2)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <div className="flex flex-col items-center">
                        <Coins className="mb-1 h-8 w-8" />
                        <span className="text-lg font-black">
                          {visibleTossResult ? visibleTossResult.toUpperCase() : 'Toss'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>

              {!toss?.choice ? (
                <div className="grid grid-cols-2 gap-3">
                  {(['heads', 'tails'] as TossChoice[]).map((choice) => (
                    <Button
                      key={choice}
                      onClick={() => withLoad(() => chooseTossSide(roomId!, myId!, choice))}
                      disabled={!canChooseTossSide || actionLoading}
                      variant="outline"
                      size="lg"
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
              ) : null}

              {toss?.choice && !toss.result ? (
                <div className="space-y-4">
                  <div className="panel-section-muted rounded-lg px-4 py-3 text-center text-sm font-semibold text-copy-secondary">
                    {getTeamName(room, tossSelectingTeam)} picked {toss.choice}
                  </div>
                  <Button
                    onClick={() => withLoad(() => tossCoin(roomId!, myId!))}
                    disabled={!canTossCoin || actionLoading}
                    loading={actionLoading}
                    variant="primary"
                    size="lg"
                    className="w-full"
                  >
                    Toss coin
                  </Button>
                  {!canTossCoin ? (
                    <div className="text-center text-sm font-semibold text-copy-muted">
                      Waiting for host to flip the coin.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {visibleTossResult ? (
                <div className="space-y-4">
                  <div className="panel-section-muted rounded-lg px-4 py-4 text-center">
                    <div className="text-xs font-bold text-copy-secondary">Result</div>
                    <div className="mt-2 text-2xl font-black text-copy-primary">{visibleTossResult.toUpperCase()}</div>
                    <div className="mt-2 text-sm font-semibold text-copy-secondary">
                      {toss.winnerTeam ? `${getTeamName(room, toss.winnerTeam)} won the toss` : 'Resolving winner'}
                    </div>
                    {toss.decision ? (
                      <Badge className="mt-3" tone="green">
                        {toss.winnerTeam ? getTeamName(room, toss.winnerTeam) : 'Winner'} will {toss.decision} first
                      </Badge>
                    ) : null}
                  </div>

                  {room.status === GameStatus.DECISION && !toss.decision ? (
                    canChooseDecision ? (
                      <div className="grid grid-cols-2 gap-3">
                        {(['bat', 'bowl'] as TossDecision[]).map((decision) => (
                          <Button
                            key={decision}
                            onClick={() => withLoad(() => chooseTossDecision(roomId!, myId!, decision))}
                            disabled={!canChooseDecision || actionLoading}
                            variant="outline"
                            size="lg"
                          >
                            {decision === 'bat' ? 'Bat first' : 'Bowl first'}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="panel-section-muted rounded-lg px-4 py-3 text-center text-sm font-semibold text-copy-secondary">
                        Waiting for opponent decision...
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}
            </Card>
          </div>
        </MainLayout>
        <AnimatePresence>
          {room.status === GameStatus.TOSS_RESULT && toss?.winnerTeam && visibleTossResult && !isCoinFlipping ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#050816]/55 px-4 backdrop-blur-[2px]"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="panel-shell w-full max-w-md rounded-2xl border border-brand-yellow/30 px-6 py-7 text-center shadow-[0_28px_80px_rgba(0,0,0,0.35)]"
              >
                <Badge tone="yellow" className="mx-auto">Toss result</Badge>
                <div className="mt-4 text-2xl font-black text-copy-primary">{tossResultPopupMessage}</div>
                <div className="mt-2 text-sm font-semibold text-copy-secondary">
                  Result: {visibleTossResult.toUpperCase()}
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {announcementOverlay}
      </>
    );
  }

  if (room.status === GameStatus.PLAYING) {
    const currentBatterPlayer = currentTurn ? room.players[currentTurn.battingPlayerId] : null;
    const currentBowlerPlayer = currentTurn ? room.players[currentTurn.bowlingPlayerId] : null;
    const lastResult = room.gameState.lastResult;

    return (
      <>
        <MainLayout
          copied={copied}
          mainClassName="mx-auto w-full max-w-[76rem] lg:pt-2"
          myId={myId}
          onCopy={copyLink}
          room={room}
          roomId={roomId!}
          senderName={chatSenderName}
          title="Live match"
          subtitle={`${getTeamName(room, room.gameState.battingTeam)} batting`}
        >
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3.5 xl:space-y-4"
          >
            <TeamScoreboard room={room} myTeam={me?.team || null} />
            <InningsBadge
              innings={room.gameState.currentInnings}
              target={room.gameState.target}
              battingTeam={room.gameState.battingTeam}
              teamNames={room.teamNames}
            />
            <MatchupBanner batter={currentBatterPlayer} bowler={currentBowlerPlayer} myId={myId} />

            <div className="space-y-3.5 xl:space-y-4">
              <Card className="panel-section rounded-lg p-3.5 sm:p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                  {isMyTurn ? (
                    <Badge tone="zinc">
                      {iAmBatting ? 'You are batting' : 'You are bowling'}
                    </Badge>
                  ) : (
                    <Badge tone="zinc">Spectating</Badge>
                  )}

                  <AnimatePresence mode="wait">
                    {me?.selection !== null && me?.selection !== undefined ? (
                      <motion.div
                        key="locked"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Badge tone="green">Locked in</Badge>
                      </motion.div>
                    ) : isMyTurn ? (
                      <motion.div
                        key="pick"
                        animate={{ opacity: [1, 0.45, 1] }}
                        transition={{ repeat: Infinity, duration: 1.4 }}
                      >
                        <Badge tone="zinc">Pick a number</Badge>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <GameControls
                  onSelect={handleSelect}
                  disabled={!isMyTurn || me?.selection !== null}
                  selection={me?.selection ?? null}
                />
              </Card>

              <AnimatePresence>
                {lastResult ? (
                  <motion.div
                    key={room.gameState.ballHistory.length}
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.22 }}
                  >
                    <Card className={cn('panel-section rounded-lg p-4', lastResult.isOut && 'out-flash')}>
                      <div className="mb-3 flex items-center justify-center">
                        <Badge tone={lastResult.isOut ? 'red' : 'green'}>
                          {lastResult.isOut ? 'Wicket' : `+${lastResult.runs} runs`}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                        <div className="min-w-0 text-center">
                          <div className="text-xs font-bold text-copy-secondary">Batter</div>
                          <div className={cn('mt-1 text-4xl font-black tabular-nums sm:text-5xl', lastResult.isOut ? 'text-brand-red' : 'text-brand-yellow')}>
                            {lastResult.batter}
                          </div>
                          <div className="mt-0.5 truncate text-xs font-semibold text-copy-muted">
                            {room.players[lastResult.battingPlayerId]?.isBot
                              ? 'AI Bot'
                              : room.players[lastResult.battingPlayerId]?.name}
                          </div>
                        </div>

                        <div className="flex min-w-16 flex-col items-center">
                          {lastResult.isOut ? (
                            <motion.div
                              initial={{ scale: 0.6, rotate: -8 }}
                              animate={{ scale: 1, rotate: 0 }}
                              className="rounded-full border border-brand-red/35 bg-brand-red/10 px-2.5 py-1 text-xs font-black text-[#ffc0ca]"
                            >
                              OUT
                            </motion.div>
                          ) : (
                            <div className="rounded-full border border-surface-border bg-surface-900 px-2.5 py-1 text-xs font-black text-copy-secondary">
                              VS
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 text-center">
                          <div className="text-xs font-bold text-copy-secondary">Bowler</div>
                          <div className="mt-1 text-4xl font-black text-copy-primary tabular-nums sm:text-5xl">{lastResult.bowler}</div>
                          <div className="mt-0.5 truncate text-xs font-semibold text-copy-muted">
                            {room.players[lastResult.bowlingPlayerId]?.isBot
                              ? 'AI Bot'
                              : room.players[lastResult.bowlingPlayerId]?.name}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </MainLayout>
        {announcementOverlay}
      </>
    );
  }

  if (room.status === GameStatus.FINISHED) {
    const mvp = room.gameState.mvpPlayerId ? room.players[room.gameState.mvpPlayerId] : null;

    return (
      <>
        <MainLayout
          copied={copied}
          myId={myId}
          onCopy={copyLink}
          room={room}
          roomId={roomId!}
          senderName={chatSenderName}
          title="Match result"
        >
          <ResultOverlay
            winner={room.gameState.winner}
            myTeam={me?.team || null}
            gameState={room.gameState}
            teamNames={room.teamNames}
            players={room.players}
            mvp={mvp}
            onRestart={isHost ? () => withLoad(() => resetRoom(roomId!)) : undefined}
            isHost={isHost}
          />
        </MainLayout>
        {announcementOverlay}
      </>
    );
  }

  return null;
}
