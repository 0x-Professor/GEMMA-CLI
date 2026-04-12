import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  modelId: string;
  tokens: number;
  maxTokens: number;
  sessionId: string;
}

export function StatusBar({ modelId, tokens, maxTokens, sessionId }: Props) {
  const shortId = sessionId.split('-')[0] || sessionId;
  const ratio = tokens / maxTokens;
  const isDanger = ratio > 0.85;
  const isWarning = ratio > 0.65;
  
  const color = isDanger ? 'red' : isWarning ? 'yellow' : 'green';
  const hint = isWarning ? <Text color="yellow"> ⚡ /compact hint </Text> : null;

  return (
    <Box flexDirection="row" marginTop={1} justifyContent="space-between">
      <Box flexDirection="row">
        <Text color="cyan">{modelId}</Text>
        <Text dimColor> │ </Text>
        <Text color={color}>
          {tokens}/{maxTokens} tokens
        </Text>
        {hint}
        <Text dimColor> │ </Text>
        <Text dimColor>#{shortId}</Text>
      </Box>
      <Box flexDirection="row">
        <Text dimColor>Press </Text>
        <Text color="gray" bold>/</Text>
        <Text dimColor> for commands  │  Press </Text>
        <Text color="gray" bold>Ctrl+C</Text>
        <Text dimColor> to exit</Text>
      </Box>
    </Box>
  );
}
