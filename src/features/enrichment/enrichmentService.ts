// Auto-enrichment (§4/§10.10): for imported words missing simple,
// examples, or synonyms, batch-call the Anthropic API to fill the gaps.
// Entirely optional — src/db/meta.ts's enrichmentEnabled flag defaults to
// off, and nothing here is ever called unless the user explicitly turns
// it on and supplies their own API key. The app is fully usable without
// any of this.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getEnrichmentCache, setEnrichmentCacheEntry, type EnrichmentSuggestion } from '@/db/meta';
import { getWordsBySetPage } from '@/db/words';
import { contentHash } from '@/lib/hash';
import type { Word } from '@/types/domain';

const BATCH_SIZE = 8;
const SCAN_LIMIT = 500;

export interface MissingFields {
  simple: boolean;
  examples: boolean;
  synonyms: boolean;
}

export function missingFields(word: Word): MissingFields {
  return { simple: !word.simple, examples: word.examples.length === 0, synonyms: word.synonyms.length === 0 };
}

export function needsEnrichment(word: Word): boolean {
  const m = missingFields(word);
  return m.simple || m.examples || m.synonyms;
}

export async function findWordsNeedingEnrichment(setId: string): Promise<Word[]> {
  const page = await getWordsBySetPage(setId, { limit: SCAN_LIMIT });
  return page.items.filter(needsEnrichment);
}

const EnrichmentItemSchema = z.object({
  id: z.string(),
  simple: z.string().nullable(),
  examples: z.array(z.string()).nullable(),
  synonyms: z.array(z.string()).nullable(),
});
const EnrichmentBatchSchema = z.object({ words: z.array(EnrichmentItemSchema) });

function describeWordForPrompt(word: Word): string {
  const m = missingFields(word);
  const missing = [m.simple && 'simple', m.examples && 'examples', m.synonyms && 'synonyms'].filter(Boolean);
  return `- id: ${word.id}\n  term: ${word.term}\n  pos: ${word.pos ?? '(none)'}\n  definition: ${word.definition}\n  missing: ${missing.join(', ')}`;
}

async function callBatch(client: Anthropic, words: Word[]): Promise<Map<string, EnrichmentSuggestion>> {
  const prompt = words.map(describeWordForPrompt).join('\n');

  const response = await client.messages.parse({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    system:
      'You fill in ONLY the specifically-requested missing fields for vocabulary study cards. For each word, return a value only for the fields listed as "missing" for that word — set every other field to null, even if you could improve it. `simple` is a short, plain-language gloss under 12 words. `examples` is 1-2 natural example sentences that use the term. `synonyms` is 3-6 close synonyms. Match the tone and register of the existing definition.',
    messages: [{ role: 'user', content: `Fill in the missing fields for these vocabulary words:\n\n${prompt}` }],
    output_config: { format: zodOutputFormat(EnrichmentBatchSchema) },
  });

  const out = new Map<string, EnrichmentSuggestion>();
  const parsed = response.parsed_output;
  if (!parsed) return out;
  for (const item of parsed.words) {
    out.set(item.id, {
      simple: item.simple ?? undefined,
      examples: item.examples ?? undefined,
      synonyms: item.synonyms ?? undefined,
    });
  }
  return out;
}

export interface EnrichmentPlanItem {
  word: Word;
  suggestion: EnrichmentSuggestion;
  fromCache: boolean;
}

/** Builds enrichment suggestions for `words`, calling the API only for
 * words whose contentHash isn't already cached (§4: "Cache by contentHash
 * so re-running is free"). */
export async function planEnrichment(apiKey: string, words: Word[]): Promise<EnrichmentPlanItem[]> {
  const cache = await getEnrichmentCache();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const plan: EnrichmentPlanItem[] = [];
  const toFetch: Word[] = [];

  for (const w of words) {
    const cached = cache[w.contentHash];
    if (cached) plan.push({ word: w, suggestion: cached, fromCache: true });
    else toFetch.push(w);
  }

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const results = await callBatch(client, batch);
    for (const w of batch) {
      const suggestion = results.get(w.id) ?? {};
      await setEnrichmentCacheEntry(w.contentHash, suggestion);
      plan.push({ word: w, suggestion, fromCache: false });
    }
  }

  return plan;
}

/** Applies an approved suggestion to a word — only ever fills a field
 * that was genuinely empty; an already-authored field is never touched
 * (§4: "never silently overwrite an authored entry"). Recomputes
 * contentHash since examples/synonyms feed into it. */
export function applyEnrichmentSuggestion(word: Word, suggestion: EnrichmentSuggestion, origin: string): Word {
  const next: Word = {
    ...word,
    simple: word.simple ? word.simple : (suggestion.simple ?? word.simple),
    examples: word.examples.length > 0 ? word.examples : (suggestion.examples ?? word.examples),
    synonyms: word.synonyms.length > 0 ? word.synonyms : (suggestion.synonyms ?? word.synonyms),
    updatedAt: Date.now(),
    origin,
  };
  next.contentHash = contentHash(next);
  return next;
}
