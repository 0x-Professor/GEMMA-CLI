import React from 'react';
import { Box, Text } from 'ink';
import { SessionMessage } from '../../session/types.js';
import { formatMarkdown } from '../../utils/format.js';

interface Props {
  message: SessionMessage;
}

export function MessageBubble({ message }: Props) {
  if (message.role === 'user') {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box marginRight={1} width={4}>
          <Text color="blue" bold>You </Text>
        </Box>
        <Box flexShrink={1}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    );
  }

  if (message.role === 'assistant') {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box marginRight={1} width={4}>
          <Text color="magenta" bold>◆   </Text>
        </Box>
        <Box flexShrink={1}>
          <Text>{formatMarkdown(message.content).trim()}</Text>
        </Box>
      </Box>
    );
  }

  if (message.role === 'tool_call') {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box marginRight={1} width={4}>
          <Text color="yellow" bold>⚙   </Text>
        </Box>
        <Box flexShrink={1}>
          <Text color="yellow">{message.toolName}</Text>
          <Text color="gray">  {JSON.stringify(message.toolArgs)}</Text>
        </Box>
      </Box>
    );
  }

  if (message.role === 'tool_result') {
    return (
      <Box flexDirection="row" marginTop={0}>
        <Box marginRight={1} width={4}>
          <Text> </Text>
        </Box>
        <Box flexShrink={1}>
          <Text dimColor>→ {message.content.substring(0, 100).replace(/\n/g, ' ')}{message.content.length > 100 ? '...' : ''}</Text>
        </Box>
      </Box>
    );
  }

  if (message.role === 'system') {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box marginRight={1} width={4}>
          <Text color="red" bold>SYS </Text>
        </Box>
        <Box flexShrink={1}>
          <Text color="red">{message.content}</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
