import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, CircleDot, ShieldAlert, UserPlus } from 'lucide-react';
import { MatchEvent } from '../types';
import { Badge } from './UI';

interface MatchEventPopupProps {
  event: MatchEvent | null;
  open: boolean;
  onDismiss: () => void;
}

function eventTone(type: MatchEvent['type']) {
  switch (type) {
    case 'wicket':
      return {
        badge: 'red' as const,
        border: 'border-brand-red/35',
        panel: 'bg-[rgba(90,18,32,0.88)]',
        icon: ShieldAlert,
      };
    case 'next_batter':
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

export default function MatchEventPopup({ event, open, onDismiss }: MatchEventPopupProps) {
  useEffect(() => {
    if (!open || !event) return;

    const timeoutId = window.setTimeout(onDismiss, 2400);
    return () => window.clearTimeout(timeoutId);
  }, [event, onDismiss, open]);

  return (
    <AnimatePresence mode="wait">
      {open && event ? (
        <motion.div
          key={event.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/48 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className={`panel-shell w-full max-w-md rounded-2xl border px-6 py-6 text-center shadow-[0_28px_72px_rgba(0,0,0,0.38)] ${eventTone(event.type).border} ${eventTone(event.type).panel}`}
          >
            <div className="flex items-center justify-center">
              <Badge tone={eventTone(event.type).badge} icon={BellRing}>Match Event</Badge>
            </div>

            <div className="mt-4 flex justify-center">
              {(() => {
                const Icon = eventTone(event.type).icon;
                return (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                    <Icon className="h-7 w-7 text-copy-primary" />
                  </div>
                );
              })()}
            </div>

            <h2 className="mt-4 text-3xl font-black text-copy-primary">{event.title}</h2>
            <p className="mt-2 text-base font-semibold text-copy-secondary">{event.subtitle}</p>
            {event.detail ? <p className="mt-3 text-sm font-semibold text-copy-muted">{event.detail}</p> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
