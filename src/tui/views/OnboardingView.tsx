import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import { checkModelCompat, getSystemInfo, SystemInfo } from '../../system/requirements.js';
import { downloadModel } from '../../download/downloader.js';
import { ModelId } from '../../utils/constants.js';
import { updateConfig } from '../../config/settings.js';

interface Props {
  onComplete: () => void;
}

export function OnboardingView({ onComplete }: Props) {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [downloading, setDownloading] = useState<{ active: boolean; modelId?: ModelId }>({ active: false });

  useEffect(() => {
    getSystemInfo().then(setSys);
  }, []);

  if (downloading.active && downloading.modelId) {
    return <Text color="yellow">Downloading {downloading.modelId}... this may take a while. Progress bar writes directly to terminal.</Text>;
  }

  if (!sys) {
    return <Text>Loading system info...</Text>;
  }

  const compat = checkModelCompat(sys);

  const handleSelect = async (modelId: string) => {
    setDownloading({ active: true, modelId: modelId as ModelId });
    try {
      await downloadModel(modelId as ModelId);
      updateConfig({ model: modelId });
      onComplete();
    } catch (err: any) {
      setDownloading({ active: false });
      console.error(err);
    }
  };

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
        onChange={handleSelect}
      />
    </Box>
  );
}
