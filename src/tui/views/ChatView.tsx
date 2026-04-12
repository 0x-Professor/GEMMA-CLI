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
    return /(search\s+the\s+web|web\s+search|latest\s+news|look\s+up|find\s+online)/i.test(userText);
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

  const buildSnippetFromContent = (content: string, maxChars: number = 320): string => {
    const compact = content.replace(/\s+/g, ' ').trim();
    if (!compact) return 'No readable content extracted.';

    const firstSentences = compact.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
    const chosen = firstSentences.length >= 40 ? firstSentences : compact;

    if (chosen.length <= maxChars) return chosen;
    return `${chosen.slice(0, maxChars).trim()}...`;
  };

  const extractUrlsFromSearch = (searchPayload: WebSearchPayload | null, rawText: string): string[] => {
    const payloadUrls = (searchPayload?.results ?? [])
      .map(item => item.url)
      .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url));

    const textUrls = Array.from(rawText.matchAll(/https?:\/\/[^\s"'<>]+/g)).map(match => match[0]);
    return Array.from(new Set([...payloadUrls, ...textUrls]));
  };

  const buildGroundedWebSummary = (
    query: string,
    provider: string,
    docs: Array<{ title: string; url: string; host: string; snippet: string; fetchType: string }>,
    fallbackResults: WebSearchResultItem[]
  ): string => {
    const lines: string[] = [];

    lines.push(`I completed a grounded web run for: "${query}".`);
    lines.push('');
    lines.push('What I ran:');
    lines.push(`1. web-search via ${provider}`);

    if (docs.length > 0) {
      docs.forEach((doc, idx) => {
        lines.push(`${idx + 2}. web-fetch ${doc.url}`);
      });

      lines.push('');
      lines.push('Grounded summary (from fetched pages only):');
      docs.forEach((doc) => {
        lines.push(`- ${doc.title} (${doc.host}, ${doc.fetchType}): ${doc.snippet}`);
      });

      lines.push('');
      lines.push('Sources used:');
      docs.forEach((doc) => {
        lines.push(`- ${doc.url}`);
      });

      return lines.join('\n');
    }

    lines.push('');
    lines.push('I could not fetch readable article text from the top links, so here are the top search results:');
    fallbackResults.slice(0, 5).forEach((item) => {
      const title = item.title || 'Untitled result';
      const url = item.url || 'Unavailable URL';
      const desc = item.description || '';
      lines.push(`- ${title}: ${url}${desc ? ` | ${desc}` : ''}`);
    });

    return lines.join('\n');
  };

  const runGroundedWebSearchFlow = async (query: string): Promise<{ toolMessages: SessionMessage[]; assistantMessage: SessionMessage }> => {
    const toolMessages: SessionMessage[] = [];
    const searchArgs = { query, maxResults: 8, safeSearch: true };
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

    const searchPayload = tryParseJson<WebSearchPayload>(searchResultText);
    const provider = searchPayload?.provider || 'search fallback';
    const urls = extractUrlsFromSearch(searchPayload, searchResultText).slice(0, 2);

    const docs: Array<{ title: string; url: string; host: string; snippet: string; fetchType: string }> = [];
    for (const url of urls) {
      const fetchArgs = { url, maxChars: 8000, timeout: 12000 };
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
      if (content.trim().length < 80) continue;

      const title = fetchPayload?.title || searchPayload?.results?.find(item => item.url === url)?.title || 'Untitled source';
      const host = (() => {
        const candidate = fetchPayload?.url || url;
        try {
          return new URL(candidate).hostname;
        } catch {
          return 'unknown-host';
        }
      })();

      docs.push({
        title,
        url,
        host,
        snippet: buildSnippetFromContent(content),
        fetchType: fetchPayload?.type || 'content',
      });
    }

    return {
      toolMessages,
      assistantMessage: {
        role: 'assistant',
        content: buildGroundedWebSummary(query, provider, docs, searchPayload?.results ?? []),
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
              setMessages(prev => [...prev, ...toolMessages]);
              setCurrentResponse('');

              await executeInference([...msgs, ...toolMessages], rootUserInput, depth + 1);
            } catch (e: any) {
               setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: new Date().toISOString() }, { role: 'system', content: `Failed to parse or run tool call: ${e.message}`, timestamp: new Date().toISOString() }]);
               setCurrentResponse('');
            }
          } else if (shouldForceWebSearch(rootUserInput) && looksLikeToolRefusal(text)) {
            const forcedQuery = extractWebSearchQuery(rootUserInput);
            const { toolMessages, assistantMessage } = await runGroundedWebSearchFlow(forcedQuery);
            setMessages(prev => [...prev, ...toolMessages, assistantMessage]);
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
        setMessages(prev => [...prev, ...toolMessages, assistantMessage]);
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
        <Text color="cyan" bold>❯ </Text>
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
