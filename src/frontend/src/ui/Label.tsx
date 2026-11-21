import type { LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils';

/** `as="span"` is for a caption inside an enclosing label that already associates the control. */
export function Label({ as = 'label', className, children, ...props }: { as?: 'label' | 'span'; className?: string; children: ReactNode } & LabelHTMLAttributes<HTMLLabelElement>): ReactNode {
  const classes = cn('mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400', className);
  return as === 'span' ? <span className={classes}>{children}</span> : <label {...props} className={classes}>{children}</label>;
}
