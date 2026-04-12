import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function SlashMenu({ query, onSelect, onClose }: Props) {
  const [index, setIndex] = useState(0);

  const allCommands = [
    { label: '/model - Switch or download model', value: '/model' },
    { label: '/mcp - Manage MCP servers', value: '/mcp' },
    { label: '/skills - Manage skills', value: '/skills' },
    { label: '/compact - Summarize conversation context', value: '/compact' },
    { label: '/settings - Edit config', value: '/settings' },
    { label: '/sessions - Browse / resume sessions', value: '/sessions' },
    { label: '/help - Show help', value: '/help' },
    { label: '/exit - Quit', value: '/exit' }
  ];

  const filtered = allCommands.filter(c => c.value.startsWith(`/${query}`));

  useEffect(() => {
    setIndex(0); // reset selection when typing
  }, [query]);

  // Safely grab key events manually to avoid competing with TextInput focus
  useInput((input, key) => {
    if (filtered.length === 0) return;

    if (key.upArrow) {
      setIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    } else if (key.downArrow) {
      setIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    } else if (key.return) {
      onSelect(filtered[index]?.value || '');
      onClose();
    } else if (key.escape) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="cyan">
      {filtered.length === 0 ? (
         <Text color="gray">No commands found</Text>
      ) : (
        filtered.map((item, i) => (
          <Text key={item.value} color={i === index ? 'cyan' : 'gray'} bold={i === index}>
            {i === index ? '❯ ' : '  '}{item.label}
          </Text>
        ))
      )}
    </Box>
  );
}
