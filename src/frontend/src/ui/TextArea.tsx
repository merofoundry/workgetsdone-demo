import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../utils';
import { controlClasses, controlState } from './Input';

export function TextArea({ error = false, className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return <textarea {...props} rows={rows} aria-invalid={error || undefined} className={cn(controlClasses, controlState(error), 'h-auto disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60 dark:disabled:bg-gray-800', className)} />;
}
