import { GameState, MatchEvent } from '../types';

const MATCH_EVENT_HISTORY_LIMIT = 16;

export const MATCH_EVENT_AUTO_DISMISS_MS = 4000;

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

  return nextEvent;
}
