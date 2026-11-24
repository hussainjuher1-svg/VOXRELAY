import { useEffect, useState, type ReactNode } from 'react';
import { ThemeContext, type ThemeMode } from './hooks';

const STORAGE_KEY = 'voxrelay_theme';

function readInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme: () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
