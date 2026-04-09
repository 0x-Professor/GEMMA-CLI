import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  onClose: () => void;
}

export function MCPView({ onClose }: Props) {
  return <Box><Text>MCP View</Text></Box>;
}
