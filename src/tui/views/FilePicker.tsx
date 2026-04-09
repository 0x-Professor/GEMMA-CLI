import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  onClose: () => void;
}

export function FilePicker({ onClose }: Props) {
  return <Box><Text>File Picker View</Text></Box>;
}
