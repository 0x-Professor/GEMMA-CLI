import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  onClose: () => void;
}

export function SkillsView({ onClose }: Props) {
  return <Box><Text>Skills View</Text></Box>;
}
