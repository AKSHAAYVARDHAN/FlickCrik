import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

export interface AnnouncementData {
  phase: 'first' | 'second';
  role: 'batting' | 'bowling';
  target?: number;
}

interface InningsAnnouncementProps {
  data: AnnouncementData | null;
  onDismiss: () => void;
  open: boolean;
}

function getTitle(phase: AnnouncementData['phase']) {
  return phase === 'first' ? 'First Innings' : 'Second Innings';
}

function getSubtitle(role: AnnouncementData['role']) {
  return role === 'batting' ? 'You are Batting' : 'You are Bowling';
}

function getInfoText(data: AnnouncementData) {
  if (typeof data.target !== 'number') {
    return data.role === 'batting' ? 'Set the target' : 'Keep them low';
  }

  return data.role === 'batting'
    ? `Target: ${data.target} runs`
    : `Defend: ${data.target} runs`;
}

export default function InningsAnnouncement({
  data,
  onDismiss,
  open,
}: InningsAnnouncementProps) {
  useEffect(() => {
    if (!open || !data) return;

    const timeoutId = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [data, onDismiss, open]);

  const infoText = data ? getInfoText(data) : null;

  return (
    <AnimatePresence>
      {open && data ? (
        <motion.div
          key={`${data.phase}-${data.role}-${data.target ?? 'open'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={onDismiss}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full max-w-sm rounded-xl border border-[#1F2937] bg-[#121315] p-6 text-center shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="text-left">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#6B7280]">
                  Match Update
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss();
                }}
                aria-label="Dismiss announcement"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#1F2937] bg-[#181c22] text-[#9CA3AF] transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="text-3xl font-black text-white">{getTitle(data.phase)}</h2>
            <p className="mt-2 text-base font-semibold text-[#9CA3AF]">
              {getSubtitle(data.role)}
            </p>

            <div
              className={`mt-5 rounded-lg border px-4 py-3 text-sm font-black ${
                data.role === 'batting'
                  ? 'border-[#ca8a04] bg-[#2a2108] text-[#facc15]'
                  : 'border-[#166534] bg-[#0f2017] text-[#86efac]'
              }`}
            >
              {infoText}
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
              Click anywhere to continue
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
