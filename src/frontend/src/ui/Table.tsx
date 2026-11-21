import type { ReactNode } from 'react';
import { cn } from '../utils';

interface Props { children?: ReactNode; className?: string }
export function Table({ children, className }: Props) { return <div className="relative max-w-full overflow-x-auto"><table className={cn('min-w-full text-start text-sm', className)}>{children}</table></div>; }
export function TableHeader({ children, className }: Props) { return <thead className={cn('border-b border-gray-100 dark:border-gray-800', className)}>{children}</thead>; }
export function TableBody({ children, className }: Props) { return <tbody className={cn('divide-y divide-gray-100 dark:divide-gray-800', className)}>{children}</tbody>; }
export function TableRow({ children, className }: Props) { return <tr className={className}>{children}</tr>; }
export function TableCell({ children, isHeader = false, className }: Props & { isHeader?: boolean }) {
  return isHeader
    ? <th scope="col" className={cn('px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400', className)}>{children}</th>
    : <td className={cn('px-4 py-3 text-gray-700 dark:text-gray-300', className)}>{children}</td>;
}
