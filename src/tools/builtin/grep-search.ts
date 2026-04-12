import { z } from 'zod';
import { spawnSync } from 'child_process';
import { ToolDefinition, ToolResult } from '../types.js';
import { hasRipgrep } from './_ripgrep.js';

export const grepSearchTool: ToolDefinition<{ pattern: z.ZodString; cwd: z.ZodOptional<z.ZodString> }> = {
  name: 'grep-search',
  displayName: 'Grep Search',
  description: 'Search content inside files',
  category: 'fs',
  riskLevel: 'low',
  parameters: z.object({
    pattern: z.string().describe('Regex or string to search for'),
    cwd: z.string().optional().describe('Directory to search in'),
  }),
  execute: async ({ pattern, cwd }): Promise<ToolResult> => {
    try {
      const isWindows = process.platform === 'win32';
      
      if (hasRipgrep()) {
        const result = spawnSync('rg', ['-n', pattern], { cwd: cwd || process.cwd() });
        return { result: result.stdout.toString() || 'No matches.' };
      }
      
      const cmd = isWindows ? 'findstr' : 'grep';
      const args = isWindows ? ['/s', '/i', '/n', pattern, '*.*'] : ['-rn', pattern, '.'];
      
      const result = spawnSync(cmd, args, { cwd: cwd || process.cwd() });
      return { result: result.stdout.toString() || 'No matches.' };
    } catch (e: any) {
      return { error: 'Search failed: ' + e.message };
    }
  }
};