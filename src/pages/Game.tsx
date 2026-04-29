import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  Bot,
  Coins,
  Crown,
  Loader2,
  LogOut,
  Play,
  Plus,
  Power,
  Shuffle,
  User,
  X,
} from 'lucide-react';
import Layout from '../components/Layout';
import {
  GameControls,
  InningsBadge,
  MatchupBanner,
  TeamScoreboard,
} from '../components/GameComponents';
import MatchSummary from '../components/MatchSummary';
import MatchEventPopup, { type MatchPopupState } from '../components/MatchEventPopup';
import MainLayout from '../components/layout/MainLayout';
import { Badge, Button, Card, cn, InputField } from '../components/UI';
import {
  addAiPlayer,
  advanceMatchEventPause,
  advanceTossToDecision,
  autoAssignTeams,
  chooseTossDecision,
  chooseTossSide,
  createRoom,
  endRoom,
  heartbeatPlayerPresence,
  joinRoom,
  kickPlayer,
  leaveRoom,
  PLAYER_HEARTBEAT_INTERVAL_MS,
  reconcileRoomLifecycle,
  makeCaptain,
  resolveAutomatedTossChoice,
  resolveAiTossDecision,
  returnPlayerToLobby,
  startMatch,
  submitSelection,
  subscribeToRoom,
  switchTeam,
  tossCoin,
  updateTeamName,
} from '../firebase/roomService';
import {
  formatSelectionValue,
  getBallOutcomeDetail,
  getBallOutcomeLabel,
} from '../gameLogic/ballRules';
import {
  isBlockingMatchEventType,
  MATCH_EVENT_PAUSE_FAILSAFE_MS,
} from '../gameLogic/matchEvents';
import { aiPick } from '../gameLogic/engine';
import { GameStatus, MatchEvent, Player, Room, TeamId, TossChoice, TossDecision } from '../types';
import {
  clearPendingJoinStorageKey,
  clearRoomPlayerId,
  getPendingJoinStorageKey,
  getStoredRoomPlayerId,
  getStoredPlayerName,
  isValidPlayerName,
  persistRoomPlayerId,
  persistPlayerName,
  PLAYER_NAME_MAX_LENGTH,
  setRoomExitNotice,
  sanitizePlayerName,
} from '../utils/playerIdentity';
import { getTeamName, sanitizeTeamName } from '../utils/teamNames';

const TOSS_REVEAL_DURATION_MS = 1150;
const TOSS_RESULT_POPUP_DURATION_MS = 2500;
const AI_TOSS_DECISION_DELAY_MS = 900;
const JOIN_REMOVAL_GRACE_MS = 5000;
type GameView = 'game' | 'summary' | 'lobby';
type RoomActionType = 'exit' | 'end';
type RoomLookupState = 'loading' | 'ready' | 'expired';

function isTossFlowStatus(status: GameStatus | null | undefined): boolean {
  return (
    status === GameStatus.TOSS ||
    status === GameStatus.TOSS_RESULT ||
    status === GameStatus.DECISION
  );
}

function formatCaptainName(player: Player | null): string {
  if (!player) return 'Waiting';
  return player.isBot ? 'AI Bot' : player.name;
}

function isAutomatedPlayer(player: Player | null | undefined): boolean {
  return Boolean(player && (player.isBot || player.isBotControlled));
}

function getViewForRoom(room: Room | null, playerId: string | null | undefined): GameView {
  if (!room) return 'game';

  if (room.status === GameStatus.LOBBY) {
    return 'lobby';
  }

  if (room.status === GameStatus.FINISHED) {
    const playerStatus = playerId ? room.players[playerId]?.status : null;
    return playerStatus === 'in_lobby' ? 'lobby' : 'summary';
  }

  return 'game';
}

function resolvePlayerId(roomId: string | undefined, playerId: string | null): string | null {
  if (playerId) return playerId;
  if (roomId) {
    const storedPlayerId = getStoredRoomPlayerId(roomId);
    if (storedPlayerId) return storedPlayerId;
  }
  return null;
}

function isExpiredRoomError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return /room expired|room not found|room has been closed/i.test(message);
}

function isJoinGraceActive(until: number | null): boolean {
  return typeof until === 'number' && until > Date.now();
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

const EMPTY_MATCH_POPUP_STATE: MatchPopupState = {
  isOpen: false,
  type: 'over',
  message: '',
  event: null,
};

function getMatchPopupType(event: MatchEvent): MatchPopupState['type'] {
  switch (event.type) {
    case 'wicket':
      return 'wicket';
    case 'innings_start':
      return 'innings';
    case 'match_result':
      return 'result';
    case 'over_complete':
      return 'over';
    default:
      return 'over';
  }
}

function createMatchPopupState(event: MatchEvent): MatchPopupState {
  return {
    isOpen: true,
    type: getMatchPopupType(event),
    message: event.title,
    event,
  };
}

function isPopupMatchEvent(event: MatchEvent): boolean {
  return isBlockingMatchEventType(event.type);
}

function getQueuedPauseEvents(matchEvents: MatchEvent[], pauseUntilEventId: string | null): MatchEvent[] {
  if (!pauseUntilEventId) {
    return [];
  }

  const pauseEventIndex = matchEvents.findIndex((event) => event.id === pauseUntilEventId);
  if (pauseEventIndex < 0) {
    return [];
  }

  return matchEvents.slice(pauseEventIndex).filter(isPopupMatchEvent);
}

interface TeamLobbyCardProps {
  actionLoading: boolean;
  canKickPlayers?: boolean;
  hostId: string;
  interactionDisabled?: boolean;
  members: Player[];
  me: Player | null;
  myId: string | null | undefined;
  onKickPlayer: (player: Player) => void;
  onMakeCaptain: (playerId: string) => void;
  onRenameTeam: (teamName: string) => void;
  team: TeamId;
  teamName: string;
}

type JoinIdentityMode = 'confirm' | 'edit';

interface JoinNameGateProps {
  error: string | null;
  loading: boolean;
  mode: JoinIdentityMode;
  name: string;
  onConfirmStoredName: () => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onSwitchToEdit: () => void;
  roomId: string;
  storedName: string | null;
}

interface RoomActionDialogProps {
  action: RoomActionType | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

interface KickPlayerDialogProps {
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  player: Player | null;
}

interface RoomExpiredViewProps {
  loading: boolean;
  onCreateNewRoom: () => void;
  roomId: string;
}

function JoinNameGate({
  error,
  loading,
  mode,
  name,
  onConfirmStoredName,
  onNameChange,
  onSubmit,
  onSwitchToEdit,
  roomId,
  storedName,
}: JoinNameGateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#050816]/78 px-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Card className="panel-shell rounded-2xl p-6 sm:p-7">
          <Badge tone="yellow" className="mb-4">Join room {roomId}</Badge>

          {mode === 'confirm' && storedName ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black text-copy-primary">Continue as {storedName}?</h2>
                <p className="mt-2 text-sm font-semibold text-copy-secondary">
                  You opened an invite link. Choose this identity or enter a different name before joining.
                </p>
              </div>

              {error ? (
                <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm font-semibold text-[#ffc0ca]">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3">
                <Button
                  onClick={onConfirmStoredName}
                  loading={loading}
                  size="lg"
                  className="w-full"
                >
                  Continue as {storedName}
                </Button>
                <Button
                  onClick={onSwitchToEdit}
                  disabled={loading}
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  Change name
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              <div>
                <h2 className="text-2xl font-black text-copy-primary">Enter your name</h2>
                <p className="mt-2 text-sm font-semibold text-copy-secondary">
                  Confirm your player identity before joining this room.
                </p>
              </div>

              <InputField
                label="Player name"
                icon={User}
                placeholder="Enter your name"
                value={name}
                maxLength={PLAYER_NAME_MAX_LENGTH}
                autoFocus
                onChange={(event) => onNameChange(event.target.value)}
                helper={`Up to ${PLAYER_NAME_MAX_LENGTH} characters`}
              />

              {error ? (
                <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-3 text-sm font-semibold text-[#ffc0ca]">
                  {error}
                </div>
              ) : null}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                Join Game
              </Button>
            </form>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}

function RoomActionDialog({
  action,
  loading,
  onCancel,
  onConfirm,
}: RoomActionDialogProps) {
  if (!action) return null;

  const isEndingRoom = action === 'end';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[96] flex items-center justify-center bg-[#050816]/82 px-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Card className="panel-shell rounded-2xl p-6 sm:p-7">
          <Badge tone={isEndingRoom ? 'red' : 'yellow'} className="mb-4">
            {isEndingRoom ? 'End room' : 'Exit room'}
          </Badge>

          <h2 className="text-2xl font-black text-copy-primary">
            {isEndingRoom
              ? 'End the room for all players?'
              : 'Are you sure you want to leave the room?'}
          </h2>
          <p className="mt-3 text-sm font-semibold text-copy-secondary">
            {isEndingRoom
              ? 'This closes the room, removes every player, and sends everyone back to the home screen.'
              : 'You will be removed from the room and returned to the home screen.'}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              onClick={onConfirm}
              loading={loading}
              variant={isEndingRoom ? 'danger' : 'primary'}
              size="lg"
              className="w-full"
            >
              Confirm
            </Button>
            <Button
              onClick={onCancel}
              disabled={loading}
              variant="outline"
              size="lg"
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function KickPlayerDialog({
  loading,
  onCancel,
  onConfirm,
  player,
}: KickPlayerDialogProps) {
  if (!player) return null;

  const playerLabel = player.isBot ? 'AI Bot' : player.name;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[97] flex items-center justify-center bg-[#050816]/82 px-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Card className="panel-shell rounded-2xl p-6 sm:p-7">
          <Badge tone="red" className="mb-4">Kick player</Badge>

          <h2 className="text-2xl font-black text-copy-primary">
            Remove this player from the room?
          </h2>
          <p className="mt-3 text-sm font-semibold text-copy-secondary">
            {playerLabel} will be sent back to the match entry screen immediately.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              onClick={onConfirm}
              loading={loading}
              variant="danger"
              size="lg"
              className="w-full"
            >
              Confirm
            </Button>
            <Button
              onClick={onCancel}
              disabled={loading}
              variant="outline"
              size="lg"
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function RoomExpiredView({
  loading,
  onCreateNewRoom,
  roomId,
}: RoomExpiredViewProps) {
  return (
    <Layout className="items-center">
      <Card className="panel-shell mx-auto w-full max-w-lg rounded-2xl p-7 text-center sm:p-8">
        <Badge tone="red" className="mx-auto">Invite unavailable</Badge>
        <h1 className="mt-5 text-3xl font-black text-copy-primary sm:text-4xl">Room Expired</h1>
        <p className="mt-3 text-sm font-semibold text-copy-secondary sm:text-base">
          This room is no longer available. Please create a new room.
        </p>
        <div className="mt-7">
          <Button
            onClick={onCreateNewRoom}
            loading={loading}
            size="lg"
            className="w-full"
          >
            Create New Room
          </Button>
        </div>
        <div className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-copy-muted">
          Room code {roomId}
        </div>
      </Card>
    </Layout>
  );
}

function TeamLobbyCard({
  actionLoading,
  canKickPlayers = false,
  hostId,
  interactionDisabled = false,
  members,
  me,
  myId,
  onKickPlayer,
  onMakeCaptain,
  onRenameTeam,
  team,
  teamName,
}: TeamLobbyCardProps) {
  const styles = teamClasses(team);
  const humanCount = members.filter((player) => !player.isBot).length;
  const [draftName, setDraftName] = useState(teamName);
  const canEditTeamName = !interactionDisabled && Boolean(me?.isCaptain && me.team === team);
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
            disabled={interactionDisabled || actionLoading}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-950 px-3 text-sm font-semibold text-copy-primary outline-none transition placeholder:text-copy-muted focus:border-brand-blue/45 focus:ring-4 focus:ring-brand-blue/10"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={interactionDisabled || actionLoading || !canSaveTeamName}
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
                  {!player.isBot && !player.isOnline ? <Badge tone="red">Offline</Badge> : null}
                  {!player.isBot && player.isBotControlled ? <Badge tone="yellow" icon={Bot}>Bot Playing</Badge> : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {!interactionDisabled &&
                me?.isCaptain &&
                me.team === player.team &&
                player.id !== myId &&
                !player.isBot ? (
                  <Button
                    onClick={() => onMakeCaptain(player.id)}
                    disabled={actionLoading}
                    size="sm"
                    variant="outline"
                  >
                    Captain
                  </Button>
                ) : null}
                {!interactionDisabled &&
                canKickPlayers &&
                player.id !== myId ? (
                  <Button
                    onClick={() => onKickPlayer(player)}
                    disabled={actionLoading}
                    size="sm"
                    variant="ghost"
                  >
                    Kick
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
  const [roomLookupState, setRoomLookupState] = useState<RoomLookupState>('loading');
  const [view, setView] = useState<GameView>('game');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinIdentityMode, setJoinIdentityMode] = useState<JoinIdentityMode>('edit');
  const [joinName, setJoinName] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showJoinNameGate, setShowJoinNameGate] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [returningToLobby, setReturningToLobby] = useState(false);
  const [showReplayReadyBanner, setShowReplayReadyBanner] = useState(false);
  const [isCoinFlipping, setIsCoinFlipping] = useState(false);
  const [revealedTossResult, setRevealedTossResult] = useState<TossChoice | null>(null);
  const [queuedMatchEvents, setQueuedMatchEvents] = useState<MatchEvent[]>([]);
  const [activeMatchEvent, setActiveMatchEvent] = useState<MatchEvent | null>(null);
  const [matchPopupState, setMatchPopupState] = useState<MatchPopupState>(EMPTY_MATCH_POPUP_STATE);
  const [roomActionType, setRoomActionType] = useState<RoomActionType | null>(null);
  const [kickTarget, setKickTarget] = useState<Player | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const automatedTossChoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossDecisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiDecisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnimatedTossResultRef = useRef<TossChoice | null>(null);
  const matchEventStreamInitializedRef = useRef(false);
  const lastSeenMatchEventSequenceRef = useRef(0);
  const lastObservedMatchStatusRef = useRef<GameStatus | null>(null);
  const joinInFlightRef = useRef(false);
  const joinGateInitializedRef = useRef(false);
  const pendingJoinPlayerIdRef = useRef<string | null>(null);
  const joinGraceUntilRef = useRef<number | null>(null);
  const previousRoomStatusRef = useRef<GameStatus | null>(null);
  const hasBeenRoomMemberRef = useRef(false);
  const roomExitHandledRef = useRef(false);
  const pauseAdvanceInFlightRef = useRef<string | null>(null);
  const resolvedPlayerId = resolvePlayerId(roomId, playerId);
  const hasResolvedPlayerInRoom = Boolean(resolvedPlayerId && room?.players[resolvedPlayerId]);

  const leaveCurrentRoomView = (targetRoomId: string, notice?: string) => {
    if (roomExitHandledRef.current) return;

    roomExitHandledRef.current = true;
    if (notice) {
      setRoomExitNotice(notice);
    }
    clearRoomPlayerId(targetRoomId);
    clearPendingJoinStorageKey(targetRoomId);
    joinInFlightRef.current = false;
    joinGateInitializedRef.current = false;
    pendingJoinPlayerIdRef.current = null;
    joinGraceUntilRef.current = null;
    hasBeenRoomMemberRef.current = false;
    matchEventStreamInitializedRef.current = false;
    lastSeenMatchEventSequenceRef.current = 0;
    lastObservedMatchStatusRef.current = null;
    pauseAdvanceInFlightRef.current = null;
    setRoomActionType(null);
    setShowJoinNameGate(false);
    setJoinError(null);
    setJoining(false);
    setActionLoading(false);
    setReturningToLobby(false);
    setQueuedMatchEvents([]);
    setActiveMatchEvent(null);
    setMatchPopupState(EMPTY_MATCH_POPUP_STATE);
    setRoomLookupState('loading');
    setPlayerId(null);
    setRoom(null);
    navigate('/', { replace: true });
  };

  const openJoinNameGate = (preferredMode: JoinIdentityMode = 'edit') => {
    const storedName = getStoredPlayerName();
    const nextMode =
      preferredMode === 'confirm' && isValidPlayerName(storedName) ? 'confirm' : 'edit';

    setJoinIdentityMode(nextMode);
    setJoinName(storedName);
    setJoinError(null);
    setShowJoinNameGate(true);
    joinGateInitializedRef.current = true;
  };

  const completeRoomJoin = async (rawName: string) => {
    if (!roomId || joinInFlightRef.current) return;

    const nextName = sanitizePlayerName(rawName);
    if (!nextName) {
      setJoinIdentityMode('edit');
      setJoinError('Please enter your name to join.');
      setShowJoinNameGate(true);
      return;
    }

    joinInFlightRef.current = true;
    setJoining(true);
    setJoinError(null);

    try {
      const nextPlayerId = await joinRoom(roomId, nextName);
      persistPlayerName(nextName);
      persistRoomPlayerId(roomId, nextPlayerId);
      clearPendingJoinStorageKey(roomId);
      pendingJoinPlayerIdRef.current = nextPlayerId;
      joinGraceUntilRef.current = Date.now() + JOIN_REMOVAL_GRACE_MS;
      hasBeenRoomMemberRef.current = false;
      roomExitHandledRef.current = false;
      setPlayerId(nextPlayerId);
      setJoinName(nextName);
      setShowJoinNameGate(false);
    } catch (error: any) {
      if (isExpiredRoomError(error)) {
        pendingJoinPlayerIdRef.current = null;
        joinGraceUntilRef.current = null;
        clearRoomPlayerId(roomId);
        clearPendingJoinStorageKey(roomId);
        setPlayerId(null);
        setShowJoinNameGate(false);
        setRoomLookupState('expired');
        return;
      }

      pendingJoinPlayerIdRef.current = null;
      joinGraceUntilRef.current = null;
      setJoinIdentityMode('edit');
      setJoinError(error?.message || 'Unable to join room');
      setShowJoinNameGate(true);
    } finally {
      joinInFlightRef.current = false;
      setJoining(false);
    }
  };

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const bootstrapRoom = async () => {
      setRoomLookupState('loading');

      try {
        const nextRoom = await reconcileRoomLifecycle(roomId, resolvePlayerId(roomId, playerId));
        if (cancelled) return;

        if (!nextRoom?.isActive) {
          clearRoomPlayerId(roomId);
          clearPendingJoinStorageKey(roomId);
          pendingJoinPlayerIdRef.current = null;
          joinGraceUntilRef.current = null;
          hasBeenRoomMemberRef.current = false;
          joinInFlightRef.current = false;
          joinGateInitializedRef.current = true;
          setShowJoinNameGate(false);
          setJoinError(null);
          setJoining(false);
          setPlayerId(null);
          setRoom(nextRoom);
          setRoomLookupState('expired');
          return;
        }

        setRoom(nextRoom);
        setRoomLookupState('ready');

        const storedPlayerId = getStoredRoomPlayerId(roomId);
        const validStoredPlayerId =
          storedPlayerId && nextRoom.players[storedPlayerId] ? storedPlayerId : null;

        if (validStoredPlayerId) {
          persistRoomPlayerId(roomId, validStoredPlayerId);
          clearPendingJoinStorageKey(roomId);
          pendingJoinPlayerIdRef.current = null;
          joinGraceUntilRef.current = null;
          hasBeenRoomMemberRef.current = true;
          roomExitHandledRef.current = false;
          setPlayerId(validStoredPlayerId);
          setShowJoinNameGate(false);
          setJoinError(null);
          joinGateInitializedRef.current = false;
          return;
        }

        clearRoomPlayerId(roomId);
        setPlayerId(null);

        const pendingJoinName = sanitizePlayerName(
          sessionStorage.getItem(getPendingJoinStorageKey(roomId)) ?? ''
        );

        if (pendingJoinName && !joinInFlightRef.current) {
          void completeRoomJoin(pendingJoinName);
          return;
        }

        if (!joinGateInitializedRef.current) {
          openJoinNameGate(isValidPlayerName(getStoredPlayerName()) ? 'confirm' : 'edit');
        }
      } catch (error) {
        if (cancelled) return;

        if (isExpiredRoomError(error)) {
          clearRoomPlayerId(roomId);
          clearPendingJoinStorageKey(roomId);
          pendingJoinPlayerIdRef.current = null;
          joinGraceUntilRef.current = null;
          setRoom(null);
          setPlayerId(null);
          setShowJoinNameGate(false);
          setRoomLookupState('expired');
          return;
        }

        setJoinError(error instanceof Error ? error.message : 'Unable to load room');
      }
    };

    void bootstrapRoom();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || roomLookupState !== 'ready') return;

    const unsubscribe = subscribeToRoom(roomId, (updatedRoom) => {
      setRoom(updatedRoom);

      if (!updatedRoom.isActive) {
        clearRoomPlayerId(roomId);
        clearPendingJoinStorageKey(roomId);
        pendingJoinPlayerIdRef.current = null;
        joinGraceUntilRef.current = null;
        hasBeenRoomMemberRef.current = false;
        joinInFlightRef.current = false;
        joinGateInitializedRef.current = true;
        setShowJoinNameGate(false);
        setJoinError(null);
        setJoining(false);
        setPlayerId(null);
        setRoomLookupState('expired');
        return;
      }

      const currentId = resolvePlayerId(roomId, playerId);
      const pendingJoinPlayerId = pendingJoinPlayerIdRef.current;
      const isPendingJoinConfirmed = Boolean(
        pendingJoinPlayerId && updatedRoom.players[pendingJoinPlayerId]
      );
      const joinGraceActive = isJoinGraceActive(joinGraceUntilRef.current);

      if (isPendingJoinConfirmed) {
        pendingJoinPlayerIdRef.current = null;
        joinGraceUntilRef.current = null;
        hasBeenRoomMemberRef.current = true;
        roomExitHandledRef.current = false;

        if (playerId !== pendingJoinPlayerId) {
          setPlayerId(pendingJoinPlayerId);
        }
      }

      const isAlreadyInRoom = currentId ? Boolean(updatedRoom.players[currentId]) : false;

      if (isAlreadyInRoom) {
        if (!playerId) {
          setPlayerId(currentId);
        }

        pendingJoinPlayerIdRef.current = null;
        joinGraceUntilRef.current = null;
        hasBeenRoomMemberRef.current = true;
        roomExitHandledRef.current = false;
        setShowJoinNameGate(false);
        setJoinError(null);
        joinGateInitializedRef.current = false;
        return;
      }

      if (joinInFlightRef.current || joinGraceActive) {
        return;
      }

      if (currentId && !updatedRoom.players[currentId]) {
        clearRoomPlayerId(roomId);
        setPlayerId(null);
      }

      if (hasBeenRoomMemberRef.current) {
        leaveCurrentRoomView(roomId, "You've been removed from the room.");
        return;
      }

      if (updatedRoom.status !== GameStatus.LOBBY) {
        return;
      }

      const pendingJoinName = sanitizePlayerName(
        sessionStorage.getItem(getPendingJoinStorageKey(roomId)) ?? ''
      );

      if (pendingJoinName && !joinInFlightRef.current) {
        void completeRoomJoin(pendingJoinName);
        return;
      }

      if (!joinGateInitializedRef.current) {
        openJoinNameGate(isValidPlayerName(getStoredPlayerName()) ? 'confirm' : 'edit');
      }
    });

    return () => unsubscribe();
  }, [playerId, roomId, roomLookupState]);

  useEffect(() => {
    if (!room || !roomId || room.status !== GameStatus.PLAYING) return;
    if (room.gameState.match.isPaused) {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      return;
    }

    const myCurrentId = resolvePlayerId(roomId, playerId);
    if (!myCurrentId || !room.players[myCurrentId]) return;

    const currentTurn = room.gameState.currentTurn;
    if (!currentTurn) return;

    const batter = room.players[currentTurn.battingPlayerId];
    const bowler = room.players[currentTurn.bowlingPlayerId];
    if (!batter || !bowler) return;

    const needsBotMove =
      (isAutomatedPlayer(batter) && batter.selection === null) ||
      (isAutomatedPlayer(bowler) && bowler.selection === null);

    if (!needsBotMove) {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      return;
    }

    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    const delay = 200 + Math.random() * 300;
    botTimerRef.current = setTimeout(() => {
      const updates: Promise<void>[] = [];

      if (isAutomatedPlayer(batter) && batter.selection === null) {
        updates.push(
          submitSelection(
            roomId,
            batter.id,
            aiPick('batter', room.gameState.ballHistory || [], batter.id),
            { automated: true }
          )
        );
      }

      if (isAutomatedPlayer(bowler) && bowler.selection === null) {
        updates.push(
          submitSelection(
            roomId,
            bowler.id,
            aiPick('bowler', room.gameState.ballHistory || [], bowler.id),
            { automated: true }
          )
        );
      }

      void Promise.all(updates);
    }, delay);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [playerId, room, roomId]);

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

  useEffect(() => {
    joinGateInitializedRef.current = false;
    joinInFlightRef.current = false;
    pendingJoinPlayerIdRef.current = null;
    joinGraceUntilRef.current = null;
    hasBeenRoomMemberRef.current = false;
    roomExitHandledRef.current = false;
    setRoomLookupState('loading');
    setRoom(null);
    setPlayerId(null);
    setJoinError(null);
    setShowJoinNameGate(false);
    setJoinIdentityMode('edit');
    setJoinName('');
    setView('game');
    setReturningToLobby(false);
    setShowReplayReadyBanner(false);
    previousRoomStatusRef.current = null;
    matchEventStreamInitializedRef.current = false;
    lastSeenMatchEventSequenceRef.current = 0;
    lastObservedMatchStatusRef.current = null;
    pauseAdvanceInFlightRef.current = null;
    setMatchPopupState(EMPTY_MATCH_POPUP_STATE);
    setQueuedMatchEvents([]);
    setActiveMatchEvent(null);
    setRoomActionType(null);
    setKickTarget(null);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    persistRoomPlayerId(roomId, playerId);
  }, [playerId, roomId]);

  useEffect(() => {
    if (!roomId || !resolvedPlayerId || !room?.isActive || !hasResolvedPlayerInRoom) return;
    void heartbeatPlayerPresence(roomId, resolvedPlayerId).catch((error) => {
      console.warn('Unable to update player presence.', error);
    });

    const heartbeatTimer = window.setInterval(() => {
      void heartbeatPlayerPresence(roomId, resolvedPlayerId).catch((error) => {
        console.warn('Unable to update player presence.', error);
      });
    }, PLAYER_HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(heartbeatTimer);
  }, [hasResolvedPlayerInRoom, resolvedPlayerId, room?.isActive, roomId]);

  useEffect(() => {
    if (!roomId || !resolvedPlayerId || !room?.isActive || !hasResolvedPlayerInRoom) return;

    const syncPresence = () => {
      if (document.visibilityState === 'hidden') return;
      void heartbeatPlayerPresence(roomId, resolvedPlayerId).catch((error) => {
        console.warn('Unable to refresh player presence.', error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncPresence();
      }
    };

    window.addEventListener('focus', syncPresence);
    window.addEventListener('online', syncPresence);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncPresence);
      window.removeEventListener('online', syncPresence);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasResolvedPlayerInRoom, resolvedPlayerId, room?.isActive, roomId]);

  useEffect(() => {
    const currentPlayerId = resolvePlayerId(roomId, playerId);
    const nextView = getViewForRoom(room, currentPlayerId);

    setView((currentView) => {
      if (
        returningToLobby &&
        currentView === 'lobby' &&
        room?.status === GameStatus.FINISHED &&
        nextView === 'summary'
      ) {
        return currentView;
      }

      return currentView === nextView ? currentView : nextView;
    });

    if (!room || room.status !== GameStatus.FINISHED || nextView === 'lobby') {
      setReturningToLobby(false);
    }
  }, [playerId, returningToLobby, room, roomId]);

  useEffect(() => {
    const previousStatus = previousRoomStatusRef.current;
    const currentStatus = room?.status ?? null;

    if (previousStatus === GameStatus.FINISHED && currentStatus === GameStatus.LOBBY) {
      setShowReplayReadyBanner(true);
    } else if (currentStatus !== GameStatus.LOBBY) {
      setShowReplayReadyBanner(false);
    }

    previousRoomStatusRef.current = currentStatus;
  }, [room?.status]);

  const myId = resolvedPlayerId;
  const me = myId && room?.players[myId] ? (room.players[myId] as Player) : null;
  const isHost = myId === room?.hostId;
  const currentTurn = room?.gameState.currentTurn ?? null;
  const toss = room?.gameState.toss ?? null;
  const chatSenderName = me?.name || getStoredPlayerName() || 'Player';

  const isMyTurn = Boolean(
    currentTurn &&
    myId &&
    (currentTurn.battingPlayerId === myId || currentTurn.bowlingPlayerId === myId)
  );
  const isGameplayPaused = Boolean(room?.gameState.match.isPaused);
  const currentPauseEventId = room?.gameState.match.pauseUntilEventId ?? null;
  const hasManualTurnControl = Boolean(
    isMyTurn && me?.isOnline && !me?.isBotControlled && !isGameplayPaused
  );
  const iAmBatting = Boolean(currentTurn && myId && currentTurn.battingPlayerId === myId);

  useEffect(() => {
    if (automatedTossChoiceTimerRef.current) clearTimeout(automatedTossChoiceTimerRef.current);

    if (
      !room ||
      !roomId ||
      !myId ||
      !isHost ||
      room.status !== GameStatus.TOSS ||
      room.gameState.toss.tossCompleted ||
      room.gameState.toss.choice
    ) {
      return;
    }

    const selectedCaptain = (Object.values(room.players) as Player[]).find(
      (player) => player.team === (room.gameState.toss.selectedBy ?? 'A') && player.isCaptain
    );
    if (!isAutomatedPlayer(selectedCaptain)) {
      return;
    }

    automatedTossChoiceTimerRef.current = setTimeout(() => {
      void resolveAutomatedTossChoice(roomId, myId).catch((error) => {
        console.error(error);
      });
    }, AI_TOSS_DECISION_DELAY_MS);

    return () => {
      if (automatedTossChoiceTimerRef.current) clearTimeout(automatedTossChoiceTimerRef.current);
    };
  }, [
    isHost,
    myId,
    room?.gameState.toss.choice,
    room?.gameState.toss.selectedBy,
    room?.gameState.toss.tossCompleted,
    room?.players,
    room?.status,
    roomId,
  ]);

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

    const winningCaptain = (Object.values(room.players) as Player[]).find(
      (player) => player.team === room.gameState.toss.winnerTeam && player.isCaptain
    );
    if (!isAutomatedPlayer(winningCaptain)) {
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
      matchEventStreamInitializedRef.current = false;
      lastSeenMatchEventSequenceRef.current = 0;
      lastObservedMatchStatusRef.current = null;
      pauseAdvanceInFlightRef.current = null;
      setQueuedMatchEvents([]);
      setActiveMatchEvent(null);
      setMatchPopupState(EMPTY_MATCH_POPUP_STATE);
      return;
    }
  }, [room, roomId]);

  useEffect(() => {
    if (!room) return;

    const currentStatus = room.status;
    const previousStatus = lastObservedMatchStatusRef.current;
    const isLiveMatchStatus =
      currentStatus === GameStatus.PLAYING || currentStatus === GameStatus.FINISHED;

    if (!isLiveMatchStatus) {
      lastObservedMatchStatusRef.current = currentStatus;
      return;
    }

    const latestSequence = room.gameState.eventSequence ?? 0;
    const matchEvents = room.gameState.matchEvents ?? [];

    if (!matchEventStreamInitializedRef.current && previousStatus === null) {
      matchEventStreamInitializedRef.current = true;
      lastSeenMatchEventSequenceRef.current = latestSequence;
      lastObservedMatchStatusRef.current = currentStatus;

      if (room.gameState.match.isPaused) {
        setQueuedMatchEvents(
          getQueuedPauseEvents(matchEvents, room.gameState.match.pauseUntilEventId)
        );
      }

      return;
    }

    matchEventStreamInitializedRef.current = true;

    if (latestSequence <= lastSeenMatchEventSequenceRef.current) {
      lastObservedMatchStatusRef.current = currentStatus;
      return;
    }

    const unseenEvents = matchEvents
      .filter((event) => event.sequence > lastSeenMatchEventSequenceRef.current)
      .filter(isPopupMatchEvent);

    lastSeenMatchEventSequenceRef.current = latestSequence;
    lastObservedMatchStatusRef.current = currentStatus;

    if (unseenEvents.length === 0) {
      return;
    }

    setQueuedMatchEvents((currentQueue) => [...currentQueue, ...unseenEvents]);
  }, [room]);

  useEffect(() => {
    if (room?.status === GameStatus.PLAYING || room?.status === GameStatus.FINISHED) return;

    pauseAdvanceInFlightRef.current = null;
    setQueuedMatchEvents([]);
    setActiveMatchEvent(null);
    setMatchPopupState(EMPTY_MATCH_POPUP_STATE);
  }, [room?.status]);

  useEffect(() => {
    if (activeMatchEvent || !currentPauseEventId || queuedMatchEvents.length === 0) {
      return;
    }

    const nextEvent = queuedMatchEvents.find((event) => event.id === currentPauseEventId);
    if (!nextEvent) {
      return;
    }

    setActiveMatchEvent(nextEvent);
    setQueuedMatchEvents((currentQueue) =>
      currentQueue.filter((event) => event.id !== nextEvent.id)
    );
  }, [activeMatchEvent, currentPauseEventId, queuedMatchEvents]);

  useEffect(() => {
    if (!activeMatchEvent) {
      return;
    }

    if (currentPauseEventId && activeMatchEvent.id === currentPauseEventId) {
      return;
    }

    setActiveMatchEvent(null);
  }, [activeMatchEvent, currentPauseEventId]);

  useEffect(() => {
    setMatchPopupState(
      activeMatchEvent ? createMatchPopupState(activeMatchEvent) : EMPTY_MATCH_POPUP_STATE
    );
  }, [activeMatchEvent]);

  const requestPauseAdvance = (eventId: string) => {
    if (!roomId || pauseAdvanceInFlightRef.current === eventId) {
      return;
    }

    pauseAdvanceInFlightRef.current = eventId;
    void advanceMatchEventPause(roomId, eventId).finally(() => {
      if (pauseAdvanceInFlightRef.current === eventId) {
        pauseAdvanceInFlightRef.current = null;
      }
    });
  };

  useEffect(() => {
    if (!roomId || !room?.gameState.match.isPaused || !currentPauseEventId) {
      return;
    }

    const pausedAt = room.gameState.match.pausedAt;
    if (!pausedAt) {
      return;
    }

    const elapsed = Date.now() - pausedAt;
    if (elapsed >= MATCH_EVENT_PAUSE_FAILSAFE_MS) {
      requestPauseAdvance(currentPauseEventId);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      requestPauseAdvance(currentPauseEventId);
    }, MATCH_EVENT_PAUSE_FAILSAFE_MS - elapsed);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentPauseEventId, room?.gameState.match.isPaused, room?.gameState.match.pausedAt, roomId]);

  const dismissMatchEvent = () => {
    if (activeMatchEvent && isHost && currentPauseEventId === activeMatchEvent.id) {
      requestPauseAdvance(activeMatchEvent.id);
    }

    setActiveMatchEvent(null);
  };

  const handleCreateRoomFromExpired = async () => {
    if (!roomId) return;

    const nextName = sanitizePlayerName(getStoredPlayerName());
    if (!nextName) {
      navigate('/', { replace: true });
      return;
    }

    setActionLoading(true);

    try {
      const { roomId: nextRoomId, playerId: nextPlayerId } = await createRoom(nextName);
      persistPlayerName(nextName);
      persistRoomPlayerId(nextRoomId, nextPlayerId);
      clearPendingJoinStorageKey(roomId);
      clearRoomPlayerId(roomId);
      navigate(`/room/${nextRoomId}`, { replace: true });
    } catch (error: any) {
      alert(error.message || 'Unable to create a new room');
    } finally {
      setActionLoading(false);
    }
  };

  const matchEventOverlay = (
    <MatchEventPopup
      popupState={matchPopupState}
      onDismiss={dismissMatchEvent}
    />
  );

  const joinNameGateOverlay =
    showJoinNameGate && roomId ? (
      <JoinNameGate
        error={joinError}
        loading={joining}
        mode={joinIdentityMode}
        name={joinName}
        onConfirmStoredName={() => void completeRoomJoin(joinName)}
        onNameChange={(value) => {
          setJoinName(value);
          if (joinError) setJoinError(null);
        }}
        onSubmit={() => void completeRoomJoin(joinName)}
        onSwitchToEdit={() => {
          setJoinIdentityMode('edit');
          setJoinError(null);
          if (!joinName) {
            setJoinName(getStoredPlayerName());
          }
        }}
        roomId={roomId}
        storedName={isValidPlayerName(joinName) ? sanitizePlayerName(joinName) : null}
      />
    ) : null;

  if (roomLookupState === 'expired') {
    return (
      <RoomExpiredView
        loading={actionLoading}
        onCreateNewRoom={() => void handleCreateRoomFromExpired()}
        roomId={roomId ?? room?.id ?? 'UNKNOWN'}
      />
    );
  }

  if (roomLookupState === 'loading' || !room) {
    return (
      <>
        <Layout className="items-center">
          <Card className="panel-shell mx-auto flex w-full max-w-sm flex-col items-center justify-center rounded-lg p-8 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-brand-yellow" />
            <div className="text-sm font-bold text-copy-secondary">Loading room</div>
          </Card>
        </Layout>
        {matchEventOverlay}
        {joinNameGateOverlay}
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
    if (!roomId || !myId || !hasManualTurnControl || me?.selection !== null) return;
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

  const handleReturnToLobby = async () => {
    if (!roomId || !myId || room?.status !== GameStatus.FINISHED) return;

    setReturningToLobby(true);

    try {
      await returnPlayerToLobby(roomId, myId);
      setView('lobby');
    } catch (error: any) {
      setReturningToLobby(false);
      alert(error.message || 'Unable to return to the lobby');
    }
  };

  const handleRoomActionConfirm = async () => {
    if (!roomId || !myId || !roomActionType) return;

    setActionLoading(true);

    try {
      if (roomActionType === 'end') {
        await endRoom(roomId, myId);
      } else {
        await leaveRoom(roomId, myId);
      }

      leaveCurrentRoomView(roomId);
    } catch (error: any) {
      alert(error.message || 'Unable to update the room');
    } finally {
      setActionLoading(false);
    }
  };

  const openKickDialog = (player: Player) => {
    if (!isHost || player.id === myId) return;
    setKickTarget(player);
  };

  const handleKickConfirm = async () => {
    if (!roomId || !myId || !kickTarget) return;

    setActionLoading(true);

    try {
      await kickPlayer(roomId, myId, kickTarget.id);
      setKickTarget(null);
    } catch (error: any) {
      alert(error.message || 'Unable to remove the player');
    } finally {
      setActionLoading(false);
    }
  };

  const summaryViewerCount = allPlayers.filter(
    (player) =>
      !player.isBot &&
      !(room.status === GameStatus.FINISHED && view === 'lobby' && player.id === myId) &&
      player.status !== 'in_lobby'
  ).length;
  const otherSummaryPlayersCount = Math.max(
    0,
    summaryViewerCount - (view === 'summary' && me && me.status !== 'in_lobby' ? 1 : 0)
  );
  const isFinishedLocalLobby = room.status === GameStatus.FINISHED && view === 'lobby';
  const showLobbyView = view === 'lobby';
  const lobbyRoom = isFinishedLocalLobby
    ? {
        ...room,
        status: GameStatus.LOBBY,
        gameState: {
          ...room.gameState,
          status: GameStatus.LOBBY,
        },
      }
    : room;

  const roomActionDialogOverlay = (
    <AnimatePresence>
      {roomActionType ? (
        <RoomActionDialog
          action={roomActionType}
          loading={actionLoading}
          onCancel={() => setRoomActionType(null)}
          onConfirm={() => void handleRoomActionConfirm()}
        />
      ) : null}
    </AnimatePresence>
  );

  const kickPlayerDialogOverlay = (
    <AnimatePresence>
      {kickTarget ? (
        <KickPlayerDialog
          loading={actionLoading}
          onCancel={() => setKickTarget(null)}
          onConfirm={() => void handleKickConfirm()}
          player={kickTarget}
        />
      ) : null}
    </AnimatePresence>
  );

  if (showLobbyView) {
    return (
      <>
        <MainLayout
          actionLoading={actionLoading}
          canKickPlayers={showLobbyView || room.status === GameStatus.PLAYING}
          copied={copied}
          isHost={isHost}
          myId={myId}
          onCopy={copyLink}
          onKickPlayer={(targetId) => {
            const player = room.players[targetId];
            if (player) {
              openKickDialog(player);
            }
          }}
          room={lobbyRoom}
          roomId={roomId!}
          senderName={chatSenderName}
          title="Match Lobby"
        >
          <div className="space-y-6">
            {showReplayReadyBanner ? (
              <Card className="panel-section rounded-lg p-4 sm:p-5">
                <Badge tone="green">Ready</Badge>
                <p className="mt-3 text-sm font-semibold text-copy-secondary">
                  {isHost
                    ? 'All players are ready. Start the next match.'
                    : 'All players are ready. Waiting for the host to start the next match.'}
                </p>
              </Card>
            ) : null}

            {isFinishedLocalLobby ? (
              <Card className="panel-section rounded-lg p-4 sm:p-5">
                <Badge tone="zinc">Lobby Mode</Badge>
                <p className="mt-3 text-sm font-semibold text-copy-secondary">
                  You've returned to the lobby. Other players may still be viewing the match summary.
                </p>
              </Card>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <TeamLobbyCard
                actionLoading={actionLoading}
                canKickPlayers={isHost && !isFinishedLocalLobby}
                hostId={room.hostId}
                interactionDisabled={isFinishedLocalLobby}
                members={teamAPlayers}
                me={me}
                myId={myId}
                onKickPlayer={openKickDialog}
                onMakeCaptain={(targetId) => withLoad(() => makeCaptain(roomId!, myId!, targetId))}
                onRenameTeam={(nextName) => withLoad(() => updateTeamName(roomId!, myId!, 'A', nextName))}
                team="A"
                teamName={teamAName}
              />
              <TeamLobbyCard
                actionLoading={actionLoading}
                canKickPlayers={isHost && !isFinishedLocalLobby}
                hostId={room.hostId}
                interactionDisabled={isFinishedLocalLobby}
                members={teamBPlayers}
                me={me}
                myId={myId}
                onKickPlayer={openKickDialog}
                onMakeCaptain={(targetId) => withLoad(() => makeCaptain(roomId!, myId!, targetId))}
                onRenameTeam={(nextName) => withLoad(() => updateTeamName(roomId!, myId!, 'B', nextName))}
                team="B"
                teamName={teamBName}
              />
            </div>

            {me ? (
              <div className="space-y-3">
                <Button
                  onClick={() => withLoad(() => switchTeam(roomId!, myId!))}
                  disabled={actionLoading || isFinishedLocalLobby}
                  variant={me.team === 'A' ? 'secondary' : 'outline'}
                  icon={ArrowLeftRight}
                  className="w-full"
                >
                  Switch to {getTeamName(lobbyRoom, me.team === 'A' ? 'B' : 'A')}
                </Button>

                <Card className="panel-section rounded-lg p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Badge tone="zinc">Room controls</Badge>
                      <p className="mt-3 text-sm font-semibold text-copy-secondary">
                        Leave on your own, or if you&apos;re the host, close the room for everyone.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:min-w-[14rem]">
                      <Button
                        onClick={() => setRoomActionType('exit')}
                        disabled={actionLoading}
                        variant="outline"
                        icon={LogOut}
                        className="w-full"
                      >
                        Exit Room
                      </Button>
                      {isHost ? (
                        <Button
                          onClick={() => setRoomActionType('end')}
                          disabled={actionLoading}
                          variant="danger"
                          icon={Power}
                          className="w-full"
                        >
                          End Room
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {isFinishedLocalLobby ? (
              <Card className="panel-section rounded-lg p-5 text-center">
                <p className="text-sm font-bold text-copy-secondary">
                  Waiting for other players to return before starting a new match.
                </p>
              </Card>
            ) : isHost ? (
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
                      Start Match
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
        {matchEventOverlay}
        {joinNameGateOverlay}
        {kickPlayerDialogOverlay}
        {roomActionDialogOverlay}
      </>
    );
  }

  if (isTossFlowStatus(room.status)) {
    const tossStatus = statusMessageForToss(room, tossSelectingTeam, canChooseTossSide, canTossCoin, canChooseDecision);
    const visibleTossResult = revealedTossResult ?? null;

    return (
      <>
        <MainLayout
          actionLoading={actionLoading}
          copied={copied}
          isHost={isHost}
          myId={myId}
          onCopy={copyLink}
          onKickPlayer={(targetId) => {
            const player = room.players[targetId];
            if (player) {
              openKickDialog(player);
            }
          }}
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
        {matchEventOverlay}
        {joinNameGateOverlay}
        {kickPlayerDialogOverlay}
        {roomActionDialogOverlay}
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
          actionLoading={actionLoading}
          canKickPlayers={room.status === GameStatus.PLAYING && !isGameplayPaused}
          copied={copied}
          isHost={isHost}
          mainClassName="mx-auto w-full max-w-[76rem] lg:pt-2"
          myId={myId}
          onCopy={copyLink}
          onKickPlayer={(targetId) => {
            const player = room.players[targetId];
            if (player) {
              openKickDialog(player);
            }
          }}
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
              overNumber={room.gameState.overNumber}
              ballCount={room.gameState.ballCount}
            />
            <MatchupBanner batter={currentBatterPlayer} bowler={currentBowlerPlayer} myId={myId} />

            <div className="space-y-3.5 xl:space-y-4">
              <Card className="panel-section rounded-lg p-3.5 sm:p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                  {hasManualTurnControl ? (
                    <Badge tone="zinc">
                      {iAmBatting ? 'You are batting' : 'You are bowling'}
                    </Badge>
                  ) : isMyTurn && me?.isBotControlled ? (
                    <Badge tone="yellow" icon={Bot}>Bot Playing</Badge>
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
                    ) : isGameplayPaused ? (
                      <motion.div
                        key="paused"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-copy-muted"
                        aria-hidden="true"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </motion.div>
                    ) : hasManualTurnControl ? (
                      <motion.div
                        key="pick"
                        animate={{ opacity: [1, 0.45, 1] }}
                        transition={{ repeat: Infinity, duration: 1.4 }}
                      >
                        <Badge tone="zinc">Pick a number or Dot</Badge>
                      </motion.div>
                    ) : isMyTurn && me?.isBotControlled ? (
                      <motion.div
                        key="bot-cover"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Badge tone="yellow" icon={Bot}>Bot is covering your turn</Badge>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <GameControls
                  onSelect={handleSelect}
                  disabled={!hasManualTurnControl || me?.selection !== null}
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
                        <Badge
                          tone={
                            lastResult.outcome === 'dot'
                              ? 'zinc'
                              : lastResult.isOut
                                ? 'red'
                                : 'green'
                          }
                        >
                          {getBallOutcomeLabel(lastResult)}
                        </Badge>
                      </div>
                      <div className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-copy-muted">
                        {getBallOutcomeDetail(lastResult)}
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                        <div className="min-w-0 text-center">
                          <div className="text-xs font-bold text-copy-secondary">Batter</div>
                          <div className={cn('mt-1 text-4xl font-black tabular-nums sm:text-5xl', lastResult.isOut ? 'text-brand-red' : 'text-brand-yellow')}>
                            {formatSelectionValue(lastResult.batter)}
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
                              {lastResult.outcome === 'dot' ? 'DOT' : 'VS'}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 text-center">
                          <div className="text-xs font-bold text-copy-secondary">Bowler</div>
                          <div className="mt-1 text-4xl font-black text-copy-primary tabular-nums sm:text-5xl">
                            {formatSelectionValue(lastResult.bowler)}
                          </div>
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
        {matchEventOverlay}
        {joinNameGateOverlay}
        {kickPlayerDialogOverlay}
        {roomActionDialogOverlay}
      </>
    );
  }

  if (room.status === GameStatus.FINISHED) {
    const shouldHoldFinishedSummary =
      isGameplayPaused ||
      activeMatchEvent?.type === 'match_result' ||
      queuedMatchEvents.some((event) => event.type === 'match_result');

    return (
      <>
        {shouldHoldFinishedSummary ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="fixed inset-0 z-40 bg-[radial-gradient(circle_at_top,rgba(255,209,102,0.08),transparent_30%),linear-gradient(180deg,rgba(5,8,22,0.96),rgba(5,8,22,1))]"
            aria-hidden="true"
          />
        ) : (
          <MainLayout
            actionLoading={actionLoading}
            copied={copied}
            isHost={isHost}
            myId={myId}
            onCopy={copyLink}
            onKickPlayer={(targetId) => {
              const player = room.players[targetId];
              if (player) {
                openKickDialog(player);
              }
            }}
            room={room}
            roomId={roomId!}
            senderName={chatSenderName}
            title="Match result"
          >
            <MatchSummary
              onReturnToLobby={() => void handleReturnToLobby()}
              otherSummaryPlayersCount={otherSummaryPlayersCount}
              room={room}
            />
          </MainLayout>
        )}
        {matchEventOverlay}
        {joinNameGateOverlay}
        {kickPlayerDialogOverlay}
        {roomActionDialogOverlay}
      </>
    );
  }

  return null;
}
