import { useEffect, useState, type ReactNode } from 'react';
import { Activity, Copy, FolderTree, Search, Settings2 } from 'lucide-react';
import { AppLogo } from '@/components/icons';
import { SearchPanel } from '@/components/search-panel';
import { SettingsPanel } from '@/components/settings-panel';
import { Page } from '@/components/page';
import { Toaster } from '@/components/toaster';
import { Spinner } from '@/components/ui/misc';
import { MODELS, resolveModel } from '@/lib/gemini';
import { useBookmarkIndex } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { useTabsPermission } from '@/lib/tabs';
import { useThemeSync } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { DuplicatesPage } from './DuplicatesPage';
import { OrganizePage } from './OrganizePage';
import { SiteCheckPage } from './SiteCheckPage';

type Section = 'organize' | 'duplicates' | 'check' | 'search' | 'settings';

const NAV: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'organize', label: 'Organize', icon: <FolderTree /> },
  { id: 'duplicates', label: 'Duplicates', icon: <Copy /> },
  { id: 'check', label: 'Site check', icon: <Activity /> },
  { id: 'search', label: 'Search', icon: <Search /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 /> },
];

/** Routes look like #organize, #organize/123 (folder id) or #search?q=react. */
function parseHash() {
  const [path = '', query = ''] = location.hash.slice(1).split('?');
  const [section, param] = path.split('/');
  return {
    section: (NAV.some((n) => n.id === section) ? section : 'organize') as Section,
    param: param ? decodeURIComponent(param) : undefined,
    query: new URLSearchParams(query).get('q') ?? undefined,
  };
}

function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = (hash: string) => {
    if (location.hash.slice(1) !== hash) location.hash = hash;
  };
  return [route, navigate] as const;
}

export function App() {
  const [settings, update] = useSettings();
  const theme = useThemeSync(settings);
  const { index } = useBookmarkIndex();
  const [route, navigate] = useHashRoute();
  const [tabsGranted] = useTabsPermission();

  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === route.section)?.label} · Bookmark Helper`;
  }, [route.section]);

  const model = MODELS.find((m) => m.id === resolveModel(settings?.geminiModel));

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <AppLogo className="size-5" />
          <span className="text-sm font-semibold tracking-tight">Bookmark Helper</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              aria-current={route.section === n.id ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg [&_svg]:size-4',
                route.section === n.id && 'bg-hover font-medium text-fg',
              )}
            >
              {n.icon}
              {n.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto border-t border-border p-3">
          {settings?.apiKey ? (
            <div className="flex items-center gap-2 px-1 text-xs text-fg-muted">
              <span className="size-1.5 rounded-full bg-success" />
              <span className="truncate">{model?.label ?? settings.geminiModel}</span>
            </div>
          ) : settings ? (
            <a href="#settings" className="flex items-center gap-2 rounded px-1 text-xs text-fg-muted hover:text-fg">
              <span className="size-1.5 rounded-full bg-warning" />
              AI not set up
            </a>
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {!settings || !index ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : route.section === 'organize' ? (
          <OrganizePage
            index={index}
            settings={settings}
            folderId={route.param}
            focusId={route.query}
            onFolderChange={(id) => navigate(`organize/${id}`)}
          />
        ) : route.section === 'duplicates' ? (
          <DuplicatesPage index={index} settings={settings} />
        ) : route.section === 'check' ? (
          <SiteCheckPage index={index} />
        ) : route.section === 'search' ? (
          <Page title="Search" description="Find any bookmark by title, link or folder, or describe it and let AI find it.">
            <div className="h-[calc(100vh-140px)]">
              <SearchPanel
                index={index}
                settings={settings}
                variant="page"
                tabsEnabled={!!tabsGranted}
                initialQuery={route.query}
                onReveal={(b) => navigate(`organize/${b.parentId}?q=${b.id}`)}
              />
            </div>
          </Page>
        ) : (
          <div className="scroll-area h-full">
            <Page title="Settings" description="Appearance, AI connection and automation.">
              <div className="max-w-xl">
                <SettingsPanel settings={settings} update={update} bookmarkCount={index.bookmarks.length} />
              </div>
            </Page>
          </div>
        )}
      </main>

      <Toaster theme={theme} position="bottom-right" />
    </div>
  );
}
