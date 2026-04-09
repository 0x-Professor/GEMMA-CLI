import { z } from 'zod';
import got from 'got';
import { ToolDefinition } from '../types.js';

export const webFetchTool: ToolDefinition<{ url: z.ZodString }> = {
  name: 'web-fetch',
  description: 'Fetch the text content of a URL',
  parameters: z.object({
    url: z.string().url().describe('The URL to fetch'),
  }),
  execute: async ({ url }) => {
    try {
      const response = await got(url);
      return { result: response.body };
    } catch (err: unknown) {
      if (err instanceof Error) {
        return { error: err.message };
      }
      return { error: 'Unknown error occurred while fetching URL' };
    }
  },
};
