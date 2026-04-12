import { z } from 'zod';
import { globSync } from 'glob';
import { ToolDefinition, ToolResult } from '../types.js';

export const globSearchTool: ToolDefinition<{ pattern: z.ZodString; cwd: z.ZodOptional<z.ZodString> }> = {
  name: 'glob-search',
  displayName: 'Glob Search',
  description: 'Search for files by glob pattern',
  category: 'fs',
  riskLevel: 'low',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern (e.g., **/*.ts)'),
    cwd: z.string().optional().describe('Directory to search in'),
  }),
  execute: async ({ pattern, cwd }): Promise<ToolResult> => {
    try {
      const files = globSync(pattern, { cwd: cwd || process.cwd(), nodir: true });
      return { result: files.join('\n') || 'No files found.' };
    } catch (e: any) {
      return { error: 'Search failed: ' + e.message };
    }
  }
};