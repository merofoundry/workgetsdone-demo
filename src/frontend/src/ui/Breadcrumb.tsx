import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon } from '../icons';

export function Breadcrumb({ items, current }: { items: { label: string; to: string }[]; current: string }) {
  return <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
    {items.map(item => <Fragment key={item.to}><li><Link to={item.to} className="hover:text-gray-700 dark:hover:text-gray-200">{item.label}</Link></li><li aria-hidden="true"><ChevronDownIcon className="size-4 -rotate-90" /></li></Fragment>)}
    <li aria-current="page" className="text-gray-800 dark:text-white/90">{current}</li>
  </ol></nav>;
}
