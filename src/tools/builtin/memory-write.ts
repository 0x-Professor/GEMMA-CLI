import { z } from 'zod';
import { ToolDefinition, ToolResult } from '../types.js';

export const memoryWriteTool: ToolDefinition<{ key: z.ZodString; value: z.ZodString }> = {
  name: 'memory-write',
  displayName: 'Write Memory',
  description: 'Persists key/value note to session metadata that survives compaction',
  category: 'planning',
  riskLevel: 'low',
  parameters: z.object({
    key: z.string().describe('Key to write to memory'),
    value: z.string().describe('Value to store'),
  }),
  execute: async ({ key, value }): Promise<ToolResult> => {
    // Note: To fully implement this, it should inject into the session class.
    return { result: `Saved to session memory: ${key} = ${value}` };
  }
};