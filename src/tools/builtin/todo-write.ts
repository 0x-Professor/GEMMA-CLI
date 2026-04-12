import { z } from 'zod';
import { ToolDefinition, ToolResult } from '../types.js';
import { SessionTodoStore } from '../../session/todo-store.js';

export const todoWriteTool: ToolDefinition<{ action: z.ZodString; task: z.ZodOptional<z.ZodAny>; id: z.ZodOptional<z.ZodString>; updates: z.ZodOptional<z.ZodAny> }> = {
  name: 'todo-write',
  displayName: 'Write Todo',
  description: 'Manage the session task ledger (add, update, delete, clear task planning items)',
  category: 'planning',
  riskLevel: 'low',
  parameters: z.object({
    action: z.enum(['add', 'update', 'delete', 'clear']).describe('Action to perform against the ledger'),
    task: z.any().optional().describe('Task properties to add'),
    id: z.string().optional().describe('ID of the task to update or delete'),
    updates: z.any().optional().describe('Updates to apply to the task'),
  }),
  execute: async ({ action, task, id, updates }): Promise<ToolResult> => {
    try {
      if (action === 'clear') {
        SessionTodoStore.clear();
        return { result: 'Ledger cleared' };
      }
      
      if (action === 'add' && task) {
        const added = SessionTodoStore.add(task);
        return { result: 'Added: ' + added.id };
      }
      
      if (action === 'update' && id && updates) {
        const up = SessionTodoStore.update(id, updates);
        return { result: up ? 'Updated: ' + id : 'Not found' };
      }

      if (action === 'delete' && id) {
        const res = SessionTodoStore.remove(id);
        return { result: res ? 'Deleted: ' + id : 'Not found' };
      }

      return { error: 'Invalid parameters for action' };
    } catch(e: any) {
      return { error: e.message };
    }
  }
};