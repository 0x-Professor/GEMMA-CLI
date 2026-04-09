import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';

export function StreamingDots() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box marginRight={1} width={4}>
        <Text color="magenta" bold>◆   </Text>
      </Box>
      <Box flexShrink={1}>
        <Text dimColor>Thinking{dots}</Text>
      </Box>
    </Box>
  );
}
