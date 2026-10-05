import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, ExternalLink, Globe, Info, RotateCw, ShieldCheck, Square, Trash2, Undo2 } from 'lucide-react';
import { removeWithUndo } from '@/components/actions';
import { Page } from '@/components/page';
import { toast } from '@/components/toaster';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, Callout, EmptyState, Favicon, Segmented } from '@/components/ui/misc';
import { displayUrl, openUrl, type Bookmark, type BookmarkIndex } from '@/lib/bookmarks';
import {
  HOST_PERMISSION,
  domainUrl,
  isCheckable,
  recheckOne,
  redirectsHome,
  requestFullAccess,
  runCheck,
  setKept,
  stopCheck,
  useSiteChecker,
  verdictHint,
  verdictOf,
  type CheckResult,
  type SiteReport,
  type Verdict,
} from '@/lib/site-check';
import { plural } from '@/lib/utils';

type Filter = 'problems' | 'moved' | 'down' | 'ok' | 'unchecked';

const FILTERS: Record<Filter, { label: string; description: string; empty: string }> = {
  problems: { label: 'Problems', description: 'Every link that failed. Check them yourself, or trust the result and delete.', empty: 'Every checked link still works.' },
  moved: { label: 'Page changed', description: 'The site responds, but this exact page doesn’t, or it redirects to the home page.', empty: 'No moved or removed pages.' },
  down: { label: 'Site down', description: 'Neither the page nor its domain responds.', empty: 'Every site responds.' },
  ok: { label: 'Alive', description: 'The page loads, or you marked it as fine.', empty: 'Nothing here yet.' },
  unchecked: { label: 'Not checked', description: 'New since the last check, or not a web link (file:, javascript: and so on).', empty: 'Every bookmark has been checked.' },
};

const PAGE_SIZE = 100;

interface Row {
  bookmark: Bookmark;
  report?: SiteReport;
  verdict: Verdict;
  kept: boolean;
}

function matches(filter: Filter, verdict: Verdict) {
  return filter === 'problems' ? verdict === 'moved' || verdict === 'down' : filter === verdict;
}

function useFullAccess() {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    const refresh = () => browser.permissions.contains(HOST_PERMISSION).then(setGranted);
    refresh();
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);
    return () => {
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, []);
  return granted;
}

export function SiteCheckPage({ index }: { index: BookmarkIndex }) {
  const checker = useSiteChecker();
  const fullAccess = useFullAccess();
  const [filter, setFilter] = useState<Filter>('problems');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo<Row[]>(
    () =>
      index.bookmarks.map((b) => {
        const report = checker.results.get(b.url);
        const kept = checker.kept.has(b.url);
        return { bookmark: b, report, kept, verdict: verdictOf(b.url, report, kept) };
      }),
    // `checker` changes on every progress update while results are filled in place.
    [index, checker],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { problems: 0, moved: 0, down: 0, ok: 0, unchecked: 0 };
    for (const r of rows) {
      c[r.verdict as Filter]++;
      if (r.verdict === 'moved' || r.verdict === 'down') c.problems++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () =>
      rows
        .filter((r) => matches(filter, r.verdict))
        .sort((a, b) => displayUrl(a.bookmark.url).localeCompare(displayUrl(b.bookmark.url))),
    [rows, filter],
  );

  useEffect(() => setLimit(PAGE_SIZE), [filter]);

  const checkable = index.bookmarks.filter((b) => isCheckable(b.url));
  const hasResults = checker.results.size > 0;
  const canDelete = filter !== 'ok' && filter !== 'unchecked' && visible.length > 0 && !checker.running;

  const start = async (scope: 'all' | 'problems' | 'unchecked') => {
    if (!navigator.onLine) {
      toast.error('You’re offline', { description: 'Connect to the internet and try again.' });
      return;
    }
    // Ask first, while we still have the click's user gesture.
    const full = await requestFullAccess();
    if (!full) {
      toast('Running a basic check', {
        description: 'Without access to sites, 404 pages and server errors look alive. Only links that don’t respond are found.',
        duration: 8000,
      });
    }
    const targets =
      scope === 'all'
        ? checkable
        : rows.filter((r) => (scope === 'problems' ? r.verdict === 'moved' || r.verdict === 'down' : r.verdict === 'unchecked')).map((r) => r.bookmark);
    const result = await runCheck(targets, full, { replace: scope === 'all' });
    if (result?.stopped) toast('Check stopped', { description: 'Results so far are kept.' });
    else if (result) toast.success('Check finished');
  };

  const deleteVisible = () => removeWithUndo(visible.map((r) => r.bookmark.id));

  return (
    <div className="scroll-area h-full">
      <Page
        title="Site check"
        description="Find bookmarks whose page or whole site no longer responds."
        actions={
          canDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete {plural(visible.length, 'bookmark')}
            </Button>
          ) : null
        }
      >
        {!checker.loaded ? null : !hasResults && !checker.running ? (
          <div className="rounded-xl border border-border">
            <EmptyState className="py-16" icon={<Activity />} title="Check your links">
              <p>
                Each bookmark is opened twice in the background: the exact saved link and its bare domain. That tells a page that
                moved apart from a site that’s gone.
              </p>
              <Button variant="primary" className="mt-4" onClick={() => start('all')} disabled={!checkable.length}>
                Check {plural(checkable.length, 'link')}
              </Button>
            </EmptyState>
          </div>
        ) : (
          <>
            <Toolbar
              checker={checker}
              counts={counts}
              onStart={start}
              uncheckedCheckable={rows.some((r) => r.verdict === 'unchecked' && isCheckable(r.bookmark.url))}
            />

            {checker.basic && !checker.running ? (
              <div className="mb-4">
                <Callout
                  tone="warning"
                  icon={<Info />}
                  action={
                    fullAccess ? null : (
                      <Button size="sm" onClick={() => start('all')}>
                        Allow and recheck
                      </Button>
                    )
                  }
                >
                  The last check was basic: it ran without access to sites, so it only found links that don’t respond at all. Pages
                  that return 404 or a server error show as alive.
                </Callout>
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={(Object.keys(FILTERS) as Filter[]).map((f) => ({ value: f, label: `${FILTERS[f].label} · ${counts[f]}` }))}
              />
            </div>
            <p className="mb-3 text-xs text-fg-muted">{FILTERS[filter].description}</p>

            {visible.length ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <ul>
                  {visible.slice(0, limit).map((r) => (
                    <ResultRow
                      key={r.bookmark.id}
                      row={r}
                      pending={checker.pending.has(r.bookmark.url)}
                      disabled={checker.running}
                      fullAccess={fullAccess}
                    />
                  ))}
                </ul>
                {visible.length > limit ? (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                    className="w-full border-t border-border px-4 py-2 text-left text-xs text-fg-muted hover:bg-hover hover:text-fg"
                  >
                    Show {Math.min(PAGE_SIZE, visible.length - limit)} more of {visible.length - limit}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-border">
                <EmptyState className="py-16" icon={<CheckCircle2 />} title={`No bookmarks in “${FILTERS[filter].label}”`}>
                  {checker.running ? 'Results appear here as the check runs.' : FILTERS[filter].empty}
                </EmptyState>
              </div>
            )}
          </>
        )}
      </Page>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${plural(visible.length, 'bookmark')}?`}
        description={`Everything listed under “${FILTERS[filter].label}” will be deleted. You can undo this right after.`}
        confirmLabel="Delete"
        destructive
        onConfirm={deleteVisible}
      />
    </div>
  );
}

function Toolbar({
  checker,
  counts,
  onStart,
  uncheckedCheckable,
}: {
  checker: ReturnType<typeof useSiteChecker>;
  counts: Record<Filter, number>;
  onStart: (scope: 'all' | 'problems' | 'unchecked') => void;
  uncheckedCheckable: boolean;
}) {
  if (checker.running) {
    const pct = checker.total ? Math.round((checker.done / checker.total) * 100) : 0;
    return (
      <div className="mb-5 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm">
            Checking {checker.done.toLocaleString()} of {plural(checker.total, 'link')}…
          </p>
          <Button size="sm" onClick={stopCheck}>
            <Square /> Stop
          </Button>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <p className="mr-auto text-xs text-fg-muted">
        {checker.finishedAt ? `Last checked ${new Date(checker.finishedAt).toLocaleString()}` : 'Last check didn’t finish.'}
      </p>
      {uncheckedCheckable ? (
        <Button size="sm" onClick={() => onStart('unchecked')}>
          Check new
        </Button>
      ) : null}
      {counts.problems ? (
        <Button size="sm" onClick={() => onStart('problems')} title="Sites are sometimes down for a moment. Check failed links again.">
          <RotateCw /> Recheck {plural(counts.problems, 'problem')}
        </Button>
      ) : null}
      <Button size="sm" onClick={() => onStart('all')}>
        <RotateCw /> Check all again
      </Button>
    </div>
  );
}

function statusChip(result: CheckResult | undefined, url?: string): { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' } {
  if (!result) return { label: 'Not checked', tone: 'neutral' };
  switch (result.status) {
    case 'alive':
      if (url && redirectsHome(url, result)) {
        return { label: 'Redirects home', tone: 'warning' };
      }
      return { label: result.code && result.code !== 200 ? `Alive · ${result.code}` : 'Alive', tone: 'success' };
    case 'http-error':
      return { label: result.code === 404 ? 'Not found · 404' : result.code === 410 ? 'Gone · 410' : `Error · ${result.code}`, tone: 'danger' };
    case 'timeout':
      return { label: 'Timed out', tone: 'warning' };
    case 'no-response':
      return { label: 'No response', tone: 'danger' };
  }
}

function ResultRow({ row, pending, disabled, fullAccess }: { row: Row; pending: boolean; disabled: boolean; fullAccess: boolean }) {
  const { bookmark: b, report, verdict, kept } = row;
  const checkable = isCheckable(b.url);
  const page = statusChip(report?.page, b.url);
  const site = statusChip(report?.domain);
  const problem = verdict === 'moved' || verdict === 'down';
  const root = domainUrl(b.url);

  return (
    <li className="group flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <Favicon url={b.url} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{b.title || displayUrl(b.url)}</span>
          {kept ? <Badge tone="accent">Marked fine</Badge> : null}
        </div>
        <p className="truncate text-xs text-fg-subtle" title={b.url}>
          {b.path} · {displayUrl(b.url)}
        </p>
        {checkable ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
            <span className="flex items-center gap-1.5">
              Page <Badge tone={page.tone}>{page.label}</Badge>
            </span>
            <span className="flex items-center gap-1.5">
              Site <Badge tone={site.tone}>{site.label}</Badge>
            </span>
          </div>
        ) : (
          <p className="mt-1 text-2xs text-fg-subtle">Only http and https links can be checked.</p>
        )}
        {problem && report ? <p className="mt-1 text-xs text-fg-muted">{verdictHint(b.url, report)}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        {problem ? (
          <Button size="sm" variant="ghost" onClick={() => setKept(b.url, true)} title="Keep this bookmark out of the problem lists">
            <ShieldCheck /> Mark as fine
          </Button>
        ) : kept ? (
          <Button size="sm" variant="ghost" onClick={() => setKept(b.url, false)}>
            <Undo2 /> Unmark
          </Button>
        ) : null}
        {checkable ? (
          <Button
            size="sm"
            variant="ghost"
            icon
            title="Check again"
            aria-label="Check again"
            loading={pending}
            disabled={disabled}
            onClick={() => recheckOne(b.url, fullAccess)}
          >
            <RotateCw />
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon title="Open page" aria-label="Open page" onClick={() => openUrl(b.url)}>
          <ExternalLink />
        </Button>
        {checkable && root !== b.url ? (
          <Button size="sm" variant="ghost" icon title={`Open ${displayUrl(root)}`} aria-label="Open site" onClick={() => openUrl(root)}>
            <Globe />
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          icon
          title="Delete"
          aria-label="Delete"
          className="hover:text-danger"
          onClick={() => removeWithUndo([b.id])}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
