import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Hides the label, shows a spinner and disables the button. */
  busy?: boolean;
  /** Keyboard shortcut shown as a key cap after the label. */
  hint?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

const sizes = { sm: 'min-h-9 px-3 py-2 text-sm', md: 'min-h-11 px-4 py-2.5 text-sm' };
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white shadow-xs hover:bg-brand-600 disabled:bg-brand-300',
  secondary: 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/5',
  danger: 'bg-white text-error-600 ring-1 ring-inset ring-error-300 hover:bg-error-50 dark:bg-gray-800 dark:text-error-400 dark:ring-error-500/40 dark:hover:bg-error-500/10',
};

export function Button({ children, variant = 'secondary', size = 'md', busy = false, hint, startIcon, endIcon, className, disabled, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined}
    className={cn('relative inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60', sizes[size], variants[variant], className)}>
    {startIcon && <span className="flex items-center">{startIcon}</span>}
    <span className={busy ? 'invisible' : undefined}>{children}</span>
    {endIcon && <span className="flex items-center">{endIcon}</span>}
    {busy && <span className="absolute size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" role="img" aria-label="Saving" />}
    {hint && <kbd className="rounded border border-current/30 px-1 text-xs font-normal opacity-80">{hint}</kbd>}
  </button>;
}
