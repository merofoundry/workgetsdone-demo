import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../utils';

export const controlClasses = 'h-11 w-full appearance-none rounded-lg border bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-xs placeholder:text-gray-400 focus:ring-3 focus:outline-hidden dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30';
export const controlState = (error?: boolean) => error
  ? 'border-error-500 focus:border-error-300 focus:ring-error-500/20 dark:border-error-500'
  : 'border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:focus:border-brand-800';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(function Input({ error = false, className, ...props }, ref) {
  return <input {...props} ref={ref} aria-invalid={error || undefined} className={cn(controlClasses, controlState(error), 'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 dark:disabled:bg-gray-800', className)} />;
});
