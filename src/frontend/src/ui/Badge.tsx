import type { ReactNode } from 'react';
import { cn } from '../utils';

export type BadgeColor = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'light' | 'dark';
const light: Record<BadgeColor, string> = {
  primary: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400',
  success: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500',
  error: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500',
  warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400',
  info: 'bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-500',
  light: 'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80',
  dark: 'bg-gray-500 text-white dark:bg-white/5 dark:text-white',
};
const solid: Record<BadgeColor, string> = {
  primary: 'bg-brand-500 text-white', success: 'bg-success-500 text-white', error: 'bg-error-500 text-white', warning: 'bg-warning-500 text-white',
  info: 'bg-blue-light-500 text-white', light: 'bg-gray-400 text-white dark:bg-white/5 dark:text-white/80', dark: 'bg-gray-700 text-white',
};

export function Badge({ variant = 'light', color = 'light', size = 'sm', startIcon, endIcon, className, children }: { variant?: 'light' | 'solid'; color?: BadgeColor; size?: 'sm' | 'md'; startIcon?: ReactNode; endIcon?: ReactNode; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 font-medium whitespace-nowrap', size === 'sm' ? 'text-xs' : 'text-sm', (variant === 'light' ? light : solid)[color], className)}>
    {startIcon}{children}{endIcon}
  </span>;
}
