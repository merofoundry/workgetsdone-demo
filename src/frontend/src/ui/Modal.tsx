import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from '../icons';
import { cn } from '../utils';

/** TailAdmin modal styling on a native modal dialog, so focus trapping, Escape and the top layer stay with the browser. */
export function Modal({ title, children, footer, onClose, busy = false, className }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; busy?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null; const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    (dialog.querySelector('[data-autofocus]') as HTMLElement | null)?.focus();
    return () => { dialog.close(); opener?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={cn('m-auto max-h-[calc(100%-2rem)] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-gray-800 shadow-xl backdrop:bg-gray-400/50 backdrop:backdrop-blur-sm dark:bg-gray-900 dark:text-gray-100', className)}
    onCancel={event => { event.preventDefault(); if (!busy) closeRef.current(); }}>
    <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-gray-800">
      <h2 id={titleId} className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-60 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white">
        <CloseIcon aria-hidden="true" className="size-5" />
      </button>
    </header>
    <div className="px-5 py-5 sm:px-6">{children}</div>
    {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6 dark:border-gray-800">{footer}</footer>}
  </dialog>;
}
