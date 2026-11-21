import { useEffect, useRef, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { cn } from '../utils';

export interface NavSection { label: string; to: string; icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean }

/** Collapsible sidebar: expanded, icons only (collapsed), widened on hover, or off-canvas on mobile. Labels stay in the accessibility tree when collapsed. */
export default function AppSidebar({ sections }: { sections: NavSection[] }) {
  const { isExpanded, isHovered, isMobileOpen, setIsHovered } = useSidebar();
  const root = useRef<HTMLElement>(null); const wasOpen = useRef(false);
  // Mobile off-canvas: focus moves to the first link on open and back to the toggle on close.
  useEffect(() => {
    if (isMobileOpen) {
      wasOpen.current = true;
      const element = root.current; const link = element?.querySelector<HTMLElement>('nav a');
      link?.focus();
      // The panel is still `visibility: hidden` until its slide-in starts, so focus again when the transition ends.
      if (!element || document.activeElement === link) return;
      const retry = () => link?.focus(); element.addEventListener('transitionend', retry, { once: true });
      return () => element.removeEventListener('transitionend', retry);
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || root.current?.contains(active)) document.querySelector<HTMLElement>('[aria-controls="app-sidebar"]')?.focus();
  }, [isMobileOpen]);
  const wide = isExpanded || isHovered || isMobileOpen;
  return <aside ref={root} id="app-sidebar" aria-label="Sidebar"
    className={cn('fixed inset-s-0 top-0 z-50 flex h-screen flex-col border-e border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100',
      wide ? 'w-72.5' : 'w-22.5',
      isMobileOpen ? 'translate-x-0' : 'max-xl:invisible max-xl:-translate-x-full')}
    onMouseEnter={() => !isExpanded && setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
    <div className={cn('flex py-8', wide ? 'justify-start' : 'justify-center')}>
      <Link to="/" className="brand flex items-center gap-2 text-xl font-bold whitespace-nowrap text-gray-900 hover:no-underline dark:text-white">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-sm text-white">W</span>
        <span className={wide ? '' : 'sr-only'}>WorkGetsDone</span>
      </Link>
    </div>
    <nav aria-label="Main" className="flex flex-col overflow-y-auto">
      <ul className="flex flex-col gap-1">
        {sections.map(({ label, to, icon: Icon, end }) => <li key={label}>
          <NavLink to={to} end={end} className={({ isActive }) => cn('group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:no-underline', wide ? 'justify-start' : 'justify-center',
            isActive ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/12 dark:text-brand-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5')}>
            <Icon aria-hidden="true" className="size-6 shrink-0" /><span className={wide ? '' : 'sr-only'}>{label}</span>
          </NavLink>
        </li>)}
      </ul>
    </nav>
  </aside>;
}
