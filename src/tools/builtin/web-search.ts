// REPLACE any previous web-search.ts stub entirely with this implementation.
// No API keys. No configuration. Works out of the box on first install.

import { search, SafeSearchType } from 'duck-duck-scrape';
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '../types.js';

// Rate limiting: DDG bot detection triggers on bursts.
// Enforce at least 1500ms between searches within a session.
let lastSearchTime = 0;
const MIN_SEARCH_INTERVAL_MS = 1500;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSearchTime;
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_SEARCH_INTERVAL_MS - elapsed));
  }
  lastSearchTime = Date.now();
}

export const webSearchTool: ToolDefinition = {
  name: 'web-search',
  displayName: 'Web Search',
  description: `Search the web using DuckDuckGo. Completely free, no API key required.
Returns organic search results: title, URL, and description snippet.
Use web-fetch to retrieve the full content of a specific result URL.
Good for: finding documentation, code examples, recent news, package info.`,
  category: 'web',
  riskLevel: 'low',

  parameters: z.object({
    query: z.string().min(2).max(500)
      .describe('The search query. Be specific for better results.'),
    maxResults: z.number().int().min(1).max(25).default(10)
      .describe('Number of results to return. Default 10, max 25.'),
    safeSearch: z.boolean().default(true)
      .describe('Enable safe search filtering. Default true.'),
  }),

  async execute(args): Promise<ToolResult> {
    const { query, maxResults, safeSearch } = args;

    await enforceRateLimit();

    let rawResults;
    try {
      rawResults = await search(query, {
        safeSearch: safeSearch ? SafeSearchType.STRICT : SafeSearchType.OFF,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // DDG returns rate-limit errors as "Failed to get VQD" — give a helpful message
      if (msg.includes('VQD') || msg.includes('rate')) {
        return {
          error: 'DuckDuckGo rate limit hit. Wait 10 seconds before searching again.',
          hint: 'Tip: combine multiple questions into one search query to reduce requests.',
        };
      }
      return { error: `Search failed: ${msg}` };
    }

    if (rawResults.noResults || !rawResults.results?.length) {
      return {
        results: [],
        count: 0,
        note: 'No results found. Try broader search terms.',
      };
    }

    const results = rawResults.results.slice(0, maxResults).map((r, i) => ({
      rank: i + 1,
      title: r.title,
      url: r.url,
      description: r.description ?? '',
      hostname: new URL(r.url).hostname,
    }));

    return {
      query,
      provider: 'DuckDuckGo (free, no API key)',
      results,
      count: results.length,
      total: rawResults.results.length,
      tip: 'Use web-fetch on any URL to read full page content.',
    };
  },
};