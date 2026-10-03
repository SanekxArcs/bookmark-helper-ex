import { useEffect, useState } from 'react';
import { DEFAULT_MODEL } from './gemini';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Accent = 'mono' | 'violet' | 'blue' | 'green' | 'orange' | 'rose';
export type NewFolderRoot = 'bar' | 'other';

export interface Settings {
  apiKey: string;
  geminiModel: string;
  theme: ThemeMode;
  accent: Accent;
  autoSort: boolean;
  autoAISearch: boolean;
  newFolderRoot: NewFolderRoot;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  geminiModel: DEFAULT_MODEL,
  theme: 'system',
  accent: 'violet',
  autoSort: true,
  autoAISearch: true,
  newFolderRoot: 'bar',
};

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'mono', label: 'Mono', swatch: 'var(--fg)' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { id: 'green', label: 'Green', swatch: '#22c55e' },
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
];

// v1.x stored Pantone accent names under `accentColor`.
const LEGACY_ACCENTS: Record<string, Accent> = {
  violet: 'violet',
  'pantone-2026': 'mono',
  'mocha-mousse': 'orange',
  'peach-fuzz': 'orange',
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export async function getSettings(): Promise<Settings> {
  const raw = await browser.storage.local.get([...KEYS, 'accentColor']);
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    if (raw[key] !== undefined) (settings as Record<string, unknown>)[key] = raw[key];
  }
  if (raw.accent === undefined && typeof raw.accentColor === 'string') {
    settings.accent = LEGACY_ACCENTS[raw.accentColor] ?? DEFAULT_SETTINGS.accent;
  }
  if (!ACCENTS.some((a) => a.id === settings.accent)) settings.accent = DEFAULT_SETTINGS.accent;
  return settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  await browser.storage.local.set(patch);
}

/** Live settings for React; updates when any extension page changes them. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => getSettings().then((s) => alive && setSettings(s));
    refresh();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && KEYS.some((k) => k in changes)) refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    return saveSettings(patch);
  };

  return [settings, update] as const;
}
