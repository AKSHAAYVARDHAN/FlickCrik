import { GameState, MatchEvent, MatchEventType } from '../types';

const MATCH_EVENT_HISTORY_LIMIT = 16;

export const MATCH_EVENT_AUTO_DISMISS_MS = 4000;
export const MATCH_EVENT_PAUSE_FAILSAFE_MS = 6000;

export function isBlockingMatchEventType(type: MatchEventType): boolean {
  return (
    type === 'wicket' ||
    type === 'over_complete' ||
    type === 'innings_start' ||
    type === 'match_result'
  );
}

export function clearMatchPause(gameState: GameState) {
  gameState.match = {
    ...gameState.match,
    isPaused: false,
    pauseReason: null,
    pauseUntilEventId: null,
    pausedAt: null,
  };
}

export function setMatchPauseForEvent(gameState: GameState, eventId: string) {
  gameState.match = {
    ...gameState.match,
    isPaused: true,
    pauseReason: 'EVENT',
    pauseUntilEventId: eventId,
    pausedAt: Date.now(),
  };
}

export function findNextBlockingMatchEvent(
  events: MatchEvent[],
  currentSequence: number
): MatchEvent | null {
  return (
    events.find(
      (event) => isBlockingMatchEventType(event.type) && event.sequence > currentSequence
    ) ?? null
  );
}

export function pushMatchEvent(
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

  const history = [...(gameState.matchEvents ?? []), nextEvent].slice(-MATCH_EVENT_HISTORY_LIMIT);
  gameState.eventSequence = nextSequence;
  gameState.latestEvent = nextEvent;
  gameState.matchEvents = history;
  if (isBlockingMatchEventType(nextEvent.type) && !gameState.match.isPaused) {
    setMatchPauseForEvent(gameState, nextEvent.id);
  }

  return nextEvent;
}
