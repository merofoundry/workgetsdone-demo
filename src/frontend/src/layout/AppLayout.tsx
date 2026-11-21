import type { ReactNode } from 'react';
import { SidebarProvider, useSidebar } from '../context/SidebarContext';
import { cn } from '../utils';
import AppHeader from './AppHeader';
import AppSidebar, { type NavSection } from './AppSidebar';
import Backdrop from './Backdrop';

export interface AppLayoutProps {
  sections: NavSection[];
  /** Header content: the command-palette trigger. */
  search: ReactNode;
  /** Header content right of the theme toggle: the account menu. */
  account: ReactNode;
  children: ReactNode;
}

function LayoutContent({ sections, search, account, children }: AppLayoutProps) {
  const { isExpanded, isHovered } = useSidebar();
  return <div className="min-h-screen bg-gray-50 text-gray-800 xl:flex dark:bg-gray-950 dark:text-gray-100">
    <AppSidebar sections={sections} />
    <Backdrop />
    <div className={cn('min-w-0 flex-1', isExpanded || isHovered ? 'xl:ms-72.5' : 'xl:ms-22.5')}>
      <AppHeader search={search} account={account} />
      <main id="main" className="page mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">{children}</main>
    </div>
  </div>;
}

export default function AppLayout(props: AppLayoutProps) {
  return <SidebarProvider><LayoutContent {...props} /></SidebarProvider>;
}
