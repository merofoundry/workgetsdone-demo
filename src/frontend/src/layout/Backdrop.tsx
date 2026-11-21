import { useSidebar } from '../context/SidebarContext';

/** Dims the page behind the open mobile sidebar; a click anywhere on it closes the sidebar. */
export default function Backdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return <div data-testid="sidebar-backdrop" aria-hidden="true" className="fixed inset-0 z-40 bg-gray-900/50 xl:hidden" onClick={toggleMobileSidebar} />;
}
