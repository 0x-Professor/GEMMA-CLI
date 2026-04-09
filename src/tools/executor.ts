import { ToolRegistry } from './registry.js';
import { ToolResult } from './types.js';

export interface ToolApprovalHooks {
  onApprovalRequest: (toolName: string, args: unknown) => Promise<{ approved: boolean; modifiedArgs?: unknown }>;
}

export class ToolExecutor {
  constructor(private registry: ToolRegistry, private hooks: ToolApprovalHooks) {}

  async execute(name: string, rawArgs: string): Promise<ToolResult> {
    const tool = this.registry.lookup(name);
    if (!tool) {
      return { error: `Tool "${name}" not found.` };
    }

    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch {
      return { error: `Failed to parse arguments as JSON: ${rawArgs}` };
    }

    const approval = await this.hooks.onApprovalRequest(name, parsedArgs);
    if (!approval.approved) {
       return { error: `Tool call "${name}" was manually denied by the user.` };
    }

    const finalArgs = approval.modifiedArgs !== undefined ? approval.modifiedArgs : parsedArgs;

    let validatedArgs: unknown;
    try {
      validatedArgs = tool.parameters.parse(finalArgs);
    } catch (err: unknown) {
       if (err instanceof Error) {
         return { error: `Arguments validation failed: ${err.message}` };
       }
       return { error: 'Unknown validation error' };
    }

    try {
      return await tool.execute(validatedArgs as any);
    } catch (err: unknown) {
      if (err instanceof Error) {
         return { error: `Tool execution failed: ${err.message}` };
      }
      return { error: 'Unknown execution error' };
    }
  }

  // Note: streaming XML parsing and execution logic goes here or is hooked up to the engine.
}
