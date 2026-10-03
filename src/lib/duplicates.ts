import type { Bookmark } from './bookmarks';

export type DuplicateKind = 'exact' | 'similar' | 'site';

export interface DuplicateGroup {
  key: string;
  kind: DuplicateKind;
  label: string;
  items: Bookmark[];
}

const TRACKING_PARAMS = /^(utm_|mc_|_hs|vero_)|^(fbclid|gclid|dclid|msclkid|yclid|igshid|ref|ref_src|si|feature)$/i;

interface Parsed {
  exact: string;
  similar: string;
  host: string;
}

function parse(url: string): Parsed | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return { exact: url, similar: url, host: '' };

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '') || '';
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? '?' + new URLSearchParams(params).toString() : '';
  // http/https, www, trailing slashes, #fragments and tracking params are ignored.
  return { exact: host + path + query, similar: host + path.toLowerCase(), host };
}

/** Groups bookmarks that point to the same (or nearly the same) page. */
export function findDuplicates(bookmarks: Bookmark[], siteThreshold = 5): DuplicateGroup[] {
  const exact = new Map<string, Bookmark[]>();
  const similar = new Map<string, Bookmark[]>();
  const sites = new Map<string, Bookmark[]>();
  const exactKeyOf = new Map<string, string>();

  for (const b of bookmarks) {
    const p = parse(b.url);
    if (!p) continue;
    push(exact, p.exact, b);
    push(similar, p.similar, b);
    if (p.host) push(sites, p.host, b);
    exactKeyOf.set(b.id, p.exact);
  }

  const groups: DuplicateGroup[] = [];
  const inExactGroup = new Set<string>();

  for (const [key, items] of exact) {
    if (items.length < 2) continue;
    groups.push({ key: 'e:' + key, kind: 'exact', label: key, items: byDate(items) });
    items.forEach((b) => inExactGroup.add(b.id));
  }

  for (const [key, items] of similar) {
    // Only interesting when the group spans more than one distinct exact URL.
    const distinct = new Set(items.map((b) => exactKeyOf.get(b.id)));
    if (items.length < 2 || distinct.size < 2) continue;
    groups.push({ key: 's:' + key, kind: 'similar', label: key, items: byDate(items) });
  }

  for (const [host, items] of sites) {
    if (items.length < siteThreshold) continue;
    groups.push({ key: 'h:' + host, kind: 'site', label: host, items: byDate(items) });
  }

  return groups;
}

/** Number of bookmarks that could be removed by keeping one per exact group. */
export function redundantCount(groups: DuplicateGroup[]) {
  return groups.filter((g) => g.kind === 'exact').reduce((sum, g) => sum + g.items.length - 1, 0);
}

function push(map: Map<string, Bookmark[]>, key: string, b: Bookmark) {
  const list = map.get(key);
  if (list) list.push(b);
  else map.set(key, [b]);
}

function byDate(items: Bookmark[]) {
  return [...items].sort((a, b) => a.dateAdded - b.dateAdded);
}
