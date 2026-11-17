import { useEffect, useState } from 'react';

export interface PromoExtension {
  id: string;
  name: string;
  tagline: string;
  url: string;
  icon: string;
}

// utm_source shows up in the Chrome Web Store developer dashboard, so installs from these promos can be counted.
const UTM = '?utm_source=bookmark-helper';

/** The author's other extensions, shown in settings and in the manager sidebar. */
export const OTHER_EXTENSIONS: PromoExtension[] = [
  {
    id: 'side-buddy',
    name: 'Side Buddy Manager',
    tagline: 'Your tabs, projects and saved links in the side panel.',
    url: `https://chromewebstore.google.com/detail/gaaofebldhkeeigpijoemjhcimehlinp${UTM}`,
    icon: '/promo/side-buddy.png',
  },
  {
    id: 'fix-errors-ai',
    name: 'Fix Errors AI',
    tagline: 'Fix grammar, rewrite or translate any text you select.',
    url: `https://chromewebstore.google.com/detail/ajciieiekaghgpjemofeemhfmiihgbao${UTM}`,
    icon: '/promo/fix-errors-ai.png',
  },
];

/** Side Buddy also gets a one-time tip in the popup, since it's the natural next step after bookmarks. */
export const SIDE_BUDDY = OTHER_EXTENSIONS[0]!;

// The save tip shows after this many bookmarks saved from the popup, so first-time users aren't nagged.
const TIP_AFTER_SAVES = 3;
const SAVES_KEY = 'promoSaveCount';
const DISMISSED_KEY = 'promoTipDismissed';

export async function countSaveForPromo() {
  const { [SAVES_KEY]: count = 0 } = await browser.storage.local.get(SAVES_KEY);
  await browser.storage.local.set({ [SAVES_KEY]: (count as number) + 1 });
}

/** Whether to show the one-time Side Buddy tip, and a way to hide it for good. */
export function usePromoTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const refresh = () =>
      browser.storage.local.get([SAVES_KEY, DISMISSED_KEY]).then((raw) => {
        setVisible(!raw[DISMISSED_KEY] && ((raw[SAVES_KEY] as number) ?? 0) >= TIP_AFTER_SAVES);
      });
    refresh();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (SAVES_KEY in changes || DISMISSED_KEY in changes)) refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const dismiss = () => browser.storage.local.set({ [DISMISSED_KEY]: true });
  return [visible, dismiss] as const;
}
