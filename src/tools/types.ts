import { z } from 'zod';

export interface ToolDefinition<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  parameters: z.ZodObject<T>;
  execute: (args: z.infer<z.ZodObject<T>>) => Promise<ToolResult>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  result?: string;
  error?: string;
}
