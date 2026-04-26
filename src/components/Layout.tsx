import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from './UI';

interface LayoutProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}

export default function Layout({ children, className = '', wide = false }: LayoutProps) {
  return (
    <div
      className={cn(
        'app-backdrop relative flex min-h-dvh items-start justify-center overflow-x-hidden px-4 py-5 text-copy-primary sm:px-6 sm:py-8',
        className
      )}
    >
      <div className="app-grid pointer-events-none fixed inset-0 opacity-40" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(245,183,0,0.08),transparent_30%),linear-gradient(to_bottom,transparent,rgba(4,7,12,0.94)_84%,#04070c)]" />

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className={cn('relative z-10 w-full', wide ? 'max-w-[100rem]' : 'max-w-md')}
      >
        {children}
      </motion.main>
    </div>
  );
}
