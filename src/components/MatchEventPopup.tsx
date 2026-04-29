import { useEffect, useEffectEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, CircleDot, ShieldAlert, UserPlus, X } from 'lucide-react';
import { MatchEvent } from '../types';
import { Badge } from './UI';

const MATCH_EVENT_AUTO_DISMISS_MS = 4000;

export interface MatchPopupState {
  isOpen: boolean;
  type: 'wicket' | 'run' | 'over';
  message: string;
  event: MatchEvent | null;
}

interface MatchEventPopupProps {
  popupState: MatchPopupState;
  onDismiss: () => void;
}

function eventTone(type: MatchPopupState['type']) {
  switch (type) {
    case 'wicket':
      return {
        badge: 'red' as const,
        border: 'border-brand-red/35',
        panel: 'bg-[rgba(90,18,32,0.88)]',
        icon: ShieldAlert,
      };
    case 'run':
      return {
        badge: 'green' as const,
        border: 'border-brand-green/35',
        panel: 'bg-[rgba(15,56,39,0.88)]',
        icon: UserPlus,
      };
    default:
      return {
        badge: 'zinc' as const,
        border: 'border-brand-blue/30',
        panel: 'bg-[rgba(18,26,42,0.88)]',
        icon: CircleDot,
      };
  }
}

function badgeLabel(type: MatchPopupState['type']) {
  switch (type) {
    case 'wicket':
      return 'Wicket';
    case 'over':
      return 'Over update';
    default:
      return 'Match event';
  }
}

export default function MatchEventPopup({ popupState, onDismiss }: MatchEventPopupProps) {
  const dismissPopup = useEffectEvent(() => {
    onDismiss();
  });

  useEffect(() => {
    if (!popupState.isOpen || !popupState.event) return;

    const timeoutId = window.setTimeout(() => {
      dismissPopup();
    }, MATCH_EVENT_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [popupState.event?.id, popupState.isOpen]);

  if (!popupState.event) {
    return <AnimatePresence mode="wait" />;
  }

  const tone = eventTone(popupState.type);
  const event = popupState.event;

  return (
    <AnimatePresence mode="wait">
      {popupState.isOpen ? (
        <motion.div
          key={event.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/48 p-4 backdrop-blur-sm"
          onClick={() => dismissPopup()}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className={`panel-shell w-full max-w-md rounded-2xl border px-6 py-6 text-center shadow-[0_28px_72px_rgba(0,0,0,0.38)] ${tone.border} ${tone.panel}`}
            onClick={(dismissEvent) => dismissEvent.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`match-event-title-${event.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <Badge tone={tone.badge} icon={BellRing}>{badgeLabel(popupState.type)}</Badge>
              <button
                type="button"
                onClick={() => dismissPopup()}
                aria-label="Close match event popup"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-copy-secondary transition hover:text-copy-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex justify-center">
              {(() => {
                const Icon = tone.icon;
                return (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <Icon className="h-7 w-7 text-copy-primary" />
                  </div>
                );
              })()}
            </div>

            <h2 id={`match-event-title-${event.id}`} className="mt-4 text-3xl font-black text-copy-primary">
              {popupState.message}
            </h2>
            <p className="mt-2 text-base font-semibold text-copy-secondary">{event.subtitle}</p>
            {event.detail ? <p className="mt-3 text-sm font-semibold text-copy-muted">{event.detail}</p> : null}
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-copy-muted">
              Click outside or use the close button
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
