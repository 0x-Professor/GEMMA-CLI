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
    e.loadModel(config.model).then(() => setEngine(e)).catch(err => {
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

  const handleCommand = (cmd: string) => {
    clearInput();
    if (cmd === '/exit') {
      exit();
      return;
    }
    if (cmd === '/model') {
      if (onNavigate) onNavigate('onboarding');
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
      try {
        let text = '';
        for await (const chunk of engine.streamChat(newMessages, (token) => {
          text += token;
          setCurrentResponse(text);
        })) {
          // chunks are also aggregated here if needed
        }
        setMessages([...newMessages, { role: 'assistant', content: text, timestamp: new Date().toISOString() }]);
        setCurrentResponse('');
      } catch (err: any) {
        setMessages([...newMessages, { role: 'system', content: `Inference failed: ${err.message}`, timestamp: new Date().toISOString() }]);
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
