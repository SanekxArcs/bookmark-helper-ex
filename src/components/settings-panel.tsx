import { useEffect, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Eye, EyeOff, Heart, Mail, Monitor, Moon, Sun } from 'lucide-react';
import { GithubIcon } from './icons';
import { ACCENTS, type Settings } from '@/lib/settings';
import { DEFAULT_MODEL, MODELS, errorMessage, resolveModel, testConnection } from '@/lib/gemini';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input, Select } from './ui/field';
import { Kbd, Segmented, Switch } from './ui/misc';
import { useTabsPermission } from '@/lib/tabs';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  bookmarkCount?: number;
}

export function SettingsPanel({ settings, update, bookmarkCount }: Props) {
  return (
    <div className="space-y-6">
      <Section title="Appearance">
        <Row title="Theme" stack>
          <Segmented
            className="w-full"
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: 'System', icon: <Monitor /> },
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
            ]}
          />
        </Row>
        <Row title="Accent color" description={ACCENTS.find((a) => a.id === settings.accent)?.label}>
          <div role="radiogroup" aria-label="Accent color" className="flex gap-1.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={settings.accent === a.id}
                aria-label={a.label}
                title={a.label}
                onClick={() => update({ accent: a.id })}
                className={cn(
                  'grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                  settings.accent === a.id ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border-strong',
                )}
              >
                <span className="size-5 rounded-full border border-black/10 dark:border-white/10" style={{ background: a.swatch }} />
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Gemini AI">
        <ApiKeyRow settings={settings} update={update} />
        <Row title="Model" stack>
          <Select
            value={MODELS.some((m) => m.id === resolveModel(settings.geminiModel)) ? resolveModel(settings.geminiModel) : DEFAULT_MODEL}
            onChange={(e) => update({ geminiModel: e.target.value })}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.hint}
              </option>
            ))}
          </Select>
        </Row>
      </Section>

      <QuickSearchSection settings={settings} update={update} />

      <Section title="Automation">
        <Row
          title="Auto-sort new bookmarks"
          description="When you bookmark a page with the star icon, move it to the best folder. A notification lets you undo."
          htmlFor="autosort"
        >
          <Switch id="autosort" checked={settings.autoSort} onCheckedChange={(autoSort) => update({ autoSort })} />
        </Row>
        <Row title="New folders go in" description="Where AI creates top-level folders.">
          <Select
            className="w-40"
            value={settings.newFolderRoot}
            onChange={(e) => update({ newFolderRoot: e.target.value as Settings['newFolderRoot'] })}
          >
            <option value="bar">Bookmarks bar</option>
            <option value="other">Other bookmarks</option>
          </Select>
        </Row>
      </Section>

      <Section title="About">
        <Row title="Version">
          <span className="text-xs text-fg-muted tabular-nums">{browser.runtime.getManifest().version}</span>
        </Row>
        {bookmarkCount !== undefined ? (
          <Row title="Bookmarks">
            <span className="text-xs text-fg-muted tabular-nums">{bookmarkCount.toLocaleString()}</span>
          </Row>
        ) : null}
        <div className="flex flex-wrap gap-1 px-1.5 py-2">
          <LinkButton href="https://github.com/SanekxArcs" icon={<GithubIcon />}>
            GitHub
          </LinkButton>
          <LinkButton href="mailto:oleksandr.dzisiak@gmail.com" icon={<Mail />}>
            Feedback
          </LinkButton>
          <LinkButton href="https://www.paypal.com/paypalme/SanekxArcs" icon={<Heart />}>
            Support the project
          </LinkButton>
        </div>
      </Section>
    </div>
  );
}

function QuickSearchSection({ settings, update }: Pick<Props, 'settings' | 'update'>) {
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [tabsGranted, setTabsEnabled] = useTabsPermission();

  useEffect(() => {
    const refresh = () =>
      browser.commands.getAll().then((all) => setShortcut(all.find((c) => c.name === 'quick-search')?.shortcut ?? ''));
    refresh();
    // The user may change it on the browser's shortcuts page and come back.
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  return (
    <Section title="Quick search">
      <Row
        title="Keyboard shortcut"
        description="Opens a search bar over the page you’re on. Works on any website."
      >
        <div className="flex shrink-0 items-center gap-2">
          {shortcut ? (
            <span className="flex gap-1">
              {shortcut.split('+').map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          ) : shortcut === '' ? (
            <span className="text-xs text-fg-subtle">Not set</span>
          ) : null}
          <Button size="sm" onClick={() => browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Change
          </Button>
        </div>
      </Row>
      <Row
        title="Include open tabs"
        description="Search your open tabs too and jump to them. The browser asks for permission to read tab titles and addresses."
        htmlFor="search-tabs"
      >
        <Switch id="search-tabs" checked={!!tabsGranted} onCheckedChange={(on) => setTabsEnabled(on)} />
      </Row>
      <Row
        title="Ask AI when nothing matches"
        description="Search by meaning after you stop typing. Each new query uses one Gemini request."
        htmlFor="auto-ai"
      >
        <Switch id="auto-ai" checked={settings.autoAISearch} onCheckedChange={(autoAISearch) => update({ autoAISearch })} />
      </Row>
    </Section>
  );
}

function ApiKeyRow({ settings, update }: Pick<Props, 'settings' | 'update'>) {
  const [draft, setDraft] = useState(settings.apiKey);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<{ state: 'idle' | 'testing' | 'ok' } | { state: 'error'; message: string }>({ state: 'idle' });

  useEffect(() => setDraft(settings.apiKey), [settings.apiKey]);
  useEffect(() => setStatus({ state: 'idle' }), [settings.apiKey, settings.geminiModel]);

  const commit = async () => {
    const key = draft.trim();
    if (key !== settings.apiKey) await update({ apiKey: key });
    return key;
  };

  const test = async () => {
    const key = await commit();
    setStatus({ state: 'testing' });
    try {
      await testConnection(key, settings.geminiModel);
      setStatus({ state: 'ok' });
    } catch (err) {
      setStatus({ state: 'error', message: errorMessage(err) });
    }
  };

  return (
    <Row
      title="API key"
      stack
      aside={
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent-text hover:underline"
        >
          Get a free key
        </a>
      }
    >
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            type={visible ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && test()}
            placeholder="Paste your Gemini API key"
            spellCheck={false}
            autoComplete="off"
            className="pr-8 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide key' : 'Show key'}
            className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded text-fg-subtle hover:text-fg [&_svg]:size-3.5"
          >
            {visible ? <EyeOff /> : <Eye />}
          </button>
        </div>
        <Button onClick={test} loading={status.state === 'testing'} disabled={!draft.trim()}>
          Test
        </Button>
      </div>
      {status.state === 'ok' ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-success">
          <Check className="size-3.5" /> Connected. AI features are ready.
        </p>
      ) : status.state === 'error' ? (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-danger">
          <CircleAlert className="mt-px size-3.5 shrink-0" /> {status.message}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-fg-subtle">Stored only in this browser. Sent only to Google’s Gemini API.</p>
      )}
    </Row>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-medium text-fg-muted">{title}</h3>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({
  title,
  description,
  children,
  stack,
  aside,
  htmlFor,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  stack?: boolean;
  aside?: ReactNode;
  htmlFor?: string;
}) {
  const heading = (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {title}
      </label>
      {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
    </div>
  );
  if (stack) {
    return (
      <div className="px-3.5 py-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          {heading}
          {aside}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-3">
      {heading}
      {children}
    </div>
  );
}

function LinkButton({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg [&_svg]:size-3.5"
    >
      {icon}
      {children}
    </a>
  );
}
