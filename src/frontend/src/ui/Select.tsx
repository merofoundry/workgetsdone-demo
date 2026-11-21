import type { SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '../icons';
import { cn } from '../utils';
import { controlClasses, controlState } from './Input';

export function Select({ error = false, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return <div className="relative">
    <select {...props} aria-invalid={error || undefined} className={cn(controlClasses, controlState(error), 'pe-11 disabled:opacity-60', className)}>{children}</select>
    <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute inset-e-3 top-1/2 size-5 -translate-y-1/2 text-gray-700 dark:text-gray-400" />
  </div>;
}
