import { useEffect, useState, type ReactNode } from 'react';
import { BookmarkPlus, FolderTree, Maximize2, Search, Settings2 } from 'lucide-react';
import { AppLogo } from '@/components/icons';
import { SearchPanel } from '@/components/search-panel';
import { SettingsPanel } from '@/components/settings-panel';
import { Toaster } from '@/components/toaster';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { useBookmarkIndex } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import { useTabsPermission } from '@/lib/tabs';
import { useThemeSync } from '@/lib/theme';
import { cn, openManager } from '@/lib/utils';
import { OrganizeView } from './OrganizeView';
import { SaveView } from './SaveView';

type Tab = 'save' | 'search' | 'organize' | 'settings';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'save', label: 'Save', icon: <BookmarkPlus /> },
  { id: 'search', label: 'Search', icon: <Search /> },
  { id: 'organize', label: 'Organize', icon: <FolderTree /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 /> },
];

export function App() {
  const [settings, update] = useSettings();
  const theme = useThemeSync(settings);
  const { index } = useBookmarkIndex();
  const [tab, setTab] = useState<Tab>('save');
  const [tabsGranted] = useTabsPermission();

  useEffect(() => {
    // The quick search shortcut opens the popup here on pages that can't show the overlay.
    browser.storage.session.get('popupTab').then(({ popupTab }) => {
      if (popupTab === 'search') setTab('search');
      browser.storage.session.remove('popupTab');
    });
  }, []);

  const managerSection = tab === 'search' ? 'search' : tab === 'settings' ? 'settings' : 'organize';

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 px-3">
        <AppLogo className="size-5" />
        <span className="text-sm font-semibold tracking-tight">Bookmark Helper</span>
        <Button
          variant="ghost"
          size="sm"
          icon
          className="ml-auto"
          title="Open full manager"
          aria-label="Open full manager"
          onClick={() => openManager(managerSection).then(() => window.close())}
        >
          <Maximize2 />
        </Button>
      </header>

      <nav role="tablist" className="flex shrink-0 gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex h-9 flex-1 items-center justify-center gap-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg [&_svg]:size-3.5',
              tab === t.id && 'text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <main className="relative min-h-0 flex-1">
        {!settings || !index ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : tab === 'save' ? (
          <SaveView index={index} settings={settings} onOpenSettings={() => setTab('settings')} />
        ) : tab === 'search' ? (
          <SearchPanel index={index} settings={settings} variant="popup" tabsEnabled={!!tabsGranted} />
        ) : tab === 'organize' ? (
          <OrganizeView index={index} settings={settings} onOpenSettings={() => setTab('settings')} />
        ) : (
          <div className="scroll-area h-full p-3">
            <SettingsPanel settings={settings} update={update} bookmarkCount={index.bookmarks.length} />
          </div>
        )}
      </main>

      <Toaster theme={theme} />
    </div>
  );
}
