import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
  return <Box><Text>Settings View</Text></Box>;
}
