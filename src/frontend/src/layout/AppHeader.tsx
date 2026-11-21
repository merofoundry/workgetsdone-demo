import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { useTheme } from '../context/ThemeContext';
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from '../icons';
import { cn } from '../utils';

export default function AppHeader({ search, account }: { search: ReactNode; account: ReactNode }) {
  const { isMobileOpen, isExpanded, isMobile, toggleSidebar, toggleMobileSidebar, setIsMobileOpen } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  useEffect(() => setIsMobileOpen(false), [location.pathname, setIsMobileOpen]);
  const toggleMenu = () => (window.innerWidth < 1280 ? toggleMobileSidebar() : toggleSidebar());
  const iconButton = 'flex size-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5';
  return <header className="sticky top-0 z-30 flex w-full items-center gap-2 border-b border-gray-200 bg-white px-3 py-3 sm:gap-3 xl:px-6 dark:border-gray-800 dark:bg-gray-900">
    <button type="button" className={cn(iconButton, isMobileOpen && 'bg-gray-100 dark:bg-white/5')} aria-label="Toggle sidebar" aria-controls="app-sidebar" aria-expanded={isMobile ? isMobileOpen : isExpanded} onClick={toggleMenu}>
      {isMobileOpen ? <CloseIcon aria-hidden="true" className="size-5" /> : <MenuIcon aria-hidden="true" className="size-5" />}
    </button>
    <div className="flex min-w-0 flex-1 xl:max-w-lg">{search}</div>
    <div className="ms-auto flex items-center gap-2 sm:gap-3">
      <button type="button" className={iconButton} aria-label="Toggle dark mode" aria-pressed={theme === 'dark'} onClick={toggleTheme}>
        {theme === 'dark' ? <SunIcon aria-hidden="true" className="size-5" /> : <MoonIcon aria-hidden="true" className="size-5" />}
      </button>
      {account}
    </div>
  </header>;
}
