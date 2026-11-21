import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import { cn, focusRing } from './utils';
import type { CreateKind, EditKind, Parent } from './contracts';
interface CreateDraft { kind: CreateKind; parent?: Parent; title?: string }
interface EditState { kind: EditKind; record: Record<string, any> }
interface UI { draft: CreateDraft | null; openCreate: (kind: CreateKind, parent?: Parent, title?: string) => void; closeCreate: () => void; edit: EditState | null; openEdit: (kind: EditKind, record: unknown) => void; closeEdit: () => void; pageParent: Parent | null; setPageParent: (parent: Parent | null) => void; notify: (message: string, error?: boolean) => void; dialogOpen: boolean; setDialogOpen: (open: boolean) => void }
const Context = createContext<UI | null>(null);
export function UIProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CreateDraft | null>(null); const [dialogOpen, setDialogOpen] = useState(false); const [edit, setEdit] = useState<EditState | null>(null); const [pageParent, setPageParent] = useState<Parent | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | undefined>();
  const notify = (message: string, error = false) => { clearTimeout(timer); setToast({ message, error }); setTimer(setTimeout(() => setToast(null), 4000)); };
  return <Context.Provider value={{ draft, openCreate: (kind, parent, title) => setDraft({ kind, parent, title }), closeCreate: () => setDraft(null), edit, openEdit: (kind, record) => setEdit({ kind, record: record as Record<string, any> }), closeEdit: () => setEdit(null), pageParent, setPageParent, notify, dialogOpen: dialogOpen || !!draft || !!edit, setDialogOpen }}>{children}<div className="toast-region pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-end" role="status" aria-live="polite">{toast && <div className={cn('toast pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg', toast.error ? 'toast-error bg-error-600 text-white dark:bg-error-500' : 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900')}><span>{toast.message}</span><button type="button" aria-label="Dismiss notification" className={cn('-me-1 flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 dark:hover:bg-black/10', focusRing)} onClick={() => setToast(null)}><CloseIcon aria-hidden="true" className="size-4" /></button></div>}</div></Context.Provider>;
}
export function useUI() { const context = useContext(Context); if (!context) throw new Error('UIProvider missing'); return context; }
/** Registers the record on screen as the default parent for keyboard and palette creates. */
export function usePageParent(kind: Parent['kind'], id: string, name?: string | null) {
  const { setPageParent } = useUI();
  useEffect(() => { if (!name) return; setPageParent({ kind, id, name }); return () => setPageParent(null); }, [kind, id, name, setPageParent]);
}
