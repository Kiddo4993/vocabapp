// Inverted index over term+definition, plus a prefix trie over terms
// (§2). Built once in the worker, persisted in meta, rebuilt only when the
// set of contentHashes changes (src/worker/searchWorker.ts owns that
// caching decision — this module is just the pure data structure + query
// logic, budgeted at under 50ms for 25k words, §11).

export interface Indexable {
  id: string;
  term: string;
  definition: string;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  /** Word ids whose term has this node's path as a prefix — stored at
   * every node (not just leaves) so a prefix lookup is O(prefix length),
   * no subtree walk needed. */
  ids: Set<string>;
}

export interface SearchIndex {
  /** token -> word ids whose term or definition contains that token. */
  postings: Map<string, Set<string>>;
  trie: TrieNode;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function newTrieNode(): TrieNode {
  return { children: new Map(), ids: new Set() };
}

export function buildSearchIndex(words: Indexable[]): SearchIndex {
  const postings = new Map<string, Set<string>>();
  const trie = newTrieNode();

  for (const w of words) {
    const tokens = new Set([...tokenize(w.term), ...tokenize(w.definition)]);
    for (const t of tokens) {
      let set = postings.get(t);
      if (!set) {
        set = new Set();
        postings.set(t, set);
      }
      set.add(w.id);
    }

    let node = trie;
    node.ids.add(w.id);
    for (const ch of w.term.toLowerCase()) {
      let next = node.children.get(ch);
      if (!next) {
        next = newTrieNode();
        node.children.set(ch, next);
      }
      next.ids.add(w.id);
      node = next;
    }
  }

  return { postings, trie };
}

/** Prefix match against the term trie (fast, O(query length)) unioned with
 * token-AND matches over term+definition, prefix matches ranked first.
 *
 * `limit` is respected while building the result, not just applied as a
 * final `.slice()` — a common short prefix (or a common word token) can
 * match a large fraction of a 25k-word corpus, and spreading the full
 * match set into an array before slicing pays O(matches) cost even when
 * the caller only wanted the first 50. */
export function searchIndexQuery(index: SearchIndex, queryText: string, limit = 50): string[] {
  const q = queryText.trim().toLowerCase();
  if (!q) return [];

  let node: TrieNode | undefined = index.trie;
  for (const ch of q) {
    node = node?.children.get(ch);
    if (!node) break;
  }
  const prefixMatches: Set<string> = node ? node.ids : new Set();

  const tokens = tokenize(q);
  let tokenMatches: Set<string> | undefined;
  for (const t of tokens) {
    const set = index.postings.get(t) ?? new Set<string>();
    if (tokenMatches === undefined) {
      // First (and, for the common single-token case, only) token — the
      // posting list can be used directly, no copy needed.
      tokenMatches = set;
    } else {
      const next = new Set<string>();
      for (const id of tokenMatches) if (set.has(id)) next.add(id);
      tokenMatches = next;
    }
  }

  const result: string[] = [];
  for (const id of prefixMatches) {
    if (result.length >= limit) break;
    result.push(id);
  }
  if (tokenMatches) {
    for (const id of tokenMatches) {
      if (result.length >= limit) break;
      if (!prefixMatches.has(id)) result.push(id);
    }
  }
  return result;
}

export function searchIndexTermCount(index: SearchIndex): number {
  let count = 0;
  const walk = (node: TrieNode) => {
    if (node.children.size === 0) count++;
    for (const child of node.children.values()) walk(child);
  };
  walk(index.trie);
  return count;
}
