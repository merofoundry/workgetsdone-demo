import type { ReactNode } from 'react';
import { cn } from '../utils';

/** Titled container. `padded` adds the template's body padding; the default leaves the body flush for tables and lists. */
export function Card({ title, desc, action, children, danger = false, padded = false, className }: { title?: string; desc?: string; action?: ReactNode; children: ReactNode; danger?: boolean; padded?: boolean; className?: string }) {
  return <section aria-label={title} className={cn('min-w-0 overflow-hidden rounded-2xl border bg-white dark:bg-white/3', danger ? 'border-error-200 dark:border-error-500/30' : 'border-gray-200 dark:border-gray-800', className)}>
    {title && <header className={cn('flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6', danger ? 'border-error-200 dark:border-error-500/30' : 'border-gray-100 dark:border-gray-800')}>
      <div><h2 className={cn('text-base font-medium', danger ? 'text-error-600 dark:text-error-400' : 'text-gray-800 dark:text-white/90')}>{title}</h2>{desc && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{desc}</p>}</div>
      {action}
    </header>}
    {padded ? <div className="p-4 sm:p-6">{children}</div> : children}
  </section>;
}
