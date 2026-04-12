import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { ToolDefinition, ToolResult } from '../types.js';

export const editFileTool: ToolDefinition<{ path: z.ZodString; find: z.ZodString; replace: z.ZodString }> = {
  name: 'edit-file',
  displayName: 'Edit File',
  description: 'Apply surgical string replacements to an existing file',
  category: 'fs',
  riskLevel: 'medium',
  parameters: z.object({
    path: z.string(),
    find: z.string(),
    replace: z.string(),
  }),
  execute: async ({ path, find, replace }): Promise<ToolResult> => {
    if (!existsSync(path)) return { error: `File not found: ${path}` };
    
    let content = readFileSync(path, 'utf8');
    if (!content.includes(find)) {
      return { error: `The exact string to find was not found in the file.` };
    }
    
    content = content.replace(find, replace);
    writeFileSync(path, content, 'utf8');
    return { result: `Successfully edited ${path} (replaced ${find.length} chars with ${replace.length} chars)` };
  }
};