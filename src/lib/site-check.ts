import { useEffect, useSyncExternalStore } from 'react';
import type { Bookmark } from './bookmarks';

// Checks whether bookmarked pages still load. Every bookmark is checked twice:
// the exact saved link and the bare domain (https://host/). When the page fails
// but the domain answers, the page has probably moved or been removed.
//
// Real HTTP status codes need the optional host permission. Without it requests
// go out in no-cors mode, which only tells "responds" from "no response".

export type CheckStatus = 'alive' | 'http-error' | 'timeout' | 'no-response';

export interface CheckResult {
  status: CheckStatus;
  /** HTTP status code (full mode only). */
  code?: number;
  /** Final URL when the request was redirected (full mode only). */
  redirectedTo?: string;
}

export interface SiteReport {
  page: CheckResult;
  domain: CheckResult;
  checkedAt: number;
}

export type Verdict = 'ok' | 'moved' | 'down' | 'unchecked';

export const HOST_PERMISSION = { origins: ['http://*/*', 'https://*/*'] };

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 8;
const STORAGE_KEY = 'siteCheck';

export function isCheckable(url: string) {
  return /^https?:\/\//i.test(url);
}

export function domainUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return url;
  }
}

/** Single request: resolves as soon as headers arrive, the body is never downloaded. */
async function probe(url: string, full: boolean, stop: AbortSignal): Promise<CheckResult | null> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onStop = () => controller.abort();
  stop.addEventListener('abort', onStop);

  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: full ? 'cors' : 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    controller.abort();
    // Opaque (no-cors) responses have status 0: all we know is that the server answered.
    if (res.type === 'opaque') return { status: 'alive' };
    const code = res.status;
    // 401/403/429 and friends usually mean bot protection or a login wall: the page exists.
    const broken = code === 404 || code === 410 || code >= 500;
    return {
      status: broken ? 'http-error' : 'alive',
      code,
      redirectedTo: res.redirected && res.url !== url ? res.url : undefined,
    };
  } catch {
    if (stop.aborted) return null;
    return { status: timedOut ? 'timeout' : 'no-response' };
  } finally {
    clearTimeout(timer);
    stop.removeEventListener('abort', onStop);
  }
}

/** A deep link that now lands on the site's home page: the classic sign of a removed page. */
export function redirectsHome(url: string, result: CheckResult) {
  if (!result.redirectedTo) return false;
  try {
    const from = new URL(url);
    const to = new URL(result.redirectedTo);
    return from.pathname.replace(/\/+$/, '') !== '' && to.pathname.replace(/\/+$/, '') === '';
  } catch {
    return false;
  }
}

export function verdictOf(url: string, report: SiteReport | undefined, kept: boolean): Verdict {
  if (!report) return 'unchecked';
  if (kept) return 'ok';
  if (report.page.status === 'alive') return redirectsHome(url, report.page) ? 'moved' : 'ok';
  return report.domain.status === 'alive' ? 'moved' : 'down';
}

/** Explains a problem verdict in one line. */
export function verdictHint(url: string, report: SiteReport) {
  if (report.page.status === 'alive' && redirectsHome(url, report.page)) {
    return 'The link now redirects to the home page, so the page was probably removed or moved.';
  }
  if (report.domain.status === 'alive') return 'The site responds but this page doesn’t, so it may have moved or been removed.';
  return 'Neither the page nor the site responds. The site may be gone for good, or just temporarily down.';
}

// ── Store ─────────────────────────────────────────────────────────────────────
// Module-level so a running check survives switching sections in the manager.

interface Persisted {
  results: Record<string, SiteReport>;
  kept: string[];
  basic: boolean;
  finishedAt?: number;
}

export interface CheckerState {
  loaded: boolean;
  running: boolean;
  done: number;
  total: number;
  results: Map<string, SiteReport>;
  kept: Set<string>;
  /** Last run had no host permission, so HTTP errors couldn't be detected. */
  basic: boolean;
  finishedAt?: number;
  /** Urls being rechecked one by one. */
  pending: Set<string>;
}

let state: CheckerState = {
  loaded: false,
  running: false,
  done: 0,
  total: 0,
  results: new Map(),
  kept: new Set(),
  basic: false,
  pending: new Set(),
};
let runController: AbortController | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(patch: Partial<CheckerState> = {}) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let emitTimer: ReturnType<typeof setTimeout> | undefined;
/** Live progress re-renders at most a few times a second. */
function emitSoon() {
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = undefined;
    emit();
  }, 200);
}

function load() {
  loading ??= browser.storage.local.get(STORAGE_KEY).then((raw) => {
    const saved = raw[STORAGE_KEY] as Persisted | undefined;
    emit({
      loaded: true,
      results: new Map(Object.entries(saved?.results ?? {})),
      kept: new Set(saved?.kept ?? []),
      basic: saved?.basic ?? false,
      finishedAt: saved?.finishedAt,
    });
  });
  return loading;
}

async function persist() {
  const data: Persisted = {
    results: Object.fromEntries(state.results),
    kept: [...state.kept],
    basic: state.basic,
    finishedAt: state.finishedAt,
  };
  await browser.storage.local.set({ [STORAGE_KEY]: data });
}

export function useSiteChecker() {
  useEffect(() => {
    load();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Must be called from a click handler: the permission prompt needs a user gesture. */
export async function requestFullAccess() {
  try {
    return await browser.permissions.request(HOST_PERMISSION);
  } catch {
    return false;
  }
}

async function checkUrls(urls: string[], full: boolean, stop: AbortSignal, onDone: (url: string, report: SiteReport) => void) {
  const domains = new Map<string, Promise<CheckResult | null>>();
  const queue = [...urls];

  const worker = async () => {
    while (queue.length && !stop.aborted) {
      const url = queue.shift()!;
      const root = domainUrl(url);
      let domain = domains.get(root);
      if (!domain) {
        domain = probe(root, full, stop);
        domains.set(root, domain);
      }
      // A link to the bare domain is its own domain check.
      const [page, site] = await Promise.all([root === url ? domain : probe(url, full, stop), domain]);
      if (page && site) onDone(url, { page, domain: site, checkedAt: Date.now() });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
}

/** Checks the given bookmarks (all of them, or just the ones to recheck). */
export async function runCheck(bookmarks: Bookmark[], full: boolean, { replace }: { replace: boolean }) {
  if (state.running) return;
  await load();
  const urls = [...new Set(bookmarks.map((b) => b.url).filter(isCheckable))];
  runController = new AbortController();
  const results = replace ? new Map<string, SiteReport>() : state.results;
  emit({ running: true, done: 0, total: urls.length, results, basic: !full });

  let lastSave = Date.now();
  await checkUrls(urls, full, runController.signal, (url, report) => {
    state.results.set(url, report);
    state.done++;
    emitSoon();
    if (Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      persist();
    }
  });

  clearTimeout(emitTimer);
  emitTimer = undefined;
  const stopped = runController.signal.aborted;
  runController = null;
  emit({ running: false, finishedAt: stopped ? state.finishedAt : Date.now(), results: new Map(state.results) });
  await persist();
  return { stopped };
}

export function stopCheck() {
  runController?.abort();
}

export async function recheckOne(url: string, full: boolean) {
  if (state.pending.has(url)) return;
  emit({ pending: new Set(state.pending).add(url) });
  await checkUrls([url], full, new AbortController().signal, (u, report) => {
    const results = new Map(state.results);
    results.set(u, report);
    const kept = new Set(state.kept);
    kept.delete(u);
    emit({ results, kept });
  });
  const pending = new Set(state.pending);
  pending.delete(url);
  emit({ pending });
  await persist();
}

/** "Mark as fine": keeps the bookmark out of the problem lists. */
export async function setKept(url: string, keep: boolean) {
  const kept = new Set(state.kept);
  if (keep) kept.add(url);
  else kept.delete(url);
  emit({ kept });
  await persist();
}

export async function clearResults() {
  emit({ results: new Map(), kept: new Set(), finishedAt: undefined, basic: false });
  await browser.storage.local.remove(STORAGE_KEY);
}
