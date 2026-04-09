import React from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';

interface Props {
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function SlashMenu({ query, onSelect, onClose }: Props) {
  const allCommands = [
    { label: '/model - Switch or download model', value: '/model' },
    { label: '/mcp - Manage MCP servers', value: '/mcp' },
    { label: '/skills - Manage skills', value: '/skills' },
    { label: '/settings - Edit config', value: '/settings' },
    { label: '/sessions - Browse / resume sessions', value: '/sessions' },
    { label: '/help - Show help', value: '/help' },
    { label: '/exit - Quit', value: '/exit' }
  ];

  const filtered = allCommands.filter(c => c.value.startsWith(`/${query}`));

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Select
        options={filtered.length > 0 ? filtered : [{ label: 'No commands found', value: '' }]}
        onChange={(value) => {
          if (value) onSelect(value);
          onClose();
        }}
      />
    </Box>
  );
}
