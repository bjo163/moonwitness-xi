import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** Theme stored in localStorage; index.html applies it before first paint. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0e0e10' : '#f3efe4');
    try {
      localStorage.setItem('mw-theme', theme);
    } catch {
      /* storage unavailable: theme just won't persist */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
