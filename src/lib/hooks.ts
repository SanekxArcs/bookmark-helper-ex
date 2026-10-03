import { useCallback, useEffect, useRef, useState } from 'react';
import type { Browser } from 'wxt/browser';
import { loadIndex, type BookmarkIndex } from './bookmarks';

/** Bookmark index that refreshes itself whenever bookmarks change anywhere. */
export function useBookmarkIndex() {
  const [index, setIndex] = useState<BookmarkIndex | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reload = useCallback(async () => {
    const next = await loadIndex();
    setIndex(next);
    return next;
  }, []);

  useEffect(() => {
    reload();
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 120);
    };
    const events = [
      browser.bookmarks.onCreated,
      browser.bookmarks.onRemoved,
      browser.bookmarks.onChanged,
      browser.bookmarks.onMoved,
      browser.bookmarks.onChildrenReordered,
      browser.bookmarks.onImportEnded,
    ] as { addListener(fn: () => void): void; removeListener(fn: () => void): void }[];
    events.forEach((e) => e.addListener(schedule));
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => e.removeListener(schedule));
    };
  }, [reload]);

  return { index, reload };
}

export function useActiveTab() {
  const [tab, setTab] = useState<Browser.tabs.Tab | null | undefined>(undefined);
  useEffect(() => {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([t]) => setTab(t ?? null))
      .catch(() => setTab(null));
  }, []);
  return tab;
}

/** Aborts the in-flight request when a new one starts or the component unmounts. */
export function useAbortable() {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => () => ref.current?.abort(), []);
  return useCallback(() => {
    ref.current?.abort();
    ref.current = new AbortController();
    return ref.current.signal;
  }, []);
}
