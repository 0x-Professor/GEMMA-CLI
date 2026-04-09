import { z } from 'zod';
import fs from 'fs-extra';
import { ToolDefinition } from '../types.js';
import path from 'path';

export const listDirTool: ToolDefinition<{ path: z.ZodString }> = {
  name: 'list-dir',
  description: 'List contents of a directory',
  parameters: z.object({
    path: z.string().describe('The absolute or relative directory path'),
  }),
  execute: async ({ path: targetPath }) => {
    try {
      const realPath = path.resolve(targetPath);
      const entries = await fs.readdir(realPath, { withFileTypes: true });
      const result = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
      return { result };
    } catch (err: unknown) {
      if (err instanceof Error) {
        return { error: err.message };
      }
      return { error: 'Unknown error occurred while listing directory' };
    }
  },
};
