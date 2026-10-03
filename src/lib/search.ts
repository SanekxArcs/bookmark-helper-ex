interface Searchable {
  title: string;
  url: string;
  path?: string;
  dateAdded?: number;
}

/**
 * Ranked local search. Every word of the query must appear in the title,
 * URL or folder path; title matches rank above URL and folder matches.
 */
export function searchLocal<T extends Searchable>(query: string, items: T[], limit = 50): T[] {
  const terms = queryTerms(query).map((term) => ({ term, wordStart: new RegExp(`\\b${escapeRegExp(term)}`) }));
  if (!terms.length) return [];

  const scored: { b: T; score: number }[] = [];
  for (const b of items) {
    const title = b.title.toLowerCase();
    const url = b.url.toLowerCase();
    const path = (b.path ?? '').toLowerCase();
    let score = 0;
    let matchedAll = true;

    for (const { term, wordStart } of terms) {
      if (title.startsWith(term)) score += 12;
      else if (wordStart.test(title)) score += 9;
      else if (title.includes(term)) score += 6;
      else if (url.includes(term)) score += 4;
      else if (path.includes(term)) score += 2;
      else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) scored.push({ b, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || (b.b.dateAdded ?? 0) - (a.b.dateAdded ?? 0))
    .slice(0, limit)
    .map((s) => s.b);
}

export function queryTerms(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Splits text into plain and matched parts for highlighting. */
export function highlightParts(text: string, terms: string[]): { text: string; match: boolean }[] {
  if (!terms.length || !text) return [{ text, match: false }];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, match: terms.includes(part.toLowerCase()) }));
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
