import { cn } from '../utils';

const sizes = { small: 'size-8 text-xs', medium: 'size-10 text-sm', large: 'size-12 text-base' };
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('');

/** Initials in a circle (no image upload exists); `src` shows a picture instead when one is given. */
export function Avatar({ name, src, size = 'medium', className }: { name: string; src?: string; size?: keyof typeof sizes; className?: string }) {
  return <span className={cn('avatar relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-semibold text-brand-500 dark:bg-brand-500/15 dark:text-brand-400', sizes[size], className)}>
    {src ? <img src={src} alt="" className="size-full object-cover" /> : initialsOf(name)}
  </span>;
}
