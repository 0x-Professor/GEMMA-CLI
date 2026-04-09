import React from 'react';
import { Box, Text } from 'ink';

export function Banner() {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="cyan" bold>  __ _  ___ _ __ ___  _ __ ___   __ _ </Text>
      <Text color="cyan" bold> / _` |/ _ \ '_ ` _ \| '_ ` _ \ / _` |</Text>
      <Text color="cyan" bold>| (_| |  __/ | | | | | | | | | | (_| |</Text>
      <Text color="cyan" bold> \__, |\___|_| |_| |_|_| |_| |_|\__,_|</Text>
      <Text color="cyan" bold>  __/ |   CLI powered by Google Gemma</Text>
      <Text color="cyan" bold> |___/ </Text>
    </Box>
  );
}
