import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  onClose: () => void;
}

export function SessionsView({ onClose }: Props) {
  return <Box><Text>Sessions View</Text></Box>;
}
