import type { InputHTMLAttributes } from 'react';
import { CheckIcon } from '../icons';
import { cn, focusRing } from '../utils';

export function Checkbox({ label, className, disabled, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: string }) {
  return <label className={cn('group flex cursor-pointer items-center gap-3', disabled && 'cursor-not-allowed opacity-60')}>
    <span className="relative flex size-5 items-center justify-center">
      <input {...props} type="checkbox" disabled={disabled} className={cn('peer size-5 cursor-pointer appearance-none rounded-md border', focusRing, 'border-gray-300 checked:border-transparent checked:bg-brand-500 dark:border-gray-700', className)} />
      <CheckIcon aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto size-3.5 text-white opacity-0 peer-checked:opacity-100" />
    </span>
    {label && <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>}
  </label>;
}
