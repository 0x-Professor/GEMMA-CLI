import React from 'react';
import { Box, Text } from 'ink';
import { SessionMessage } from '../../session/types.js';
import { formatMarkdown } from '../../utils/format.js';

interface Props {
  message: SessionMessage;
}

function summarizeToolResult(content: string): string {
  const unwrapped = content.replace(/^<tool_result>/i, '').replace(/<\/tool_result>$/i, '').trim();

  try {
    const parsed = JSON.parse(unwrapped) as Record<string, unknown>;
    const parts: string[] = [];

    if (typeof parsed.provider === 'string') parts.push(`provider=${parsed.provider}`);
    if (typeof parsed.count === 'number') parts.push(`count=${parsed.count}`);
    if (typeof parsed.error === 'string') parts.push(`error=${parsed.error}`);
    if (typeof parsed.note === 'string') parts.push(`note=${parsed.note}`);

    if (parts.length > 0) return parts.join(' | ');
  } catch {
    // fall back to plain text preview
  }

  const compact = unwrapped.replace(/\n/g, ' ');
  if (compact.length <= 180) return compact;
  return `${compact.slice(0, 180)}...`;
}

export function MessageBubble({ message }: Props) {
  if (message.role === 'user') {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box marginRight={1} width={4}>
          <Text color="cyan" bold>You </Text>
        </Box>
        <Box flexShrink={1}>
          <Text bold>{message.content}</Text>
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
    const preview = summarizeToolResult(message.content);
    return (
      <Box flexDirection="row" marginTop={0}>
        <Box marginRight={1} width={4}>
          <Text> </Text>
        </Box>
        <Box flexShrink={1}>
          <Text dimColor>→ {preview}</Text>
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
