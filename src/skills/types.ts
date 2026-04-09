import { z } from 'zod';
import { ToolResult } from '../tools/types.js';

export interface SkillTool {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute: (args: unknown) => Promise<ToolResult>;
}

export interface Skill {
  tools: SkillTool[];
}
