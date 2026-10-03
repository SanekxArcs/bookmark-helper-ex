import { useCallback, useEffect, useRef, useState } from 'react';
import { AppWindow, Sparkles } from 'lucide-react';
import { KeyHints, NoResults, SearchInput, SearchResults, useSearch } from '@/components/search-panel';
import { Kbd, Spinner } from '@/components/ui/misc';
import type { BookmarkIndex } from '@/lib/bookmarks';
import { useBookmarkIndex } from '@/lib/hooks';
import { useSettings, type Settings } from '@/lib/settings';
import { useTabsPermission } from '@/lib/tabs';
import { useThemeSync } from '@/lib/theme';
import { plural } from '@/lib/utils';

const CLOSE_MESSAGE = 'bookmark-helper:close';

/** Spotlight-style search, shown in an iframe over the current page. */
export function QuickSearch() {
  const [settings] = useSettings();
  useThemeSync(settings);
  const { index } = useBookmarkIndex();
  const [hostTabId, setHostTabId] = useState<number>();

  useEffect(() => {
    // The tab we're shown in is the active one; leave it out of "Open tabs".
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setHostTabId(tab?.id));
  }, []);

  const close = useCallback(() => window.parent.postMessage({ type: CLOSE_MESSAGE }, '*'), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="fixed inset-0 bg-black/20 animate-[fade-in_120ms_ease-out] dark:bg-black/50"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      {settings ? <Palette settings={settings} index={index} hostTabId={hostTabId} onClose={close} /> : null}
    </div>
  );
}

function Palette({
  settings,
  index,
  hostTabId,
  onClose,
}: {
  settings: Settings;
  index: BookmarkIndex | null;
  hostTabId?: number;
  onClose: () => void;
}) {
  const [tabsGranted, setTabsEnabled] = useTabsPermission();
  const search = useSearch({
    index,
    settings,
    variant: 'palette',
    tabsEnabled: !!tabsGranted,
    excludeTabId: hostTabId,
    onOpened: onClose,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Browsers block autofocus inside cross-origin iframes; focus once the
  // content script focuses the iframe instead.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  const hasList = !index || search.sections.length > 0 || search.empty;

  return (
    <div
      role="dialog"
      aria-label="Quick search"
      className="mx-auto mt-[14vh] flex max-h-[72vh] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-pop animate-in"
    >
      <SearchInput
        bare
        search={search}
        inputRef={inputRef}
        placeholder={
          index
            ? `Search ${plural(index.bookmarks.length, 'bookmark')}${tabsGranted ? ' and open tabs' : ''}…`
            : 'Search bookmarks…'
        }
        trailing={<Kbd>Esc</Kbd>}
      />

      {hasList ? (
        <div className="scroll-area min-h-0 flex-1 border-t border-border p-1.5">
          {!index ? (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          ) : search.empty ? (
            <NoResults className="py-8" query={search.trimmed} settings={settings} />
          ) : (
            <SearchResults search={search} variant="palette" />
          )}
        </div>
      ) : null}

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3 py-2">
        <KeyHints />
        {tabsGranted === false ? (
          <button
            type="button"
            onClick={() => setTabsEnabled(true).then(() => inputRef.current?.focus())}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-fg-muted hover:bg-hover hover:text-fg"
          >
            <AppWindow className="size-3" /> Include open tabs
          </button>
        ) : settings.apiKey && settings.autoAISearch ? (
          <span className="flex items-center gap-1 text-2xs text-fg-subtle">
            <Sparkles className="size-3 text-accent-text" /> AI helps when nothing matches
          </span>
        ) : null}
      </footer>
    </div>
  );
}
