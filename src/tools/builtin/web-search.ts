import { search, SafeSearchType } from 'duck-duck-scrape';
import got from 'got';
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '../types.js';

type SearchResultItem = {
  rank: number;
  title: string;
  url: string;
  description: string;
  hostname: string;
  publishedAt?: string;
};

// Rate limiting: DDG bot detection triggers on bursts.
// Enforce at least 1500ms between searches within a session.
let lastSearchTime = 0;
const MIN_SEARCH_INTERVAL_MS = 1500;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; gemma-cli/1.0; +local)',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSearchTime;
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_SEARCH_INTERVAL_MS - elapsed));
  }
  lastSearchTime = Date.now();
}

function isNewsQuery(query: string): boolean {
  return /(latest|news|headline|breaking|world\s+news|top\s+stories)/i.test(query);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractXmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const match = block.match(re);
  return match?.[1]?.trim() ?? '';
}

function normalizeResults(items: Array<Omit<SearchResultItem, 'rank'>>): SearchResultItem[] {
  return items
    .filter(item => item.url)
    .slice(0, 25)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

async function searchGoogleNewsRss(query: string, maxResults: number): Promise<SearchResultItem[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await got(rssUrl, { headers: DEFAULT_HEADERS, timeout: { request: 12000 } }).text();

  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const items = itemBlocks.map((block) => {
    const title = stripHtml(extractXmlTag(block, 'title'));
    const url = extractXmlTag(block, 'link');
    const description = stripHtml(extractXmlTag(block, 'description'));
    const publishedAt = extractXmlTag(block, 'pubDate');

    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = '';
    }

    return {
      title,
      url,
      description,
      hostname,
      publishedAt: publishedAt || undefined,
    };
  });

  return normalizeResults(items).slice(0, maxResults);
}

async function searchBingHtml(query: string, maxResults: number): Promise<SearchResultItem[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const html = await got(url, { headers: DEFAULT_HEADERS, timeout: { request: 12000 } }).text();

  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const items: Array<Omit<SearchResultItem, 'rank'>> = [];

  for (const block of blocks) {
    const linkMatch = block.match(/<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    if (!linkMatch) continue;

    const snippetMatch = block.match(/<p>([\s\S]*?)<\/p>/i);
    const rawUrl = linkMatch[1];
    const title = stripHtml(linkMatch[2]);
    const description = stripHtml(snippetMatch?.[1] ?? '');

    let hostname = '';
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {
      hostname = '';
    }

    items.push({ title, url: rawUrl, description, hostname });
  }

  return normalizeResults(items).slice(0, maxResults);
}

async function fallbackSearch(query: string, maxResults: number): Promise<{ provider: string; results: SearchResultItem[] }> {
  if (isNewsQuery(query)) {
    try {
      const newsResults = await searchGoogleNewsRss(query, maxResults);
      if (newsResults.length > 0) {
        return { provider: 'Google News RSS fallback', results: newsResults };
      }
    } catch {
      // Continue to generic fallback.
    }
  }

  const bingResults = await searchBingHtml(query, maxResults);
  return { provider: 'Bing HTML fallback', results: bingResults };
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
    let ddgError: string | null = null;
    try {
      rawResults = await search(query, {
        safeSearch: safeSearch ? SafeSearchType.STRICT : SafeSearchType.OFF,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ddgError = msg;
    }

    if (rawResults && !rawResults.noResults && rawResults.results?.length) {
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
    }

    try {
      const fallback = await fallbackSearch(query, maxResults);
      if (fallback.results.length > 0) {
        return {
          query,
          provider: fallback.provider,
          results: fallback.results,
          count: fallback.results.length,
          total: fallback.results.length,
          note: ddgError ? `Primary provider unavailable: ${ddgError}` : undefined,
          tip: 'Use web-fetch on any URL to read full page content.',
        };
      }
    } catch (fallbackErr: unknown) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      if (ddgError) {
        return {
          error: `Search failed on all providers. DDG: ${ddgError}. Fallback: ${msg}`,
        };
      }

      return { error: `Search failed: ${msg}` };
    }

    return {
      query,
      results: [],
      count: 0,
      note: ddgError
        ? `No results. Primary provider error: ${ddgError}`
        : 'No results found. Try broader search terms.',
    };
  },
};