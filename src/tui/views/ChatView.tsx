import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { TextInput } from '@inkjs/ui';
import { Banner } from '../components/Banner.js';
import { MessageBubble } from '../components/MessageBubble.js';
import { StatusBar } from '../components/StatusBar.js';
import { SlashMenu } from './SlashMenu.js';
import { SessionMessage } from '../../session/types.js';
import { GemmaEngine } from '../../core/inference.js';
import { loadConfig } from '../../config/settings.js';

export function ChatView() {
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
    setMessages(prevMessages => [...prevMessages, { role: 'user', content: `Executed ${cmd}`, timestamp: new Date().toISOString() }]);
  };

  const handleSubmit = async (val: string) => {
    if (!val.trim() || isInferencing) return;
    
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
    <Box flexDirection="column" height="100%">
      {messages.length === 0 && <Banner />}

      <Box flexGrow={1} flexDirection="column" overflowY="hidden">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isInferencing && currentResponse && (
          <MessageBubble message={{ role: 'assistant', content: currentResponse, timestamp: new Date().toISOString() }} />
        )}
      </Box>

      <Box borderStyle="round" paddingX={1} flexDirection="column">
        <Box flexDirection="row">
          <Text>&gt; </Text>
          <TextInput
            key={inputKey}
            onChange={(val) => {
              setInput(val);
              if (val.startsWith('/')) setShowSlash(true);
              else setShowSlash(false);
            }}
            onSubmit={handleSubmit}
          />
        </Box>
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

      <StatusBar
         modelId={config.model}
         tokens={engine ? engine.getStats().contextUsed : 0}
         maxTokens={32768}
         sessionId="new-session"
      />
    </Box>
  );
}
