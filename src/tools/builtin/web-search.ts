import { search, SafeSearchType } from 'duck-duck-scrape';
import got from 'got';
import { createRequire } from 'module';
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

type TavilyResultItem = {
  title?: string;
  url?: string;
  content?: string;
};

type TavilySearchResponse = {
  results?: TavilyResultItem[];
};

// Rate limiting: DDG bot detection triggers on bursts.
// Enforce at least 1500ms between searches within a session.
let lastSearchTime = 0;
const MIN_SEARCH_INTERVAL_MS = 1500;
const REQUEST_TIMEOUT_MS = 12000;
const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; gemma-cli/1.0; +local)',
  'Accept-Language': 'en-US,en;q=0.9',
};

const require = createRequire(import.meta.url);
let googleNewsDecoder: any;
try {
  const { GoogleDecoder } = require('google-news-url-decoder');
  googleNewsDecoder = new GoogleDecoder();
} catch {
  googleNewsDecoder = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSearchTime;
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_SEARCH_INTERVAL_MS - elapsed));
  }
  lastSearchTime = Date.now();
}

function isNewsQuery(query: string): boolean {
  return /(latest|news|headline|breaking|world\s+news|top\s+stories|trend|trends|war|conflict|negotiation|talks|ceasefire|sanction|diplomacy|election|geopolitics?)/i.test(query);
}

function normalizeInputQuery(query: string): string {
  const cleaned = query
    .trim()
    .replace(/^(ok|okay|please|can you|could you|would you)\s+/i, '')
    .replace(/^(search\s+the\s+web(?:\s+for)?|search\s+web(?:\s+for)?|web\s+search(?:\s+for)?|look\s+up|find\s+online)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length >= 2 ? cleaned : query.trim();
}

function simplifyQuery(query: string): string {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'between', 'for', 'from', 'had',
    'has', 'have', 'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'related',
    'the', 'them', 'to', 'was', 'what', 'when', 'where', 'who', 'why', 'with',
  ]);

  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(term => !stopWords.has(term));

  const compact = terms.slice(0, 10).join(' ').trim();
  return compact.length >= 3 ? compact : query.trim();
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

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getTavilyApiKey(): string | undefined {
  const value = process.env.TAVILY_API_KEY ?? process.env.TAVILY_SEARCH_API_KEY;
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

async function searchTavily(
  query: string,
  maxResults: number,
): Promise<{ results: SearchResultItem[]; error?: string }> {
  const apiKey = getTavilyApiKey();
  if (!apiKey) {
    return { results: [] };
  }

  try {
    const response = await got.post(TAVILY_SEARCH_URL, {
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/json',
      },
      timeout: { request: REQUEST_TIMEOUT_MS },
      json: {
        api_key: apiKey,
        query,
        max_results: Math.max(1, Math.min(maxResults, 25)),
        search_depth: 'advanced',
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        topic: isNewsQuery(query) ? 'news' : 'general',
      },
    }).json<TavilySearchResponse>();

    const rawItems = Array.isArray(response.results) ? response.results : [];

    const results = normalizeResults(rawItems.map((item) => {
      const url = typeof item.url === 'string' ? item.url : '';
      const title = typeof item.title === 'string' && item.title.trim().length > 0
        ? item.title.trim()
        : (url || 'Untitled result');
      const description = typeof item.content === 'string' ? item.content : '';

      return {
        title,
        url,
        description,
        hostname: getHostname(url),
      };
    })).slice(0, maxResults);

    return { results };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { results: [], error: msg };
  }
}

function isGoogleNewsArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'news.google.com') return false;
    return /\/(rss\/)?(articles|read)\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function decodeGoogleNewsUrls(items: SearchResultItem[]): Promise<SearchResultItem[]> {
  if (!googleNewsDecoder || items.length === 0) return items;

  const decodeTargets = items
    .map((item, index) => ({ index, url: item.url }))
    .filter(target => isGoogleNewsArticleUrl(target.url))
    .slice(0, 8);

  if (decodeTargets.length === 0) return items;

  for (const target of decodeTargets) {
    try {
      const decoded = await googleNewsDecoder.decode(target.url);
      if (!decoded || !decoded.status || typeof decoded.decoded_url !== 'string') continue;
      if (!/^https?:\/\//i.test(decoded.decoded_url)) continue;

      items[target.index] = {
        ...items[target.index],
        url: decoded.decoded_url,
        hostname: getHostname(decoded.decoded_url),
      };
    } catch {
      // Keep original URL if decode fails.
    }
  }

  return items;
}

function normalizeResults(items: Array<Omit<SearchResultItem, 'rank'>>): SearchResultItem[] {
  return items
    .filter(item => item.url)
    .slice(0, 25)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function parseRssResults(xml: string, maxResults: number): SearchResultItem[] {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const items: Array<Omit<SearchResultItem, 'rank'>> = itemBlocks.map((block) => {
    const title = stripHtml(extractXmlTag(block, 'title'));
    const url = decodeHtmlEntities(extractXmlTag(block, 'link'));
    const description = stripHtml(extractXmlTag(block, 'description'));
    const publishedAt = extractXmlTag(block, 'pubDate');

    return {
      title,
      url,
      description,
      hostname: getHostname(url),
      publishedAt: publishedAt || undefined,
    };
  });

  return normalizeResults(items).slice(0, maxResults);
}

async function searchGoogleNewsRss(query: string, maxResults: number): Promise<SearchResultItem[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await got(rssUrl, { headers: DEFAULT_HEADERS, timeout: { request: REQUEST_TIMEOUT_MS } }).text();
  const parsed = parseRssResults(xml, maxResults);
  return decodeGoogleNewsUrls(parsed);
}

async function searchBingRss(query: string, maxResults: number): Promise<SearchResultItem[]> {
  const rssUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const xml = await got(rssUrl, { headers: DEFAULT_HEADERS, timeout: { request: REQUEST_TIMEOUT_MS } }).text();
  return parseRssResults(xml, maxResults);
}

function buildDirectSearchFallback(query: string, maxResults: number): SearchResultItem[] {
  const encoded = encodeURIComponent(query);
  const items: Array<Omit<SearchResultItem, 'rank'>> = [
    {
      title: `Open Bing search for: ${query}`,
      url: `https://www.bing.com/search?q=${encoded}`,
      description: 'Direct search URL fallback when live providers cannot be parsed.',
      hostname: 'www.bing.com',
    },
    {
      title: `Open Google search for: ${query}`,
      url: `https://www.google.com/search?q=${encoded}`,
      description: 'Alternative direct search URL.',
      hostname: 'www.google.com',
    },
    {
      title: `Open Google News search for: ${query}`,
      url: `https://news.google.com/search?q=${encoded}`,
      description: 'News-focused fallback for current events.',
      hostname: 'news.google.com',
    },
  ];

  return normalizeResults(items).slice(0, Math.max(1, Math.min(maxResults, 3)));
}

async function searchDuckDuckGoWithRetry(query: string, safeSearch: boolean, maxResults: number): Promise<{ results: SearchResultItem[]; error?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const rawResults = await search(query, {
        safeSearch: safeSearch ? SafeSearchType.STRICT : SafeSearchType.OFF,
      });

      if (!rawResults.noResults && rawResults.results?.length) {
        const results = rawResults.results.slice(0, maxResults).map((r, i) => ({
          rank: i + 1,
          title: r.title,
          url: r.url,
          description: r.description ?? '',
          hostname: getHostname(r.url),
        }));

        return { results };
      }

      return { results: [], error: 'No results from DuckDuckGo.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      const retryable = /(VQD|rate|anomaly|too quickly)/i.test(msg);
      if (!retryable || attempt === 3) break;
      await sleep(500 * attempt + Math.floor(Math.random() * 250));
    }
  }

  return { results: [], error: lastError ?? 'DuckDuckGo request failed.' };
}

async function fallbackSearch(
  query: string,
  maxResults: number
): Promise<{ provider: string; results: SearchResultItem[]; queryUsed: string; errors: string[] }> {
  const errors: string[] = [];
  const simplified = simplifyQuery(query);
  const queries = Array.from(new Set([query, simplified]));

  const providers = isNewsQuery(query)
    ? [
        { name: 'Google News RSS fallback', run: searchGoogleNewsRss },
        { name: 'Bing RSS fallback', run: searchBingRss },
      ]
    : [
        { name: 'Bing RSS fallback', run: searchBingRss },
        { name: 'Google News RSS fallback', run: searchGoogleNewsRss },
      ];

  for (const q of queries) {
    for (const provider of providers) {
      try {
        const results = await provider.run(q, maxResults);
        if (results.length > 0) {
          return { provider: provider.name, results, queryUsed: q, errors };
        }
        errors.push(`${provider.name}: returned 0 results for query "${q}"`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${provider.name}: ${msg}`);
      }
    }
  }

  return {
    provider: 'Direct search URL fallback',
    results: buildDirectSearchFallback(query, maxResults),
    queryUsed: query,
    errors,
  };
}

export const webSearchTool: ToolDefinition = {
  name: 'web-search',
  displayName: 'Web Search',
  description: `Search the web with resilient provider fallback.
Uses Tavily when TAVILY_API_KEY (or TAVILY_SEARCH_API_KEY) is configured.
Falls back to DuckDuckGo, then RSS providers, then direct search URLs.
Use web-fetch to retrieve the full content of a specific result URL.`,
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
    const normalizedQuery = normalizeInputQuery(query);

    const tavily = await searchTavily(normalizedQuery, maxResults);

    if (tavily.results.length > 0) {
      return {
        query,
        queryUsed: normalizedQuery,
        provider: 'Tavily API',
        results: tavily.results,
        count: tavily.results.length,
        total: tavily.results.length,
        tip: 'Use web-fetch on any URL to read full page content.',
      };
    }

    await enforceRateLimit();

    const ddg = await searchDuckDuckGoWithRetry(normalizedQuery, safeSearch, maxResults);

    if (ddg.results.length > 0) {
      return {
        query,
        queryUsed: normalizedQuery,
        provider: 'DuckDuckGo (free, no API key)',
        results: ddg.results,
        count: ddg.results.length,
        total: ddg.results.length,
        tip: 'Use web-fetch on any URL to read full page content.',
      };
    }

    const fallback = await fallbackSearch(normalizedQuery, maxResults);

    if (fallback.results.length > 0) {
      return {
        query,
        provider: fallback.provider,
        queryUsed: fallback.queryUsed,
        results: fallback.results,
        count: fallback.results.length,
        total: fallback.results.length,
        diagnostics: fallback.provider === 'Direct search URL fallback' && fallback.errors.length > 0
          ? fallback.errors.slice(0, 4)
          : undefined,
        tip: 'Use web-fetch on any URL to read full page content.',
      };
    }

    // Never return a hard failure for search: provide usable direct links.
    return {
      query,
      provider: 'Direct search URL fallback',
      queryUsed: normalizedQuery,
      results: buildDirectSearchFallback(normalizedQuery, maxResults),
      count: Math.max(1, Math.min(maxResults, 3)),
      total: Math.max(1, Math.min(maxResults, 3)),
      note: ddg.error || tavily.error
        ? `Returned fallback links because providers were unavailable. Primary provider error: ${ddg.error ?? tavily.error}`
        : 'Returned fallback links because providers returned no parseable results.',
      tip: 'Use web-fetch on any URL to read full page content.',
    };
  },
};