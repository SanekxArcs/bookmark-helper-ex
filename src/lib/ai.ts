import { generateJSON, type Schema } from './gemini';
import {
  defaultRoot,
  hostname,
  PATH_SEPARATOR,
  targetFolders,
  type Bookmark,
  type BookmarkIndex,
  type Target,
} from './bookmarks';
import type { Settings } from './settings';

interface Ctx {
  settings: Settings;
  index: BookmarkIndex;
  signal?: AbortSignal;
}

export interface Suggestion {
  target: Target;
  reason: string;
}

export interface Move extends Suggestion {
  bookmarkId: string;
}

// ── Shared prompt pieces ─────────────────────────────────────────────────────

const MAX_FOLDERS = 800;

function folderList(index: BookmarkIndex) {
  return targetFolders(index)
    .slice(0, MAX_FOLDERS)
    .map((f) => `${f.id}: ${f.path}`)
    .join('\n');
}

function rules(ctx: Ctx) {
  const root = defaultRoot(ctx.index, ctx.settings.newFolderRoot);
  return `Rules:
- Strongly prefer an existing folder. Propose a new folder only when nothing existing is a reasonable fit.
- A new folder can be nested inside an existing folder via parentFolderId; otherwise it is created in "${root?.title ?? 'Bookmarks bar'}".
- New folder names are short (1-3 words) and match the language and naming style of the existing folders.
- "reason" is one short sentence for the user. Refer to folders by name, never by ID.`;
}

const TARGET_FIELDS: Record<string, Schema> = {
  folderId: { type: 'STRING', nullable: true, description: 'ID of the chosen existing folder, or null for a new folder' },
  newFolderName: { type: 'STRING', nullable: true, description: 'Name of the new folder, or null' },
  parentFolderId: { type: 'STRING', nullable: true, description: 'Existing folder ID to create the new folder in, or null' },
  reason: { type: 'STRING' },
};

interface RawTarget {
  folderId?: string | null;
  newFolderName?: string | null;
  parentFolderId?: string | null;
  reason?: string;
}

/** Turns model output into a validated target; drops anything that references unknown folders. */
function toTarget(raw: RawTarget, index: BookmarkIndex): Target | null {
  const existing = raw.folderId ? index.folderById.get(String(raw.folderId)) : undefined;
  if (existing && !existing.locked) return { type: 'existing', folderId: existing.id };

  const name = raw.newFolderName?.replace(/[\\/]+/g, ' ').trim().slice(0, 60);
  if (!name) return null;
  const parent = raw.parentFolderId ? index.folderById.get(String(raw.parentFolderId)) : undefined;
  const parentId = parent && !parent.locked ? parent.id : null;

  // The model sometimes "invents" a folder that already exists; reuse it.
  const parentPath = parentId ? index.folderById.get(parentId)!.path : null;
  const match = targetFolders(index).find(
    (f) =>
      f.title.toLowerCase() === name.toLowerCase() &&
      (parentPath === null ? true : f.path === parentPath + PATH_SEPARATOR + f.title),
  );
  if (match) return { type: 'existing', folderId: match.id };
  return { type: 'new', name, parentId };
}

function clip(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Suggest a folder for one page ────────────────────────────────────────────

export async function suggestFolder(
  ctx: Ctx,
  page: { title: string; url: string; note?: string },
): Promise<Suggestion> {
  const prompt = `You organize a user's browser bookmarks. Pick the best folder for this page.

Page:
- Title: ${JSON.stringify(clip(page.title, 300))}
- URL: ${clip(page.url, 500)}${page.note ? `\n- What the user wants it for: ${JSON.stringify(clip(page.note, 500))}` : ''}

Existing folders (id: path):
${folderList(ctx.index)}

${rules(ctx)}`;

  const raw = await generateJSON<RawTarget>({
    apiKey: ctx.settings.apiKey,
    model: ctx.settings.geminiModel,
    prompt,
    signal: ctx.signal,
    maxOutputTokens: 1024,
    schema: { type: 'OBJECT', properties: TARGET_FIELDS, required: ['reason'] },
  });

  const target = toTarget(raw, ctx.index);
  if (!target) throw new Error("The AI couldn't pick a folder for this page. Try adding a note.");
  return { target, reason: raw.reason?.trim() || '' };
}

// ── Batch sort ───────────────────────────────────────────────────────────────

const SORT_BATCH = 40;

export async function sortBookmarks(
  ctx: Ctx,
  bookmarks: Bookmark[],
  onProgress?: (done: number, total: number) => void,
): Promise<Move[]> {
  const moves: Move[] = [];
  const proposedNew = new Set<string>();

  for (let i = 0; i < bookmarks.length; i += SORT_BATCH) {
    const batch = bookmarks.slice(i, i + SORT_BATCH);
    onProgress?.(i, bookmarks.length);

    const lines = batch
      .map((b) => `${b.id}: ${JSON.stringify(clip(b.title || hostname(b.url), 140))} | ${clip(b.url, 160)} | in: ${b.path}`)
      .join('\n');

    const prompt = `You organize a user's browser bookmarks. For each bookmark below, decide whether a different folder fits it clearly better than its current one.

Existing folders (id: path):
${folderList(ctx.index)}
${proposedNew.size ? `\nNew folders already proposed in this session (reuse these names if they fit): ${[...proposedNew].join(', ')}\n` : ''}
Bookmarks (id: title | url | current folder):
${lines}

${rules(ctx)}
- Only include bookmarks that should move. Leave out any bookmark that is already in a good folder.`;

    const raw = await generateJSON<{ moves?: (RawTarget & { bookmarkId?: string })[] }>({
      apiKey: ctx.settings.apiKey,
      model: ctx.settings.geminiModel,
      prompt,
      signal: ctx.signal,
      schema: {
        type: 'OBJECT',
        properties: {
          moves: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { bookmarkId: { type: 'STRING' }, ...TARGET_FIELDS },
              required: ['bookmarkId', 'reason'],
            },
          },
        },
        required: ['moves'],
      },
    });

    const batchIds = new Set(batch.map((b) => b.id));
    for (const item of raw.moves ?? []) {
      const id = String(item.bookmarkId ?? '');
      const bookmark = ctx.index.bookmarkById.get(id);
      if (!bookmark || !batchIds.has(id) || moves.some((m) => m.bookmarkId === id)) continue;
      const target = toTarget(item, ctx.index);
      if (!target) continue;
      if (target.type === 'existing' && target.folderId === bookmark.parentId) continue;
      if (target.type === 'new') proposedNew.add(target.name);
      moves.push({ bookmarkId: id, target, reason: item.reason?.trim() || '' });
    }
  }

  onProgress?.(bookmarks.length, bookmarks.length);
  return moves;
}

// ── Semantic search ──────────────────────────────────────────────────────────

const MAX_SEARCH_BOOKMARKS = 2500;

export async function searchWithAI(ctx: Ctx, query: string): Promise<Bookmark[]> {
  // Newest first: if the library is huge, recent bookmarks are the likelier target.
  const pool = [...ctx.index.bookmarks].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, MAX_SEARCH_BOOKMARKS);
  const lines = pool.map((b) => `${b.id}: ${clip(b.title, 120)} | ${clip(b.url, 120)} | ${b.path}`).join('\n');

  const prompt = `You help a user find bookmarks. Their query: ${JSON.stringify(clip(query, 300))}

Bookmarks (id: title | url | folder):
${lines}

Return the IDs of up to 20 bookmarks that match the query, most relevant first. Consider topic, meaning and synonyms, not just exact words. Return an empty list if nothing is relevant.`;

  const raw = await generateJSON<{ ids?: string[] }>({
    apiKey: ctx.settings.apiKey,
    model: ctx.settings.geminiModel,
    prompt,
    signal: ctx.signal,
    maxOutputTokens: 1024,
    schema: { type: 'OBJECT', properties: { ids: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['ids'] },
  });

  const seen = new Set<string>();
  return (raw.ids ?? [])
    .map(String)
    .filter((id) => !seen.has(id) && seen.add(id))
    .map((id) => ctx.index.bookmarkById.get(id))
    .filter((b): b is Bookmark => !!b);
}

// ── Duplicate resolution ─────────────────────────────────────────────────────

export interface DuplicateDecision {
  keepId: string;
  removeIds: string[];
  reason: string;
}

export async function resolveDuplicates(ctx: Ctx, items: Bookmark[]): Promise<DuplicateDecision> {
  const lines = items
    .map((b) => `${b.id}: ${JSON.stringify(clip(b.title, 160))} | ${clip(b.url, 300)} | in: ${b.path} | added: ${new Date(b.dateAdded).toISOString().slice(0, 10)}`)
    .join('\n');

  const prompt = `These bookmarks look like duplicates or near-duplicates of each other:
${lines}

Decide which single bookmark to keep (best title, most sensible folder, most canonical URL) and which to remove. Only remove bookmarks that are true duplicates of the kept one; if a bookmark points to genuinely different content, leave it out of removeIds. "reason" is one short sentence that refers to bookmarks and folders by name, never by ID.`;

  const raw = await generateJSON<{ keepId?: string; removeIds?: string[]; reason?: string }>({
    apiKey: ctx.settings.apiKey,
    model: ctx.settings.geminiModel,
    prompt,
    signal: ctx.signal,
    maxOutputTokens: 1024,
    schema: {
      type: 'OBJECT',
      properties: {
        keepId: { type: 'STRING' },
        removeIds: { type: 'ARRAY', items: { type: 'STRING' } },
        reason: { type: 'STRING' },
      },
      required: ['keepId', 'removeIds', 'reason'],
    },
  });

  const ids = new Set(items.map((b) => b.id));
  const keepId = String(raw.keepId ?? '');
  if (!ids.has(keepId)) throw new Error('The AI response referenced an unknown bookmark. Please try again.');
  const removeIds = (raw.removeIds ?? []).map(String).filter((id) => ids.has(id) && id !== keepId);
  return { keepId, removeIds: [...new Set(removeIds)], reason: raw.reason?.trim() || '' };
}
