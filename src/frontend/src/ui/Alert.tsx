import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon } from '../icons';
import { cn } from '../utils';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';
const styles: Record<AlertVariant, { box: string; icon: string }> = {
  success: { box: 'border-success-500 bg-success-50 dark:border-success-500/30 dark:bg-success-500/15', icon: 'text-success-500' },
  error: { box: 'border-error-500 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15', icon: 'text-error-500' },
  warning: { box: 'border-warning-500 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15', icon: 'text-warning-500' },
  info: { box: 'border-blue-light-500 bg-blue-light-50 dark:border-blue-light-500/30 dark:bg-blue-light-500/15', icon: 'text-blue-light-500' },
};

export function Alert({ variant, title, message, role, className, children }: { variant: AlertVariant; title?: string; message: ReactNode; role?: 'alert' | 'status'; className?: string; children?: ReactNode }) {
  const Icon = variant === 'success' ? CheckIcon : AlertIcon;
  return <div role={role} className={cn('flex gap-3 rounded-xl border p-4', styles[variant].box, className)}>
    <Icon aria-hidden="true" className={cn('mt-0.5 size-6 shrink-0', styles[variant].icon)} />
    <div className="min-w-0 flex-1">
      {title && <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>}
      <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  </div>;
}
