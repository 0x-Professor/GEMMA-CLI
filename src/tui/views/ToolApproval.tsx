import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';

interface Props {
  toolName: string;
  args: unknown;
  onApprove: (modifiedArgs?: unknown) => void;
  onDeny: () => void;
  onYolo: () => void;
}

export function ToolApproval({ toolName, args, onApprove, onDeny, onYolo }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(args, null, 2));

  useInput((input, key) => {
    if (editMode) return;
    if (input.toLowerCase() === 'a') onApprove();
    if (input.toLowerCase() === 'd') onDeny();
    if (input.toLowerCase() === 'e') setEditMode(true);
    if (input.toLowerCase() === 'y') onYolo();
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={80}>
      <Text bold>Tool Request</Text>
      <Text>Tool: {toolName}</Text>
      {editMode ? (
        <Box flexDirection="row">
          <Text>Args: </Text>
          <TextInput
            onChange={setJsonText}
            onSubmit={(val) => {
              try {
                const parsed = JSON.parse(val);
                onApprove(parsed);
              } catch (e) {
                // error
              }
            }}
          />
        </Box>
      ) : (
        <Text>Input: {jsonText}</Text>
      )}
      {!editMode && (
        <Box marginTop={1}>
          <Text>[A] Allow  [D] Deny  [E] Edit args  [Y] Yolo</Text>
        </Box>
      )}
    </Box>
  );
}
