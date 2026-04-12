import { z } from 'zod';
import { spawnSync } from 'child_process';
import { ToolDefinition, ToolResult } from '../types.js';

export const diffViewTool: ToolDefinition<{ type: z.ZodString; file1: z.ZodString; file2: z.ZodOptional<z.ZodString> }> = {
  name: 'diff-view',
  displayName: 'Diff View',
  description: 'View changes between files or git tree',
  category: 'vcs',
  riskLevel: 'low',
  parameters: z.object({
    type: z.enum(['git', 'file']).describe('Type of diff operation'),
    file1: z.string().describe('File to diff (or first file for file diff)'),
    file2: z.string().optional().describe('Second file for file diff mode'),
  }),
  execute: async ({ type, file1, file2 }): Promise<ToolResult> => {
    try {
      if (type === 'git') {
        const out = spawnSync('git', ['diff', 'HEAD', file1]);
        return { result: out.stdout.toString() || 'No changes to view.' };
      }
      
      if (!file2) return { error: 'file2 is required when type is file' };
      const out = spawnSync('diff', ['-u', file1, file2]);
      return { result: out.stdout.toString() || 'Files are identical.' };
    } catch (e: any) {
      return { error: 'Diff failed: ' + e.message };
    }
  }
};