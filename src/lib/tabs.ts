import { useCallback, useEffect, useState } from 'react';

// Open-tab search needs the optional "tabs" permission (titles and URLs of
// every tab), so it stays off until the user turns it on.

const TABS_PERMISSION = { permissions: ['tabs'] as ['tabs'] };

export interface OpenTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
  lastAccessed?: number;
}

export function useTabsPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    const refresh = () => browser.permissions.contains(TABS_PERMISSION).then(setGranted);
    refresh();
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);
    return () => {
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    // Must run inside a click handler: the browser only shows the prompt for user gestures.
    if (on) {
      const ok = await browser.permissions.request(TABS_PERMISSION);
      setGranted(ok);
      return ok;
    }
    await browser.permissions.remove(TABS_PERMISSION);
    setGranted(false);
    return true;
  }, []);

  return [granted, setEnabled] as const;
}

/** All open tabs (when permitted), most recently used first. */
export function useOpenTabs(enabled: boolean, excludeTabId?: number) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);

  useEffect(() => {
    if (!enabled) {
      setTabs([]);
      return;
    }
    browser.tabs.query({}).then((all) =>
      setTabs(
        all
          .filter((t) => t.id !== undefined && t.id !== excludeTabId && t.url && !t.url.startsWith(browser.runtime.getURL('/')))
          .map((t) => ({
            id: t.id!,
            windowId: t.windowId,
            title: t.title || t.url!,
            url: t.url!,
            active: t.active,
            lastAccessed: (t as { lastAccessed?: number }).lastAccessed,
          }))
          .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)),
      ),
    );
  }, [enabled, excludeTabId]);

  return tabs;
}

export async function switchToTab(tab: Pick<OpenTab, 'id' | 'windowId'>) {
  await browser.tabs.update(tab.id, { active: true });
  await browser.windows.update(tab.windowId, { focused: true });
}
