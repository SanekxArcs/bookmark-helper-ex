import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { AppWindow, CornerDownLeft, FolderOpen, Search, SearchX, Sparkles, X } from 'lucide-react';
import { displayUrl, openUrl, type Bookmark, type BookmarkIndex } from '@/lib/bookmarks';
import { searchWithAI } from '@/lib/ai';
import { AIError, errorMessage } from '@/lib/gemini';
import { useAbortable } from '@/lib/hooks';
import { highlightParts, queryTerms, searchLocal } from '@/lib/search';
import type { Settings } from '@/lib/settings';
import { switchToTab, useOpenTabs, type OpenTab } from '@/lib/tabs';
import { cn, MOD_KEY, plural } from '@/lib/utils';
import { Button } from './ui/button';
import { EmptyState, Favicon, Kbd, Spinner } from './ui/misc';

export type Variant = 'popup' | 'page' | 'palette';

type Entry =
  | { kind: 'tab'; key: string; tab: OpenTab }
  | { kind: 'bookmark'; key: string; bookmark: Bookmark }
  | { kind: 'ask-ai'; key: string };

interface Section {
  id: string;
  title?: string;
  entries: Entry[];
  /** Status line under the entries (AI loading / error / nothing found). */
  note?: ReactNode;
}

type AIResult = { status: 'loading' } | { status: 'done'; results: Bookmark[] } | { status: 'error'; message: string };

const LIMITS: Record<Variant, { tabs: number; bookmarks: number }> = {
  popup: { tabs: 4, bookmarks: 50 },
  palette: { tabs: 5, bookmarks: 30 },
  page: { tabs: 8, bookmarks: 100 },
};
const AUTO_AI_DELAY = 700;
const AUTO_AI_MIN_LENGTH = 3;

interface SearchOptions {
  index: BookmarkIndex | null;
  settings: Settings;
  variant: Variant;
  initialQuery?: string;
  /** Include open tabs (requires the optional "tabs" permission). */
  tabsEnabled?: boolean;
  /** Tab hosting the palette, which shouldn't appear in its own results. */
  excludeTabId?: number;
  /** Called after a result is opened (the palette closes itself). */
  onOpened?: () => void;
}

/** Search state shared by the popup, the full page and the quick search palette. */
export function useSearch({ index, settings, variant, initialQuery = '', tabsEnabled = false, excludeTabId, onOpened }: SearchOptions) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  // AI results are cached per query so retyping a query never costs a second call.
  const [ai, setAI] = useState<Record<string, AIResult>>({});
  const nextSignal = useAbortable();
  const tabs = useOpenTabs(tabsEnabled, excludeTabId);

  const trimmed = query.trim();
  const terms = useMemo(() => queryTerms(trimmed), [trimmed]);
  const limits = LIMITS[variant];

  const localTabs = useMemo(() => (trimmed ? searchLocal(trimmed, tabs, limits.tabs) : []), [trimmed, tabs, limits.tabs]);
  const localBookmarks = useMemo(
    () => (index && trimmed ? searchLocal(trimmed, index.bookmarks, limits.bookmarks) : []),
    [index, trimmed, limits.bookmarks],
  );
  const aiResult = ai[trimmed];
  const canUseAI = !!settings.apiKey && trimmed.length >= 2;

  const runAI = useCallback(
    async (q: string) => {
      if (!index || !q) return;
      setAI((prev) => ({ ...prev, [q]: { status: 'loading' } }));
      try {
        const results = await searchWithAI({ settings, index, signal: nextSignal() }, q);
        setAI((prev) => ({ ...prev, [q]: { status: 'done', results } }));
      } catch (err) {
        setAI((prev) => {
          const next = { ...prev };
          // A cancelled request (the query changed) can be retried later.
          if (err instanceof AIError && err.kind === 'aborted') delete next[q];
          else next[q] = { status: 'error', message: errorMessage(err) };
          return next;
        });
      }
    },
    [index, settings, nextSignal],
  );

  // When nothing matches locally, ask AI once the user pauses typing.
  const nothingLocal = !localTabs.length && !localBookmarks.length;
  useEffect(() => {
    if (!settings.autoAISearch || !canUseAI || !nothingLocal || aiResult || trimmed.length < AUTO_AI_MIN_LENGTH) return;
    const timer = setTimeout(() => runAI(trimmed), AUTO_AI_DELAY);
    return () => clearTimeout(timer);
  }, [trimmed, nothingLocal, canUseAI, settings.autoAISearch, aiResult, runAI]);

  const sections = useMemo<Section[]>(() => {
    if (!index) return [];
    if (!trimmed) {
      if (variant !== 'palette') return [];
      const recent = [...index.bookmarks].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 6);
      return [
        { id: 'tabs', title: 'Open tabs', entries: tabs.slice(0, 4).map(tabEntry) },
        { id: 'recent', title: 'Recently added', entries: recent.map(bookmarkEntry) },
      ].filter((s) => s.entries.length);
    }

    const list: Section[] = [];
    if (localTabs.length) list.push({ id: 'tabs', title: 'Open tabs', entries: localTabs.map(tabEntry) });
    if (localBookmarks.length) list.push({ id: 'bookmarks', title: 'Bookmarks', entries: localBookmarks.map(bookmarkEntry) });

    if (aiResult) {
      const shown = new Set(localBookmarks.map((b) => b.id));
      const extra = aiResult.status === 'done' ? aiResult.results.filter((b) => !shown.has(b.id)) : [];
      list.push({
        id: 'ai',
        title: 'Suggested by AI',
        entries: extra.map((b) => ({ kind: 'bookmark', key: `ai:${b.id}`, bookmark: b })),
        note:
          aiResult.status === 'loading' ? (
            <span className="flex items-center gap-2">
              <Spinner className="size-3.5" /> Looking through your bookmarks…
            </span>
          ) : aiResult.status === 'error' ? (
            <span className="text-danger">{aiResult.message}</span>
          ) : !extra.length ? (
            'AI found no other related bookmarks.'
          ) : undefined,
      });
    } else if (canUseAI) {
      list.push({ id: 'ask', entries: [{ kind: 'ask-ai', key: 'ask-ai' }] });
    }
    return list;
  }, [index, trimmed, variant, tabs, localTabs, localBookmarks, aiResult, canUseAI]);

  const entries = useMemo(() => sections.flatMap((s) => s.entries), [sections]);

  useEffect(() => setActive(0), [trimmed]);
  useEffect(() => setActive((i) => Math.min(i, Math.max(entries.length - 1, 0))), [entries.length]);

  const activate = useCallback(
    async (entry: Entry | undefined, background = false) => {
      if (!entry) return;
      if (entry.kind === 'ask-ai') return runAI(trimmed);
      if (entry.kind === 'tab') await switchToTab(entry.tab);
      else await openUrl(entry.bookmark.url, background);
      onOpened?.();
    },
    [runAI, trimmed, onOpened],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(entries.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      activate(entries[active], e.metaKey || e.ctrlKey);
    }
  };

  const empty = !!index && !!trimmed && !sections.length;

  return { query, setQuery, trimmed, terms, sections, entries, active, setActive, activate, onKeyDown, empty };
}

export type SearchState = ReturnType<typeof useSearch>;

function tabEntry(tab: OpenTab): Entry {
  return { kind: 'tab', key: `tab:${tab.id}`, tab };
}
function bookmarkEntry(bookmark: Bookmark): Entry {
  return { kind: 'bookmark', key: `bm:${bookmark.id}`, bookmark };
}

// ── Result list ──────────────────────────────────────────────────────────────

export function SearchResults({
  search,
  variant,
  onReveal,
  className,
}: {
  search: SearchState;
  variant: Variant;
  onReveal?: (bookmark: Bookmark) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { sections, active, setActive, activate, terms, trimmed } = search;

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let position = -1;
  return (
    <div ref={listRef} role="listbox" className={className}>
      {sections.map((section) => (
        <div key={section.id} className="pb-1">
          {section.title ? <div className="px-2.5 pt-2 pb-1 text-2xs font-medium text-fg-subtle">{section.title}</div> : null}
          {section.entries.map((entry) => {
            position++;
            const i = position;
            const isActive = i === active;
            const common = {
              'data-active': isActive,
              onMouseMove: () => !isActive && setActive(i),
              onClick: (e: MouseEvent) => activate(entry, e.metaKey || e.ctrlKey),
              className: cn(
                'group flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left',
                variant === 'palette' ? 'py-2' : 'py-1.5',
                isActive && 'bg-hover',
              ),
            };

            if (entry.kind === 'ask-ai') {
              return (
                <button key={entry.key} type="button" {...common}>
                  <span className="grid size-4 shrink-0 place-items-center">
                    <Sparkles className="size-4 text-accent-text" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                    Ask AI about “<span className="text-fg">{trimmed}</span>”
                  </span>
                  {isActive ? <Kbd>↵</Kbd> : null}
                </button>
              );
            }

            if (entry.kind === 'tab') {
              return (
                <div key={entry.key} role="option" aria-selected={isActive} {...common}>
                  <Favicon url={entry.tab.url} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">
                      <Highlight text={entry.tab.title} terms={terms} />
                    </div>
                    <div className="truncate text-xs text-fg-subtle">{displayUrl(entry.tab.url)}</div>
                  </div>
                  <span className={cn('flex shrink-0 items-center gap-1 text-2xs text-fg-subtle', !isActive && 'invisible')}>
                    <AppWindow className="size-3" /> Switch to tab
                  </span>
                </div>
              );
            }

            const b = entry.bookmark;
            const folder = b.path.split(' / ').pop();
            return (
              <div
                key={entry.key}
                role="option"
                aria-selected={isActive}
                onAuxClick={(e) => e.button === 1 && openUrl(b.url, true)}
                {...common}
              >
                <Favicon url={b.url} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg">
                    <Highlight text={b.title || displayUrl(b.url)} terms={section.id === 'ai' ? [] : terms} />
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
                    <span className="truncate">{displayUrl(b.url)}</span>
                    {variant !== 'page' && folder ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="max-w-[45%] shrink-0 truncate">{folder}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {variant === 'page' ? <span className="hidden max-w-[35%] truncate text-xs text-fg-subtle md:block">{b.path}</span> : null}
                {onReveal ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    title="Show in folder"
                    aria-label="Show in folder"
                    className="opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReveal(b);
                    }}
                  >
                    <FolderOpen />
                  </Button>
                ) : null}
              </div>
            );
          })}
          {section.note ? <div className="px-2.5 py-2 text-xs text-fg-muted">{section.note}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-accent/20 text-fg">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function NoResults({ query, settings, className }: { query: string; settings: Settings; className?: string }) {
  return (
    <EmptyState className={className} icon={<SearchX />} title="No matches">
      Nothing contains “{query}”.
      {settings.apiKey ? null : ' Add a Gemini API key in Settings to let AI search by meaning.'}
    </EmptyState>
  );
}

// ── Input and key hints ──────────────────────────────────────────────────────

export function SearchInput({
  search,
  inputRef,
  size = 'md',
  placeholder,
  bare,
  trailing,
}: {
  search: SearchState;
  inputRef?: RefObject<HTMLInputElement | null>;
  size?: 'md' | 'lg';
  placeholder: string;
  /** Borderless style for the palette header. */
  bare?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="relative flex items-center">
      <Search className={cn('pointer-events-none absolute text-fg-subtle', bare ? 'left-4 size-4.5' : 'left-3 size-4')} />
      <input
        ref={inputRef}
        autoFocus
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && search.query && !bare) {
            e.preventDefault();
            search.setQuery('');
            return;
          }
          search.onKeyDown(e);
        }}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label="Search"
        className={cn(
          'w-full text-fg outline-none placeholder:text-fg-subtle',
          bare
            ? 'h-13 bg-transparent pr-24 pl-11 text-base'
            : 'rounded-lg border border-border bg-bg pr-10 pl-9 text-sm hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-ring/40',
          !bare && (size === 'lg' ? 'h-10' : 'h-9'),
        )}
      />
      <div className="absolute right-2 flex items-center gap-1.5">
        {search.query && !bare ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              search.setQuery('');
              inputRef?.current?.focus();
            }}
            className="grid size-6 place-items-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}

export function KeyHints({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 text-2xs text-fg-subtle', className)}>
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> navigate
      </span>
      <span className="flex items-center gap-1">
        <Kbd>
          <CornerDownLeft className="size-2.5" />
        </Kbd>
        open
      </span>
      <span className="flex items-center gap-1">
        <Kbd>{MOD_KEY}</Kbd>
        <Kbd>
          <CornerDownLeft className="size-2.5" />
        </Kbd>
        background
      </span>
      {children}
    </div>
  );
}

// ── Popup and full-page search ───────────────────────────────────────────────

interface PanelProps {
  index: BookmarkIndex | null;
  settings: Settings;
  variant: 'popup' | 'page';
  initialQuery?: string;
  tabsEnabled?: boolean;
  onReveal?: (bookmark: Bookmark) => void;
}

export function SearchPanel({ index, settings, variant, initialQuery, tabsEnabled, onReveal }: PanelProps) {
  const search = useSearch({ index, settings, variant, initialQuery, tabsEnabled });
  const inputRef = useRef<HTMLInputElement>(null);
  const isPage = variant === 'page';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn(isPage ? 'pb-4' : 'px-3 pt-3 pb-2')}>
        <SearchInput
          inputRef={inputRef}
          search={search}
          size={isPage ? 'lg' : 'md'}
          placeholder={index ? `Search ${plural(index.bookmarks.length, 'bookmark')}${tabsEnabled ? ' and open tabs' : ''}…` : 'Search…'}
        />
      </div>

      <div className={cn('scroll-area min-h-0 flex-1', !isPage && 'px-1.5')}>
        {!index ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : !search.trimmed ? (
          <EmptyState icon={<Search />} title="Search your bookmarks">
            Matches titles, links and folder names. When nothing matches, AI looks for pages about what you typed.
          </EmptyState>
        ) : search.empty ? (
          <NoResults query={search.trimmed} settings={settings} />
        ) : (
          <SearchResults
            search={search}
            variant={variant}
            onReveal={onReveal}
            className={cn(isPage && 'rounded-xl border border-border p-1.5')}
          />
        )}
      </div>

      {isPage || !search.trimmed ? null : <KeyHints className="border-t border-border px-3 py-2" />}
    </div>
  );
}
