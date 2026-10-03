import { useEffect, useState } from 'react';
import type { Accent, Settings, ThemeMode } from './settings';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return darkQuery().matches ? 'dark' : 'light';
  return mode;
}

function apply(mode: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(mode);
  root.dataset.accent = accent;
  try {
    // Read by public/theme-init.js on the next page load to avoid a flash.
    localStorage.setItem('bh-theme', mode);
    localStorage.setItem('bh-accent', accent);
  } catch {
    // Storage can be unavailable; the theme still applies for this session.
  }
}

/** Keeps <html data-theme/data-accent> in sync with settings and the OS. */
export function useThemeSync(settings: Settings | null) {
  const [resolved, setResolved] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme as 'light' | 'dark') ?? 'light',
  );

  useEffect(() => {
    if (!settings) return;
    const sync = () => {
      apply(settings.theme, settings.accent);
      setResolved(resolveTheme(settings.theme));
    };
    sync();
    if (settings.theme !== 'system') return;
    const query = darkQuery();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [settings?.theme, settings?.accent]);

  return resolved;
}
