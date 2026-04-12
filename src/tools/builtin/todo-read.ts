import { z } from 'zod';
import { ToolDefinition, ToolResult } from '../types.js';
import { SessionTodoStore } from '../../session/todo-store.js';

export const todoReadTool: ToolDefinition<{}> = {
  name: 'todo-read',
  displayName: 'Read Todos',
  description: 'Read the current session task list (todos)',
  category: 'planning',
  riskLevel: 'low',
  parameters: z.object({}),
  execute: async (): Promise<ToolResult> => {
    return { result: JSON.stringify(SessionTodoStore.getAll(), null, 2) };
  }
};