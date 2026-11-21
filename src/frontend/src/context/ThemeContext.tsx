import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
interface ThemeValue { theme: Theme; toggleTheme: () => void }
const ThemeContext = createContext<ThemeValue | undefined>(undefined);
const KEY = 'wgd-theme';

// The one allowed browser-storage use: a per-viewer convenience. Every access is guarded so a blocked store never breaks the app.
function readStored(): Theme {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage unavailable: fall through to the system preference */ }
  if (stored === 'dark' || stored === 'light') return stored;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}
function writeStored(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable: the choice lasts for this page view only */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStored);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } writeStored(theme); }, [theme]);
  const toggleTheme = () => setTheme(current => (current === 'light' ? 'dark' : 'light'));
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
