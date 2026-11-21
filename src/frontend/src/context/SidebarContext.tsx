import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface SidebarValue {
  isExpanded: boolean;
  isMobile: boolean;
  isMobileOpen: boolean;
  isHovered: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setIsHovered: (hovered: boolean) => void;
  setIsMobileOpen: (open: boolean) => void;
}
const SidebarContext = createContext<SidebarValue | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider');
  return context;
}

/** Below 1280 px the sidebar is off-canvas (opened by the header button, closed by the backdrop); above it collapses to icons. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1280);
  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => {
    const onResize = () => { const mobile = window.innerWidth < 1280; setIsMobile(mobile); if (!mobile) setIsMobileOpen(false); };
    onResize(); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    if (!isMobileOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsMobileOpen(false); };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [isMobileOpen]);
  return <SidebarContext.Provider value={{ isExpanded: isMobile ? false : isExpanded, isMobile, isMobileOpen, isHovered, toggleSidebar: () => setIsExpanded(value => !value), toggleMobileSidebar: () => setIsMobileOpen(value => !value), setIsHovered, setIsMobileOpen }}>{children}</SidebarContext.Provider>;
}
