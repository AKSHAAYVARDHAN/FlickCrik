import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Menu, MessageCircle, X } from 'lucide-react';
import type { Room } from '../../types';
import Layout from '../Layout';
import { Button, cn } from '../UI';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';

interface MainLayoutProps {
  children: ReactNode;
  copied: boolean;
  mainClassName?: string;
  myId?: string | null;
  onCopy: () => void;
  room: Room;
  roomId: string;
  senderName: string;
  subtitle?: string;
  title: string;
}

export default function MainLayout({
  children,
  copied,
  mainClassName,
  myId,
  onCopy,
  room,
  roomId,
  senderName,
  subtitle,
  title,
}: MainLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <Layout wide>
      <div className="mx-auto grid w-full max-w-[108rem] gap-4 lg:min-h-[calc(100dvh-3rem)] lg:grid-cols-[272px_minmax(0,1fr)_320px] lg:items-start xl:gap-5 2xl:grid-cols-[296px_minmax(0,1fr)_344px]">
        <aside className="hidden min-h-0 lg:sticky lg:top-6 lg:block lg:h-[calc(100dvh-3rem)]">
          <LeftSidebar copied={copied} myId={myId} onCopy={onCopy} room={room} roomId={roomId} />
        </aside>

        <main className="min-w-0 lg:grid lg:min-h-[calc(100dvh-3rem)]">
          <section className="panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg">
            <div className="border-b border-surface-border bg-[linear-gradient(180deg,rgba(17,28,41,0.95),rgba(9,16,25,0.85))] px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-black uppercase tracking-[-0.04em] text-copy-primary sm:text-3xl">{title}</h1>
                  {subtitle ? (
                    <p className="mt-1 text-sm font-semibold text-copy-secondary">{subtitle}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2 lg:hidden">
                  <Button
                    onClick={() => setLeftOpen(true)}
                    variant="outline"
                    size="icon"
                    title="Open room panel"
                    aria-label="Open room panel"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setChatOpen((open) => !open)}
                    variant={chatOpen ? 'secondary' : 'outline'}
                    size="icon"
                    title="Toggle chat"
                    aria-label="Toggle chat"
                  >
                    {chatOpen ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto">
              <div className={cn('min-w-0 space-y-4 p-4 sm:p-5 lg:space-y-5 lg:p-6', mainClassName)}>
                <div className="min-w-0 space-y-4 lg:space-y-5">{children}</div>

                <div className="lg:hidden">
                  <RightSidebar
                    collapsible
                    isOpen={chatOpen}
                    onToggle={() => setChatOpen((open) => !open)}
                    roomId={roomId}
                    senderName={senderName}
                  />
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside className="hidden min-h-0 lg:sticky lg:top-6 lg:block lg:h-[calc(100dvh-3rem)]">
          <RightSidebar roomId={roomId} senderName={senderName} className="h-full" />
        </aside>
      </div>

      <AnimatePresence>
        {leftOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Close room panel"
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLeftOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 w-[min(86vw,280px)] p-3 lg:hidden"
            >
              <LeftSidebar
                copied={copied}
                myId={myId}
                onClose={() => setLeftOpen(false)}
                onCopy={onCopy}
                room={room}
                roomId={roomId}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {copied ? (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-brand-green/35 bg-surface-900 px-4 py-2 text-sm font-black text-[#b8ffd9] shadow-[0_14px_30px_rgba(0,0,0,0.35)]"
          >
            <Check className="h-4 w-4" />
            Copied!
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Layout>
  );
}
