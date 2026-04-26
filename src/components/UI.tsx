import React from 'react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LucideIcon } from 'lucide-react';
import { Loader2, Zap } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function GameLogo() {
  return (
    <div className="mb-8 select-none text-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-yellow/30 bg-surface-900 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.28em] text-brand-yellow"
      >
        <Zap className="h-3.5 w-3.5 text-brand-yellow" />
        Multiplayer Arena
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-5xl font-black leading-none tracking-[-0.08em] text-copy-primary sm:text-6xl"
      >
        <span className="bg-gradient-to-r from-copy-primary via-copy-primary to-brand-yellow bg-clip-text text-transparent">
          FLICK
        </span>
        <span className="text-brand-blue">CRIK</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-3 text-sm font-bold tracking-[0.18em] text-copy-secondary sm:text-base"
      >
        Flick. Hit. Win.
      </motion.p>
    </div>
  );
}

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'outline'
  | 'ghost';

type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: (event: any) => void;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  [key: string]: any;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border-brand-yellow-deep bg-brand-yellow text-[#120a00] shadow-[0_10px_24px_rgba(245,183,0,0.2)] hover:border-brand-yellow hover:bg-[#ffca2f]',
  secondary:
    'border-brand-purple-deep/60 bg-brand-purple/12 text-brand-purple-ink shadow-[0_10px_24px_rgba(234,88,12,0.12)] hover:bg-brand-purple/18 hover:text-white',
  success:
    'border-[#1a6d45] bg-brand-green/10 text-[#b8ffd9] hover:bg-brand-green/16',
  danger:
    'border-[#6f2638] bg-brand-red/10 text-[#ffc0ca] hover:bg-brand-red/16',
  warning:
    'border-brand-yellow-deep bg-brand-yellow text-[#120a00] shadow-[0_10px_24px_rgba(245,183,0,0.2)] hover:border-brand-yellow hover:bg-[#ffca2f]',
  outline:
    'border-surface-border bg-surface-900 text-copy-primary hover:border-brand-blue/35 hover:bg-surface-850',
  ghost:
    'border-surface-border/70 bg-transparent text-copy-secondary hover:border-brand-purple/35 hover:bg-surface-900 hover:text-copy-primary',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 py-2 text-xs',
  md: 'min-h-11 px-4 py-2.5 text-sm',
  lg: 'min-h-12 px-5 py-3 text-sm',
  icon: 'h-10 w-10 p-0',
};

export function Button({
  children,
  className,
  disabled,
  icon: Icon,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-black uppercase tracking-[0.14em] transition duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {Icon ? <Icon className="h-4 w-4" /> : null}
          {children}
        </>
      )}
    </button>
  );
}

interface CardProps {
  children?: React.ReactNode;
  className?: string;
  interactive?: boolean;
  [key: string]: any;
}

export function Card({ children, className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'glass rounded-lg',
        interactive && 'transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-850',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type InputTone = 'blue' | 'purple' | 'green';

interface InputFieldProps {
  className?: string;
  helper?: string;
  icon?: LucideIcon;
  label: string;
  tone?: InputTone;
  [key: string]: any;
}

const inputToneClasses: Record<InputTone, string> = {
  blue: 'focus-within:border-brand-blue/55 focus-within:ring-brand-blue/10',
  purple: 'focus-within:border-brand-purple/55 focus-within:ring-brand-purple/10',
  green: 'focus-within:border-brand-green/50 focus-within:ring-brand-green/10',
};

const iconToneClasses: Record<InputTone, string> = {
  blue: 'group-focus-within:text-brand-blue',
  purple: 'group-focus-within:text-brand-purple',
  green: 'group-focus-within:text-brand-green',
};

export function InputField({
  className,
  helper,
  icon: Icon,
  label,
  tone = 'blue',
  ...props
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-copy-secondary">{label}</span>
      <span
        className={cn(
          'group flex min-h-12 items-center gap-3 rounded-lg border border-surface-border bg-surface-950 px-3 ring-4 ring-transparent transition-all duration-200',
          inputToneClasses[tone]
        )}
      >
        {Icon ? (
          <Icon className={cn('h-4 w-4 shrink-0 text-copy-muted transition-colors', iconToneClasses[tone])} />
        ) : null}
        <input
          className={cn(
            'min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold text-copy-primary outline-none placeholder:text-copy-muted',
            className
          )}
          {...props}
        />
      </span>
      {helper ? <span className="mt-2 block text-xs font-medium text-copy-muted">{helper}</span> : null}
    </label>
  );
}

type BadgeTone = 'blue' | 'purple' | 'green' | 'red' | 'yellow' | 'zinc';

interface BadgeProps {
  children?: React.ReactNode;
  className?: string;
  tone?: BadgeTone;
  icon?: LucideIcon;
  [key: string]: any;
}

const badgeTones: Record<BadgeTone, string> = {
  blue: 'border-brand-blue/30 bg-brand-blue/10 text-brand-blue-ink',
  purple: 'border-brand-purple/30 bg-brand-purple/10 text-brand-purple-ink',
  green: 'border-brand-green/30 bg-brand-green/10 text-[#b8ffd9]',
  red: 'border-brand-red/30 bg-brand-red/10 text-[#ffc0ca]',
  yellow: 'border-brand-yellow/30 bg-brand-yellow/10 text-[#ffd769]',
  zinc: 'border-surface-border bg-surface-850 text-copy-secondary',
};

export function Badge({ children, className, icon: Icon, tone = 'zinc', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black uppercase tracking-[0.18em]',
        badgeTones[tone],
        className
      )}
      {...props}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

interface ActionButtonProps extends ButtonProps {}

export function ActionButton(props: ActionButtonProps) {
  return <Button size="lg" {...props} />;
}
