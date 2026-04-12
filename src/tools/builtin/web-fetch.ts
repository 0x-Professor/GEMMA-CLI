import got from 'got';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '../types.js';

// Domains where Readability works poorly — use raw text strip instead
const RAW_STRIP_DOMAINS = [
  'github.com',
  'raw.githubusercontent.com',
  'gist.github.com',
  'npmjs.com',
  'pkg.go.dev',
  'docs.rs',
  'crates.io',
  'pypi.org',
];

function isRawDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return RAW_STRIP_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

export const webFetchTool: ToolDefinition = {
  name: 'web-fetch',
  displayName: 'Web Fetch',
  description: `Fetch a URL and return clean, readable text content.
Uses Mozilla's Readability algorithm (same as Firefox Reader Mode) to extract
the main article content, stripping ads, navigation, and boilerplate.
For code repositories and API docs, returns raw text.
Max content returned: 50,000 characters.`,
  category: 'web',
  riskLevel: 'low',

  parameters: z.object({
    url: z.string().url()
      .describe('Full URL to fetch (must include https://)'),
    maxChars: z.number().int().min(500).max(100_000).default(50_000)
      .describe('Max characters to return. Default 50,000.'),
    timeout: z.number().int().min(2000).max(30_000).default(12_000)
      .describe('Request timeout in milliseconds. Default 12,000.'),
  }),

  async execute(args): Promise<ToolResult> {
    const { url, maxChars, timeout } = args;

    // ── Fetch raw HTML ────────────────────────────────────────────────────
    let html: string;
    let finalUrl: string;
    try {
      const response = await got(url, {
        timeout: { request: timeout },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; gemma-cli/1.0; +local)',
          'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        followRedirect: true,
        maxRedirects: 5,
        throwHttpErrors: false,
      });

      if (response.statusCode >= 400) {
        return { error: `HTTP ${response.statusCode}: ${url}` };
      }

      html = response.body;
      finalUrl = response.url ?? url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `Failed to fetch ${url}: ${msg}` };
    }

    const contentType = '';

    // ── JSON response — return as-is ─────────────────────────────────────
    if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      const truncated = html.length > maxChars;
      return {
        url: finalUrl,
        type: 'json',
        content: html.substring(0, maxChars),
        length: Math.min(html.length, maxChars),
        ...(truncated && { note: `Truncated at ${maxChars} chars.` }),
      };
    }

    // ── Plain text ────────────────────────────────────────────────────────
    if (!html.includes('<html') && !html.includes('<body')) {
      const text = html.substring(0, maxChars);
      return { url: finalUrl, type: 'text', content: text, length: text.length };
    }

    // ── HTML: try Readability first, strip for raw domains ────────────────
    let content: string;
    let type: string;
    let title: string | undefined;

    if (isRawDomain(finalUrl)) {
      content = stripHtml(html);
      type = 'stripped-html';
    } else {
      try {
        // linkedom provides a lightweight DOM that Readability can parse
        const { document } = parseHTML(html);
        // Set base URL so Readability can resolve relative links
        (document as any).baseURI = finalUrl;

        const reader = new Readability(document as any, {
          keepClasses: false,
          disableJSONLD: false,
        });
        const article = reader.parse();

        if (article && article.textContent && article.textContent.length > 200) {
          // Readability succeeded
          content = article.textContent
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();
          title = article.title ?? undefined;
          type = 'readability';
        } else {
          // Readability returned nothing useful — fall back to strip
          content = stripHtml(html);
          type = 'stripped-html';
        }
      } catch {
        content = stripHtml(html);
        type = 'stripped-html';
      }
    }

    const truncated = content.length > maxChars;
    return {
      url: finalUrl,
      type,
      ...(title && { title }),
      content: content.substring(0, maxChars),
      length: Math.min(content.length, maxChars),
      originalLength: content.length,
      ...(truncated && {
        note: `Content truncated at ${maxChars} chars. Full page is ${content.length} chars.`,
      }),
    };
  },
};