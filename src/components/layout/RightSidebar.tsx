import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, MessageCircle, Send } from 'lucide-react';
import { sendMessage } from '../../firebase/chatService';
import { useChat } from '../../hooks/useChat';
import { Button, Card, cn } from '../UI';

export interface RightSidebarProps {
  className?: string;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  roomId: string;
  senderName: string;
}

function formatMessageTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function RightSidebar({
  className = '',
  collapsible = false,
  isOpen = true,
  onToggle,
  roomId,
  senderName,
}: RightSidebarProps) {
  const { messages } = useChat(roomId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const panelOpen = !collapsible || isOpen;

  useEffect(() => {
    if (!panelOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, panelOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextMessage = draft.trim();
    if (!nextMessage || sending) return;

    setSending(true);
    setDraft('');
    try {
      await sendMessage(roomId, nextMessage, senderName);
    } catch (error) {
      console.error(error);
      setDraft(nextMessage);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className={cn('panel-shell flex min-h-0 flex-col overflow-hidden rounded-lg', className)}>
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        aria-expanded={panelOpen}
        tabIndex={collapsible ? 0 : -1}
        className={cn(
          'flex w-full items-center justify-between gap-3 border-b border-surface-border px-5 py-4 text-left',
          !collapsible && 'cursor-default'
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-850 text-copy-secondary">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-black text-copy-primary">Room chat</span>
            <span className="block text-xs font-semibold text-copy-secondary">{messages.length} messages</span>
          </span>
        </span>
        {collapsible ? (
          <ChevronDown
            className={cn('h-4 w-4 text-copy-secondary transition-transform', panelOpen && 'rotate-180')}
          />
        ) : null}
      </button>

      <div className={cn('min-h-0 flex-1 flex-col', panelOpen ? 'flex' : 'hidden', collapsible && 'h-96')}>
        <div className="scrollbar-soft min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-36 items-center justify-center text-center">
              <div className="panel-section-muted w-full rounded-lg px-5 py-12">
                <MessageCircle className="mx-auto mb-2 h-6 w-6 text-copy-muted" />
                <div className="text-sm font-semibold text-copy-secondary">No messages yet</div>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((chatMessage) => {
                const mine = chatMessage.senderName === senderName;

                return (
                  <motion.div
                    key={chatMessage.id}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[88%] rounded-lg border px-3 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.18)]',
                        mine
                          ? 'border-brand-purple/30 bg-brand-purple/10'
                          : 'border-surface-border bg-surface-850'
                      )}
                    >
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className={cn('truncate text-xs font-black', mine ? 'text-brand-purple' : 'text-copy-primary')}>
                          {mine ? 'You' : chatMessage.senderName}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-copy-muted">
                          {formatMessageTime(chatMessage.timestamp)}
                        </span>
                      </div>
                      <p className="break-words text-sm leading-relaxed text-copy-secondary">
                        {chatMessage.message}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 flex gap-2 border-t border-surface-border bg-surface-900 p-3"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={240}
            placeholder="Message"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-950 px-3 text-sm font-semibold text-copy-primary outline-none transition-all placeholder:text-copy-muted focus:border-brand-blue/55 focus:ring-4 focus:ring-brand-blue/10"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || sending}
            loading={sending}
            title="Send message"
            variant="primary"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
