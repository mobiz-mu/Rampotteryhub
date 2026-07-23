// src/lib/searchRank.ts
//
// Shared relevance ranking for customer/product search, used by the Invoice,
// Quotation, and Credit Note "Create" pages. The customer ranking is
// extracted from InvoiceCreate.tsx's proven `customerSearchScore()` (exact ->
// starts-with -> contains, name before code before phone/address); the
// product ranking is a new equivalent for the same priority ordering
// (exact code -> code-starts-with -> name-starts-with -> code/name-contains
// -> description-contains).

export type RankableCustomer = {
  name?: string | null;
  customer_code?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type RankableProduct = {
  item_code?: string | null;
  sku?: string | null;
  name?: string | null;
  description?: string | null;
};

export function compactSearch(v: any): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

/** Numeric zero-pad aliasing so "3" also matches "03"/"003"-style codes. */
export function codeAliases(v: any): string[] {
  const raw = String(v ?? "").trim();
  if (!raw) return [];

  const set = new Set<string>();
  set.add(raw);
  set.add(raw.toUpperCase());
  set.add(raw.replace(/\s+/g, ""));
  set.add(raw.toUpperCase().replace(/\s+/g, ""));

  if (/^\d+$/.test(raw)) {
    const n = String(Number(raw));
    set.add(n);
    set.add(n.padStart(2, "0"));
    set.add(n.padStart(3, "0"));
  }

  return Array.from(set);
}

function wordsOf(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => compactSearch(w))
    .filter(Boolean);
}

/** Relevance score for a customer against a search term — higher is better, 0 = no match. */
export function customerSearchScore(c: RankableCustomer, term: string): number {
  const q = compactSearch(term);
  if (!q) return 0;

  const rawName = String(c.name || "").trim();
  const name = compactSearch(rawName);
  const words = wordsOf(rawName);

  const code = compactSearch(c.customer_code);
  const phone = compactSearch(c.phone);
  const addr = compactSearch(c.address);

  if (name === q) return 3000;
  if (words.some((w) => w === q)) return 2800;
  if (name.startsWith(q)) return 2600;
  if (words.some((w) => w.startsWith(q))) return 2400;

  if (code === q) return 2200;
  if (code.startsWith(q)) return 2000;

  if (phone.startsWith(q)) return 1600;
  if (addr.startsWith(q)) return 1400;

  if (name.includes(q)) return 1200;
  if (code.includes(q)) return 1000;
  if (phone.includes(q)) return 900;
  if (addr.includes(q)) return 800;

  return 0;
}

/** Relevance score for a product against a search term — exact code match wins,
 * then code-starts-with, then name-starts-with, then contains, then description. */
export function productSearchScore(p: RankableProduct, term: string): number {
  const q = compactSearch(term);
  if (!q) return 0;

  const ref = String(p.item_code ?? p.sku ?? "").trim();
  const refAliases = codeAliases(ref).map(compactSearch);
  const sku = compactSearch(p.sku);
  const rawName = String(p.name || "").trim();
  const name = compactSearch(rawName);
  const words = wordsOf(rawName);
  const desc = compactSearch(p.description);

  if (refAliases.includes(q)) return 3000;
  if (sku === q) return 2900;
  if (refAliases.some((x) => x.startsWith(q))) return 2600;
  if (sku.startsWith(q)) return 2500;

  if (name === q) return 2300;
  if (words.some((w) => w === q)) return 2200;
  if (name.startsWith(q)) return 2000;
  if (words.some((w) => w.startsWith(q))) return 1900;

  if (refAliases.some((x) => x.includes(q))) return 1200;
  if (sku.includes(q)) return 1100;
  if (name.includes(q)) return 1000;

  if (desc.includes(q)) return 500;

  return 0;
}

function compareTextAsc(a: any, b: any) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Rank a list by descending relevance score, dropping non-matches, with an
 * alphabetical tiebreak. An empty/blank term returns the list unranked and
 * unfiltered (caller's existing default ordering).
 */
function rankBy<T>(
  list: T[],
  term: string,
  score: (item: T, term: string) => number,
  tiebreakKey: (item: T) => string
): T[] {
  const q = term.trim();
  if (!q) return list;

  return list
    .map((item) => ({ item, s: score(item, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || compareTextAsc(tiebreakKey(a.item), tiebreakKey(b.item)))
    .map((x) => x.item);
}

export function rankCustomers<T extends RankableCustomer>(list: T[], term: string): T[] {
  return rankBy<T>(list, term, (item, t) => customerSearchScore(item, t), (c) => String(c.name || ""));
}

export function rankProducts<T extends RankableProduct>(list: T[], term: string): T[] {
  return rankBy<T>(list, term, (item, t) => productSearchScore(item, t), (p) => String(p.item_code ?? p.sku ?? p.name ?? ""));
}
