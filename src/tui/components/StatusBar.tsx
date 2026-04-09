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
  const isDanger = tokens > maxTokens * 0.85;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Text color="cyan">{modelId}</Text>
      <Text dimColor> │ </Text>
      <Text color={isDanger ? 'yellow' : 'green'}>
        {tokens}/{maxTokens} tokens
      </Text>
      <Text dimColor> │ </Text>
      <Text dimColor>#{shortId}</Text>
    </Box>
  );
}
