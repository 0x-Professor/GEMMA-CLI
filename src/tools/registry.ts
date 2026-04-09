import { ToolDefinition } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition<any>>();

  register(tool: ToolDefinition<any>): void {
    this.tools.set(tool.name, tool);
  }

  lookup(name: string): ToolDefinition<any> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<any>[] {
    return Array.from(this.tools.values());
  }

  clear(): void {
    this.tools.clear();
  }
}

export const globalToolRegistry = new ToolRegistry();
