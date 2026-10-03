import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Browser } from 'wxt/browser';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function plural(count: number, one: string, many = one + 's') {
  return `${count} ${count === 1 ? one : many}`;
}

export function managerUrl(section?: string) {
  return browser.runtime.getURL('/options.html') + (section ? `#${section}` : '');
}

export async function openManager(section?: string) {
  const url = managerUrl(section);
  const base = browser.runtime.getURL('/options.html');
  try {
    // Reuse an already-open manager tab instead of piling up new ones.
    const contexts = await browser.runtime.getContexts({ contextTypes: ['TAB' as Browser.runtime.ContextType] });
    const existing = contexts.find((c) => c.documentUrl?.startsWith(base) && c.tabId >= 0);
    if (existing) {
      await browser.tabs.update(existing.tabId, { url, active: true });
      await browser.windows.update(existing.windowId, { focused: true });
      return;
    }
  } catch {
    // getContexts is unavailable on older browsers; open a new tab instead.
  }
  await browser.tabs.create({ url });
}

export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
