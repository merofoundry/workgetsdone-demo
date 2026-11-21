import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../utils';

/** Positioned panel: closes on an outside press or Escape. Place it inside a `relative` wrapper that also holds the toggle. */
export function Dropdown({ isOpen, onClose, children, className, id }: { isOpen: boolean; onClose: () => void; children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.parentElement?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { ref.current?.parentElement?.querySelector<HTMLElement>('[aria-haspopup]')?.focus(); onClose(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return <div ref={ref} id={id} className={cn('absolute inset-e-0 top-full z-40 mt-2 min-w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-900', className)}>{children}</div>;
}

const itemClasses = 'flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-start text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:no-underline dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white';
export function DropdownItem({ to, onClick, onItemClick, className, children }: { to?: string; onClick?: (event: MouseEvent) => void; onItemClick?: () => void; className?: string; children: ReactNode }) {
  const handle = (event: MouseEvent) => { onClick?.(event); onItemClick?.(); };
  return to
    ? <Link to={to} className={cn(itemClasses, className)} onClick={handle}>{children}</Link>
    : <button type="button" className={cn(itemClasses, className)} onClick={handle}>{children}</button>;
}
