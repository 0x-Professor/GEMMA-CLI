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
import { SessionManager } from '../../session/manager.js';

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
      setMessages([...messages, { role: 'system', content: '⏳ Please wait, the engine is still loading...', timestamp: new Date().toISOString() }]);
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
      const executeInference = async (msgs: SessionMessage[]) => {
        try {
          let text = '';
          const responseChunks: string[] = [];
          for await (const chunk of engine.streamChat(msgs, (token) => {   
            text += token;
            setCurrentResponse(text);
          })) {
            responseChunks.push(chunk);
          }
          
          // Check for tool call
          const toolCallMatch = text.match(/<tool_call>(.*?)<\/tool_call>/s);
          if (toolCallMatch) {
            const toolCallJson = toolCallMatch[1];
            try {
              const toolCallData = JSON.parse(toolCallJson);
              const toolName = toolCallData.name;
              const toolArgs = toolCallData.arguments;
              
              const contentBeforeTool = text.replace(/<tool_call>.*?<\/tool_call>/s, '').trim();
              const assistantMsg: SessionMessage = { role: 'assistant', content: contentBeforeTool || 'I used a tool here:', timestamp: new Date().toISOString() };
              const toolCallMsg: SessionMessage = { role: 'tool_call', content: '', toolName, toolArgs, timestamp: new Date().toISOString() };
              
              setMessages(prev => [...prev, assistantMsg, { role: 'system', content: `[Running tool] ${toolName}...`, timestamp: new Date().toISOString() }]);
              setCurrentResponse('');
              
              const tool = globalToolRegistry.list().find(t => t.name === toolName);
              let toolResultString = '';
              if (tool) {
                try {
                  const toolResultObj = await tool.execute(toolArgs);
                  toolResultString = toolResultObj.result || toolResultObj.stdout || toolResultObj.error || JSON.stringify(toolResultObj);
                } catch (e: any) {
                  toolResultString = `Execution failed: ${e.message}`;
                }
              } else {
                toolResultString = `Error: Tool ${toolName} not found`;
              }
              
              const toolResultMsg: SessionMessage = { role: 'tool_result', content: `<tool_result>${toolResultString}</tool_result>`, timestamp: new Date().toISOString() };
              const nextMsgs: SessionMessage[] = [...msgs, assistantMsg, toolCallMsg, toolResultMsg];
              setMessages(prev => [...prev.filter(m => !m.content.startsWith('[Running tool]') && m.content !== assistantMsg.content), assistantMsg, toolCallMsg, toolResultMsg]);
              
              await executeInference(nextMsgs);
            } catch (e: any) {
               setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: new Date().toISOString() }, { role: 'system', content: `Failed to parse or run tool call: ${e.message}`, timestamp: new Date().toISOString() }]);
               setCurrentResponse('');
            }
          } else {
            setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: new Date().toISOString() }]);
            setCurrentResponse('');
          }
        } catch (err: any) {
          setMessages(prev => [...prev, { role: 'system', content: `Inference failed: ${err.message}`, timestamp: new Date().toISOString() }]);
          setCurrentResponse('');
        }
      };

      await executeInference(newMessages);
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
