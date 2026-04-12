import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, Static } from 'ink';
import { TextInput } from '@inkjs/ui';
import Spinner from 'ink-spinner';
import { Banner } from '../components/Banner.js';
import { MessageBubble } from '../components/MessageBubble.js';
import { StatusBar } from '../components/StatusBar.js';
import { SlashMenu } from './SlashMenu.js';
import { SessionMessage } from '../../session/types.js';
import { GemmaEngine } from '../../core/inference.js';
import { loadConfig } from '../../config/settings.js';
import { applyIncrementalSummarization } from '../../core/compaction.js';
import { buildSystemPrompt } from '../../core/system-prompt.js';
import { globalToolRegistry } from '../../tools/registry.js';

type WebSearchResultItem = {
  title?: string;
  url?: string;
  description?: string;
  hostname?: string;
  publishedAt?: string;
};

type WebSearchPayload = {
  query?: string;
  provider?: string;
  results?: WebSearchResultItem[];
  count?: number;
};

type WebFetchPayload = {
  url?: string;
  title?: string;
  content?: string;
  type?: string;
  error?: string;
};

export function ChatView({ onNavigate }: { onNavigate?: (dest: string) => void }) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [showSlash, setShowSlash] = useState(false);
  const [inputKey, setInputKey] = useState(0); // To force reset the uncontrolled TextInput
  const [engine, setEngine] = useState<GemmaEngine | null>(null);
  const [isInferencing, setIsInferencing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const config = loadConfig();

  useEffect(() => {
    const e = new GemmaEngine();
    // In a real app we'd load the specific session's memory and anchor block, but for now we'll mock them
    const sysPrompt = buildSystemPrompt({
      tools: globalToolRegistry.list(),
      allowedDirs: [process.cwd()],
      deniedDirs: ['.git', 'node_modules'],
      approvalMode: config.approvalMode || 'ask',
      sessionMemory: {}, // To be populated from session manager
      anchorBlock: '', // Connect with orchestrator for session resume
    });

    e.loadModel(config.model, sysPrompt).then(() => setEngine(e)).catch(err => {
      setMessages([{ role: 'system', content: `Error loading model: ${err.message}`, timestamp: new Date().toISOString() }]);
    });
    return () => { e.unloadModel(); };
  }, [config.model]);

  useInput((keyInput, key) => {
    if (key.ctrl && keyInput === 'c') {
      exit();
    }
  });

  const clearInput = () => {
    setInput('');
    setShowSlash(false);
    setInputKey(k => k + 1);
  };

  const nowIso = (): string => new Date().toISOString();

  const parseToolCallFromText = (text: string): { name: string; arguments: unknown } | null => {
    const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
    if (!match) return null;

    const rawPayload = match[1]
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsePayload = (payload: string): { name: string; arguments: unknown } | null => {
      try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed !== 'object') return null;
        const maybeName = (parsed as any).name;
        if (typeof maybeName !== 'string' || maybeName.length === 0) return null;
        return {
          name: maybeName,
          arguments: (parsed as any).arguments ?? {},
        };
      } catch {
        return null;
      }
    };

    const direct = parsePayload(rawPayload);
    if (direct) return direct;

    const objectMatch = rawPayload.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    return parsePayload(objectMatch[0]);
  };

  const extractWebSearchQuery = (userText: string): string => {
    const lowered = userText.toLowerCase();
    const prefixes = [
      'search the web for',
      'search web for',
      'web search for',
      'look up',
      'find online',
      'get latest news on',
      'latest news on',
    ];

    for (const prefix of prefixes) {
      const idx = lowered.indexOf(prefix);
      if (idx >= 0) {
        const after = userText.slice(idx + prefix.length).trim();
        if (after.length > 0) return after;
      }
    }

    if (lowered.includes('latest news')) return 'latest news';
    return userText.trim();
  };

  const shouldForceWebSearch = (userText: string): boolean => {
    return /(search\s+the\s+web|web\s+search|latest\s+news|look\s+up|find\s+online|\bheadlines?\b|\bnews\b|\btrends?\b|\bresearch\b|\bcurrent\b|\btoday\b|\bonline\b|\binternet\b|\blatest\b|\brecent\b)/i.test(userText);
  };

  const looksLikeToolRefusal = (assistantText: string): boolean => {
    return /(cannot access the internet|can't access the internet|do not have access to the internet|limitations prevent me|i am programmed to be a safe and helpful ai assistant)/i.test(assistantText);
  };

  const executeToolByName = async (toolName: string, rawArgs: unknown): Promise<{ normalizedArgs: unknown; resultText: string }> => {
    const tool = globalToolRegistry.lookup(toolName);
    if (!tool) {
      return {
        normalizedArgs: rawArgs,
        resultText: `Error: Tool ${toolName} not found`,
      };
    }

    try {
      const normalizedArgs = tool.parameters ? tool.parameters.parse(rawArgs ?? {}) : rawArgs;
      const toolResultObj = await tool.execute(normalizedArgs as any);

      const resultText =
        (typeof toolResultObj.result === 'string' && toolResultObj.result) ||
        (typeof toolResultObj.stdout === 'string' && toolResultObj.stdout) ||
        (typeof toolResultObj.error === 'string' && toolResultObj.error) ||
        JSON.stringify(toolResultObj, null, 2);

      return { normalizedArgs, resultText };
    } catch (err: any) {
      return {
        normalizedArgs: rawArgs,
        resultText: `Execution failed: ${err?.message ?? String(err)}`,
      };
    }
  };

  const tryParseJson = <T,>(text: string): T | null => {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  };

  type WebIntent = 'news' | 'tech' | 'coding' | 'shopping' | 'general';

  const buildSnippetFromContent = (content: string, maxChars: number = 340): string => {
    const normalized = content
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalized) return 'No readable content extracted.';

    const boilerplate = /(skip to main content|cookie|privacy policy|terms of use|all rights reserved|subscribe|sign in|log in|menu|navigation|javascript|enable cookies|advertisement|share this|newsletter|microsoft on the issues|official microsoft blog|breaking news alerts|site map|copyright|continue reading)/i;
    const withoutBoilerplate = normalized.replace(boilerplate, ' ').replace(/\s+/g, ' ').trim();
    const paragraphs = normalized
      .split(/\n{2,}/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => p.length >= 80 && !boilerplate.test(p));

    const sourceText = (paragraphs.length > 0 ? paragraphs : [withoutBoilerplate]).slice(0, 4).join(' ');
    const sentences = sourceText
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 45 && s.length <= 320 && !boilerplate.test(s));

    const picked = (sentences.length > 0 ? sentences.slice(0, 2).join(' ') : sourceText).trim();
    if (picked.length <= maxChars) return picked;
    return `${picked.slice(0, maxChars).trim()}...`;
  };

  const formatRelativeDate = (publishedAt?: string): string => {
    if (!publishedAt) return '';

    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return publishedAt;

    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 14) return `${diffDays} days ago`;
    return date.toISOString().slice(0, 10);
  };

  const normalizeWebIntentQuery = (query: string): string => {
    return query
      .trim()
      .replace(/^(ok|okay|please|can you|could you|would you)\s+/i, '')
      .replace(/^(search\s+the\s+web(?:\s+for)?|search\s+web(?:\s+for)?|web\s+search(?:\s+for)?|look\s+up|find\s+online|research\s+on\s+the\s+web)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const hostFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  };

  const detectWebIntent = (query: string): WebIntent => {
    const lowered = query.toLowerCase();
    if (/(war|conflict|negotiation|ceasefire|sanction|election|diploma|breaking|headline|news|today|latest)/i.test(lowered)) return 'news';
    if (/(code|coding|programming|api|sdk|library|framework|error|bug|fix|install|setup|tutorial|documentation)/i.test(lowered)) return 'coding';
    if (/(price|pricing|review|compare|comparison|best|buy|cheap|vs\b|top\s+10)/i.test(lowered)) return 'shopping';
    if (/(ai|technology|tech|startup|software|hardware|machine learning|cloud|cybersecurity)/i.test(lowered)) return 'tech';
    return 'general';
  };

  const buildAspectSearchPlan = (baseQuery: string): Array<{ aspect: string; query: string }> => {
    const intent = detectWebIntent(baseQuery);

    if (intent === 'news') {
      return [
        { aspect: 'latest developments', query: `${baseQuery} latest developments` },
        { aspect: 'background and context', query: `${baseQuery} context explained background` },
        { aspect: 'official statements', query: `${baseQuery} official statements government response` },
        { aspect: 'expert analysis', query: `${baseQuery} expert analysis implications` },
      ];
    }

    if (intent === 'tech') {
      return [
        { aspect: 'latest updates', query: `${baseQuery} latest updates` },
        { aspect: 'industry and market', query: `${baseQuery} market adoption enterprise impact` },
        { aspect: 'research and product launches', query: `${baseQuery} research breakthroughs product launches` },
        { aspect: 'policy and regulation', query: `${baseQuery} policy regulation compliance` },
      ];
    }

    if (intent === 'coding') {
      return [
        { aspect: 'official documentation', query: `${baseQuery} official documentation` },
        { aspect: 'practical implementation', query: `${baseQuery} tutorial guide examples` },
        { aspect: 'troubleshooting', query: `${baseQuery} common errors fixes` },
        { aspect: 'best practices', query: `${baseQuery} best practices` },
      ];
    }

    if (intent === 'shopping') {
      return [
        { aspect: 'top options', query: `${baseQuery} best options` },
        { aspect: 'pricing', query: `${baseQuery} pricing current price` },
        { aspect: 'reviews', query: `${baseQuery} reviews pros cons` },
        { aspect: 'comparison', query: `${baseQuery} comparison alternatives` },
      ];
    }

    return [
      { aspect: 'latest updates', query: `${baseQuery} latest updates` },
      { aspect: 'core explanation', query: `${baseQuery} explained overview` },
      { aspect: 'expert perspectives', query: `${baseQuery} expert analysis` },
      { aspect: 'practical impact', query: `${baseQuery} practical implications` },
    ];
  };

  const buildSourceCheckDomains = (baseQuery: string): string[] => {
    const intent = detectWebIntent(baseQuery);
    if (intent === 'news') return ['reuters.com', 'apnews.com', 'bbc.com', 'aljazeera.com'];
    if (intent === 'tech') return ['theverge.com', 'techcrunch.com', 'wired.com', 'arstechnica.com'];
    if (intent === 'coding') return ['stackoverflow.com', 'github.com', 'developer.mozilla.org', 'docs.python.org'];
    if (intent === 'shopping') return ['forbes.com', 'cnet.com', 'tomsguide.com', 'pcmag.com'];
    return ['wikipedia.org', 'britannica.com', 'reuters.com', 'bbc.com'];
  };

  const collectNewsItems = (searchRuns: Array<{ aspect: string; query: string; provider: string; results: WebSearchResultItem[] }>) => {
    const rankedRuns = [...searchRuns].sort((a, b) => {
      const aScore = /latest|developments|updates/i.test(a.aspect) ? 0 : 1;
      const bScore = /latest|developments|updates/i.test(b.aspect) ? 0 : 1;
      return aScore - bScore;
    });

    const seen = new Set<string>();
    const items: Array<{ title: string; source: string; when: string }> = [];

    for (const run of rankedRuns) {
      for (const result of run.results) {
        const title = (result.title || '').trim();
        if (!title) continue;
        const sourceHost = (result.hostname || hostFromUrl(result.url || '') || 'unknown source').replace(/^www\./i, '');
        const key = `${title}|${sourceHost}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          title,
          source: sourceHost,
          when: formatRelativeDate(result.publishedAt),
        });

        if (items.length >= 6) return items;
      }
    }

    return items;
  };

  const collectAiTrendItems = (docs: Array<{ aspect: string; title: string; url: string; host: string; snippet: string; fetchType: string }>) => {
    const catalog: Array<{ label: string; patterns: RegExp[] }> = [
      { label: 'Agentic AI and autonomous workflows', patterns: [/agentic|autonomous\s+ai|ai\s+agents?|multi-agent/i] },
      { label: 'Multimodal AI across text, image, audio, and video', patterns: [/multimodal|text\s*\+\s*image|video\s+understanding|audio\s+models?/i] },
      { label: 'AI becoming core enterprise infrastructure', patterns: [/enterprise|infrastructure|mission-critical|core\s+system|roi/i] },
      { label: 'AI plus automation for end-to-end workflows', patterns: [/workflow\s+automation|process\s+automation|orchestration|automated\s+workflow/i] },
      { label: 'Generative AI scaling into production use', patterns: [/generative\s+ai|code\s+generation|copilot|content\s+generation/i] },
      { label: 'Governance, safety, and regulation pressure', patterns: [/governance|regulation|compliance|safety|ethic|risk/i] },
      { label: 'Sovereign and local AI model strategies', patterns: [/sovereign|local\s+models?|on-prem|domestic\s+models?/i] },
      { label: 'Physical AI and robotics in real-world systems', patterns: [/robotics|physical\s+ai|autonomous\s+machines?/i] },
      { label: 'Edge and on-device AI acceleration', patterns: [/edge\s+ai|on-device|device\s+ai|iot/i] },
    ];

    const used = new Set<string>();
    const trends: Array<{ title: string; evidence: string }> = [];

    for (const trend of catalog) {
      const matched = docs.find(doc => trend.patterns.some(pattern => pattern.test(`${doc.title} ${doc.snippet}`)));
      if (!matched) continue;
      const titleKey = trend.label.toLowerCase();
      if (used.has(titleKey)) continue;
      used.add(titleKey);
      trends.push({ title: trend.label, evidence: buildSnippetFromContent(matched.snippet, 220) });
      if (trends.length >= 9) break;
    }

    if (trends.length < 4) {
      const aspectDefaults: Record<string, string> = {
        'latest updates': 'Rapid AI capability updates across products and platforms',
        'industry and market': 'Enterprise adoption and measurable business impact',
        'research and product launches': 'Research translating into production-grade releases',
        'policy and regulation': 'Governance and compliance becoming mandatory',
      };

      for (const doc of docs) {
        const fallbackTitle = aspectDefaults[doc.aspect] || `Practical trend from ${doc.aspect}`;
        const key = fallbackTitle.toLowerCase();
        if (used.has(key)) continue;
        used.add(key);
        trends.push({ title: fallbackTitle, evidence: buildSnippetFromContent(doc.snippet, 220) });
        if (trends.length >= 6) break;
      }
    }

    return trends;
  };

  const extractUrlsFromSearch = (searchPayload: WebSearchPayload | null, rawText: string): string[] => {
    const payloadUrls = (searchPayload?.results ?? [])
      .map(item => item.url)
      .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url));

    const textUrls = Array.from(rawText.matchAll(/https?:\/\/[^\s"'<>]+/g)).map(match => match[0]);
    return Array.from(new Set([...payloadUrls, ...textUrls]));
  };

  const selectDiverseUrls = (
    rows: Array<{ aspect: string; title: string; url: string }>,
    limit: number
  ): Array<{ aspect: string; title: string; url: string }> => {
    const selected: Array<{ aspect: string; title: string; url: string }> = [];
    const seenUrls = new Set<string>();
    const seenHosts = new Set<string>();

    const passes: Array<(item: { aspect: string; title: string; url: string }) => boolean> = [
      item => {
        const host = hostFromUrl(item.url);
        return host.length > 0 && host !== 'news.google.com' && !seenHosts.has(host);
      },
      item => {
        const host = hostFromUrl(item.url);
        return host.length > 0 && !seenHosts.has(host);
      },
      item => hostFromUrl(item.url) !== 'news.google.com',
      () => true,
    ];

    for (const pass of passes) {
      for (const row of rows) {
        if (selected.length >= limit) break;
        if (seenUrls.has(row.url)) continue;
        if (!pass(row)) continue;

        selected.push(row);
        seenUrls.add(row.url);
        const host = hostFromUrl(row.url);
        if (host) seenHosts.add(host);
      }

      if (selected.length >= limit) break;
    }

    return selected;
  };

  const buildGroundedWebSummary = (
    originalQuery: string,
    normalizedQuery: string,
    searchRuns: Array<{ aspect: string; query: string; provider: string; results: WebSearchResultItem[] }> ,
    docs: Array<{ aspect: string; title: string; url: string; host: string; snippet: string; fetchType: string }>
  ): string => {
    const lines: string[] = [];
    const uniqueHosts = Array.from(new Set(docs.map(doc => doc.host))).filter(Boolean);
    const intent = detectWebIntent(normalizedQuery);

    if (docs.length > 0) {
      if (intent === 'tech' && /\bai\b|artificial intelligence/i.test(normalizedQuery)) {
        const trends = collectAiTrendItems(docs);
        const newsItems = collectNewsItems(searchRuns);

        lines.push(`Here are the latest AI trends (2026) based on freshly fetched web content:`);
        lines.push('');
        lines.push('Top AI trends:');

        trends.forEach((trend, idx) => {
          lines.push(`${idx + 1}. ${trend.title}`);
          lines.push(`   ${trend.evidence}`);
        });

        if (newsItems.length > 0) {
          lines.push('');
          lines.push('Latest AI news signals:');
          newsItems.slice(0, 4).forEach((item) => {
            const when = item.when ? ` (${item.when})` : '';
            lines.push(`- ${item.source}${when}: ${item.title}`);
          });
        }

        lines.push('');
        lines.push('Big picture: AI is shifting from isolated tools to deeply integrated decision and execution systems across enterprises.');
        lines.push(`Grounding: ${docs.length} fetched pages from ${uniqueHosts.length} independent publishers.`);

        if (/cyber|security|red\s*team|xss|exploit|threat/i.test(originalQuery)) {
          lines.push('');
          lines.push('Security angle: watch autonomous attack/defense workflows, AI-assisted vulnerability discovery, and governance requirements for high-risk model use.');
        }

        return lines.join('\n');
      }

      const byAspect = new Map<string, Array<{ title: string; snippet: string }>>();
      for (const doc of docs) {
        const bucket = byAspect.get(doc.aspect) ?? [];
        bucket.push({ title: doc.title, snippet: doc.snippet });
        byAspect.set(doc.aspect, bucket);
      }

      lines.push(`Based on fetched web page content, here is the answer for "${originalQuery}":`);
      lines.push('');
      for (const [aspect, entries] of byAspect.entries()) {
        const top = entries.slice(0, 2);
        const combined = top.map(entry => `${entry.title}: ${entry.snippet}`).join(' ');
        lines.push(`- ${aspect}: ${combined}`);
      }
      lines.push('');
      lines.push(`Grounding: ${docs.length} fetched pages from ${uniqueHosts.length} independent publishers.`);

      return lines.join('\n');
    }

    const fallbackItems = searchRuns
      .flatMap(run => run.results.map(result => ({
        title: result.title || 'Untitled result',
        description: (result.description || '').replace(/\s+/g, ' ').trim(),
      })))
      .filter(item => item.description.length > 0)
      .slice(0, 8);

    lines.push(`I could not reliably fetch full readable article bodies for "${normalizedQuery}" right now.`);
    lines.push('');
    lines.push('Best available findings from indexed snippets:');
    fallbackItems.forEach((item) => {
      const brief = item.description.length > 220 ? `${item.description.slice(0, 220).trim()}...` : item.description;
      lines.push(`- ${item.title}: ${brief}`);
    });
    lines.push('');
    lines.push('Try a slightly narrower query so I can fetch deeper article content and provide a stronger grounded answer.');

    return lines.join('\n');
  };

  const runGroundedWebSearchFlow = async (query: string): Promise<{ toolMessages: SessionMessage[]; assistantMessage: SessionMessage }> => {
    const toolMessages: SessionMessage[] = [];
    const normalizedQuery = normalizeWebIntentQuery(query);
    const searchPlan = buildAspectSearchPlan(normalizedQuery);
    const searchRuns: Array<{ aspect: string; query: string; provider: string; results: WebSearchResultItem[] }> = [];

    const runSingleSearch = async (aspect: string, q: string): Promise<void> => {
      setCurrentResponse(`Searching ${aspect}...`);
      const searchArgs = { query: q, maxResults: 6, safeSearch: true };
      const { normalizedArgs: normalizedSearchArgs, resultText: searchResultText } = await executeToolByName('web-search', searchArgs);

      toolMessages.push({
        role: 'tool_call',
        content: '',
        toolName: 'web-search',
        toolArgs: normalizedSearchArgs,
        timestamp: nowIso(),
      });
      toolMessages.push({
        role: 'tool_result',
        content: `<tool_result>${searchResultText}</tool_result>`,
        timestamp: nowIso(),
      });

      const payload = tryParseJson<WebSearchPayload>(searchResultText);
      const payloadResults = payload?.results ?? [];

      const inferredResults: WebSearchResultItem[] = payloadResults.length > 0
        ? payloadResults
        : extractUrlsFromSearch(payload, searchResultText).map((url) => ({
            url,
            title: `Result from ${hostFromUrl(url) || 'source'}`,
            description: '',
            hostname: hostFromUrl(url),
          }));

      searchRuns.push({
        aspect,
        query: q,
        provider: payload?.provider || 'search fallback',
        results: inferredResults,
      });
    };

    for (const planned of searchPlan) {
      await runSingleSearch(planned.aspect, planned.query);
    }

    const initialRows = searchRuns.flatMap(run =>
      run.results.map(result => ({
        aspect: run.aspect,
        title: result.title || 'Untitled result',
        url: result.url || '',
      })).filter(row => /^https?:\/\//i.test(row.url))
    );

    let selectedUrls = selectDiverseUrls(initialRows, 8);
    const nonNewsGoogleCount = selectedUrls.filter(item => hostFromUrl(item.url) !== 'news.google.com').length;

    if (nonNewsGoogleCount < 3 || selectedUrls.length < 4) {
      const sourceQueries = buildSourceCheckDomains(normalizedQuery);
      for (const source of sourceQueries) {
        await runSingleSearch(`source check: ${source}`, `${normalizedQuery} site:${source}`);

        const rows = searchRuns.flatMap(run =>
          run.results.map(result => ({
            aspect: run.aspect,
            title: result.title || 'Untitled result',
            url: result.url || '',
          })).filter(row => /^https?:\/\//i.test(row.url))
        );

        selectedUrls = selectDiverseUrls(rows, 8);
        const freshCount = selectedUrls.filter(item => hostFromUrl(item.url) !== 'news.google.com').length;
        if (freshCount >= 3 && selectedUrls.length >= 4) break;
      }
    }

    const docs: Array<{ aspect: string; title: string; url: string; host: string; snippet: string; fetchType: string }> = [];
    for (const selected of selectedUrls) {
      if (docs.length >= 5) break;
      setCurrentResponse(`Fetching source: ${selected.title}`);
      const fetchArgs = { url: selected.url, maxChars: 9000, timeout: 9000 };
      const { normalizedArgs: normalizedFetchArgs, resultText: fetchResultText } = await executeToolByName('web-fetch', fetchArgs);

      toolMessages.push({
        role: 'tool_call',
        content: '',
        toolName: 'web-fetch',
        toolArgs: normalizedFetchArgs,
        timestamp: nowIso(),
      });
      toolMessages.push({
        role: 'tool_result',
        content: `<tool_result>${fetchResultText}</tool_result>`,
        timestamp: nowIso(),
      });

      const fetchPayload = tryParseJson<WebFetchPayload>(fetchResultText);
      if (fetchPayload?.error) continue;

      const content = typeof fetchPayload?.content === 'string' ? fetchPayload.content : '';
      if (content.trim().length < 120) continue;

      const host = hostFromUrl(fetchPayload?.url || selected.url) || 'unknown-host';
      docs.push({
        aspect: selected.aspect,
        title: fetchPayload?.title || selected.title,
        url: selected.url,
        host,
        snippet: buildSnippetFromContent(content),
        fetchType: fetchPayload?.type || 'content',
      });
    }

    setCurrentResponse('');

    return {
      toolMessages,
      assistantMessage: {
        role: 'assistant',
        content: buildGroundedWebSummary(query, normalizedQuery, searchRuns, docs),
        timestamp: nowIso(),
      },
    };
  };

  const handleCommand = async (cmd: string) => {
    clearInput();
    if (cmd === '/exit') {
      exit();
      return;
    }
    if (cmd === '/model') {
      if (onNavigate) onNavigate('onboarding');
      return;
    }
    if (cmd === '/compact') {
      if (!engine) return;
      setIsInferencing(true);
      try {
        const { messages: compacted, summary } = await applyIncrementalSummarization(messages as any, 6, engine);
        setMessages([...compacted, { role: 'system', content: `Compaction complete. Summary: ${summary.slice(0, 100)}...`, timestamp: new Date().toISOString() }] as any);
      } catch (err: any) {
        setMessages([...messages, { role: 'system', content: `Compaction failed: ${err.message}`, timestamp: new Date().toISOString() }]);
      }
      setIsInferencing(false);
      return;
    }
    setMessages(prevMessages => [...prevMessages, { role: 'system', content: `Command ${cmd} is not fully implemented yet in this preview.`, timestamp: new Date().toISOString() }]);
  };

  const handleSubmit = async (val: string) => {
    if (!val.trim() || isInferencing || showSlash) return;
    if (!engine) {
      setMessages([...messages, { role: 'system', content: 'Please wait, the engine is still loading...', timestamp: new Date().toISOString() }]);
      clearInput();
      return;
    }

    const userMsg: SessionMessage = { role: 'user', content: val, timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    clearInput();
    setIsInferencing(true);
    setCurrentResponse('');

    if (engine) {
      const executeInference = async (msgs: SessionMessage[], rootUserInput: string, depth: number = 0): Promise<void> => {
        if (depth > 8) {
          setMessages(prev => [...prev, { role: 'system', content: 'Stopped after too many tool iterations.', timestamp: new Date().toISOString() }]);
          setCurrentResponse('');
          return;
        }

        try {
          let text = '';
          for await (const chunk of engine.streamChat(msgs, (token) => {
            text += token;
            setCurrentResponse(text);
          })) {
            void chunk;
          }

          // Check for tool call
          const toolCall = parseToolCallFromText(text);
          if (toolCall) {
            try {
              const toolName = toolCall.name;
              const toolArgs = toolCall.arguments;

              const contentBeforeTool = text.replace(/<tool_call>.*?<\/tool_call>/s, '').trim();
              const toolMessages: SessionMessage[] = [];

              if (contentBeforeTool.length > 0) {
                toolMessages.push({ role: 'assistant', content: contentBeforeTool, timestamp: new Date().toISOString() });
              }

              const { normalizedArgs, resultText } = await executeToolByName(toolName, toolArgs);
              const toolCallMsg: SessionMessage = { role: 'tool_call', content: '', toolName, toolArgs: normalizedArgs, timestamp: new Date().toISOString() };
              const toolResultMsg: SessionMessage = {
                role: 'tool_result',
                content: `<tool_result>${resultText}</tool_result>`,
                timestamp: new Date().toISOString(),
              };

              toolMessages.push(toolCallMsg, toolResultMsg);
              const visibleMessages = toolMessages.filter(m => m.role !== 'tool_call' && m.role !== 'tool_result');
              if (visibleMessages.length > 0) {
                setMessages(prev => [...prev, ...visibleMessages]);
              }
              setCurrentResponse('');

              await executeInference([...msgs, ...toolMessages], rootUserInput, depth + 1);
            } catch (e: any) {
               setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: new Date().toISOString() }, { role: 'system', content: `Failed to parse or run tool call: ${e.message}`, timestamp: new Date().toISOString() }]);
               setCurrentResponse('');
            }
          } else if (shouldForceWebSearch(rootUserInput) && looksLikeToolRefusal(text)) {
            const forcedQuery = extractWebSearchQuery(rootUserInput);
            const { toolMessages, assistantMessage } = await runGroundedWebSearchFlow(forcedQuery);
            void toolMessages;
            setMessages(prev => [...prev, assistantMessage]);
            setCurrentResponse('');
            return;
          } else {
            setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: new Date().toISOString() }]);
            setCurrentResponse('');
          }
        } catch (err: any) {
          setMessages(prev => [...prev, { role: 'system', content: `Inference failed: ${err.message}`, timestamp: new Date().toISOString() }]);
          setCurrentResponse('');
        }
      };

      if (shouldForceWebSearch(val)) {
        const forcedQuery = extractWebSearchQuery(val);
        const { toolMessages, assistantMessage } = await runGroundedWebSearchFlow(forcedQuery);
        void toolMessages;
        setMessages(prev => [...prev, assistantMessage]);
        setCurrentResponse('');
      } else {
        await executeInference(newMessages, val, 0);
      }
    }
    setIsInferencing(false);
  };

  return (
    <Box flexDirection="column" width="100%">
      <Static items={[{ isBanner: true, id: 'banner' }, ...messages.map((m, i) => ({ ...m, isBanner: false, id: `msg-${i}-${m.timestamp}` }))]}>
        {(item: any) => {
          if (item.isBanner) return <Banner key={item.id} />;
          return <MessageBubble key={item.id} message={item} />;
        }}
      </Static>

      <Box flexDirection="column">
        {isInferencing && currentResponse && (
          <MessageBubble message={{ role: 'assistant', content: currentResponse, timestamp: new Date().toISOString() }} />
        )}
        {!engine && messages.filter(m => m.role === 'system').length === 0 && ( 
          <Box padding={1} flexDirection="row">
            <Text color="yellow">
              <Spinner type="dots" /> Booting Local Inference Engine (may compile binaries on first launch)...
            </Text>
          </Box>
        )}
      </Box>

      {showSlash && (
        <Box marginBottom={1}>
          <SlashMenu
            query={input.substring(1)}
            onSelect={handleCommand}
            onClose={() => setShowSlash(false)}
          />
        </Box>
      )}

      <Box flexDirection="row" paddingY={1}>
        <Text color="cyan" bold>&gt; </Text>
        {isInferencing ? (
          <Text dimColor>Gemma is thinking...</Text>
        ) : (
          <TextInput
            key={inputKey}
            placeholder={!engine ? "Waiting for engine to load..." : "Type your message..."}
            onChange={(val) => {
              setInput(val);
              if (val.startsWith('/')) setShowSlash(true);
              else setShowSlash(false);
            }}
            onSubmit={handleSubmit}
          />
        )}
      </Box>

      <StatusBar
         modelId={config.model}
         tokens={engine ? engine.getStats().contextUsed : 0}
         maxTokens={32768}
         sessionId="new-session"
      />
    </Box>
  );
}
