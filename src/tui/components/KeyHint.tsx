import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  hints: Record<string, string>;
}

export function KeyHint({ hints }: Props) {
  return (
    <Box flexDirection="row" gap={2}>
      {Object.entries(hints).map(([key, action]) => (
        <Box key={key} flexDirection="row">
          <Text dimColor inverse> {key} </Text>
          <Text dimColor> {action}</Text>
        </Box>
      ))}
    </Box>
  );
}
