import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import { checkModelCompat, getSystemInfo, SystemInfo } from '../../system/requirements.js';

interface Props {
  onComplete: () => void;
}

export function OnboardingView({ onComplete }: Props) {
  const [sys, setSys] = useState<SystemInfo | null>(null);

  useEffect(() => {
    getSystemInfo().then(setSys);
  }, []);

  if (!sys) {
    return <Text>Loading system info...</Text>;
  }

  const compat = checkModelCompat(sys);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>System Information:</Text>
      <Text>RAM: {sys.ramGB.toFixed(1)} GB</Text>
      <Text>Disk: {sys.diskGB.toFixed(1)} GB</Text>
      <Text>GPU: {sys.gpuMode || 'None'}</Text>
      
      <Box marginTop={1}>
        <Text bold>Select a model:</Text>
      </Box>
      <Select
        options={compat.map(c => ({
          label: `${c.compatible ? '✓' : '✗'} ${c.displayName} (${Math.round(c.sizeMB)} MB) ${c.recommended ? '- Recommended' : ''} ${c.reason ? `- ${c.reason}` : ''}`,
          value: c.modelId
        }))}
        onChange={() => onComplete()}
      />
    </Box>
  );
}
