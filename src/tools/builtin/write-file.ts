import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { ToolDefinition } from '../types.js';

export const writeFileTool: ToolDefinition<{ path: z.ZodString; content: z.ZodString }> = {
  name: 'write-file',
  description: 'Write content to a file, overwriting if it exists',
  parameters: z.object({
    path: z.string().describe('The absolute or relative path to the file'),
    content: z.string().describe('The complete file content to write'),
  }),
  execute: async ({ path: targetPath, content }) => {
    try {
      const realPath = path.resolve(targetPath);
      await fs.ensureDir(path.dirname(realPath));
      await fs.writeFile(realPath, content, 'utf8');
      return { result: `Successfully wrote to ${realPath}` };
    } catch (err: unknown) {
      if (err instanceof Error) {
        return { error: err.message };
      }
      return { error: 'Unknown error occurred while writing file' };
    }
  },
};
