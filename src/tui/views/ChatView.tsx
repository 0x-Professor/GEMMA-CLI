import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { TextInput } from '@inkjs/ui';
import { Banner } from '../components/Banner.js';
import { MessageBubble } from '../components/MessageBubble.js';
import { StatusBar } from '../components/StatusBar.js';
import { SlashMenu } from './SlashMenu.js';
import { SessionMessage } from '../../session/types.js';

export function ChatView() {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [showSlash, setShowSlash] = useState(false);

  useInput((keyInput, key) => {
    if (key.ctrl && keyInput === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {messages.length === 0 && <Banner />}
      
      <Box flexGrow={1} flexDirection="column">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
      </Box>

      {showSlash && (
        <Box position="absolute">
          <SlashMenu 
            query={input.substring(1)} 
            onSelect={(cmd) => {
              setShowSlash(false);
              setInput('');
              setMessages([...messages, { role: 'user', content: `Executed ${cmd}`, timestamp: new Date().toISOString() }]);
            }}
            onClose={() => setShowSlash(false)}
          />
        </Box>
      )}

      <Box borderStyle="round" paddingX={1}>
        <Text>&gt; </Text>
        <TextInput 
          onChange={(val) => {
            setInput(val);
            if (val === '/') setShowSlash(true);
            else if (!val.startsWith('/')) setShowSlash(false);
          }}
          onSubmit={(val) => {
            if (val.trim()) {
              setMessages([...messages, { role: 'user', content: val, timestamp: new Date().toISOString() }]);
              setInput('');
              setShowSlash(false);
            }
          }}
        />
      </Box>
      
      <StatusBar modelId="gemma-3-4b-it" tokens={0} maxTokens={32768} sessionId="new-session" />
    </Box>
  );
}
