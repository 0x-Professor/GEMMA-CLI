import { z } from 'zod';
import fs from 'fs-extra';
import { ToolDefinition } from '../types.js';
import path from 'path';

export const readFileTool: ToolDefinition<{ path: z.ZodString }> = {
  name: 'read-file',
  description: 'Read the contents of a file',
  parameters: z.object({
    path: z.string().describe('The absolute or relative path to the file'),
  }),
  execute: async ({ path: targetPath }) => {
    try {
      const realPath = path.resolve(targetPath);
      const content = await fs.readFile(realPath, 'utf8');
      return { result: content };
    } catch (err: unknown) {
      if (err instanceof Error) {
        return { error: err.message };
      }
      return { error: 'Unknown error occurred while reading file' };
    }
  },
};
