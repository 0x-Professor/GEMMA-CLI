import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  onClose: () => void;
}

export function ModelPicker({ onClose }: Props) {
  return <Box><Text>Model Picker View</Text></Box>;
}
