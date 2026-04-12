import { ToolDefinition } from './types.js';

import { bashTool } from './builtin/bash.js';
import { listDirTool } from './builtin/list-dir.js';
import { readFileTool } from './builtin/read-file.js';
import { writeFileTool } from './builtin/write-file.js';
import { editFileTool } from './builtin/edit-file.js';
import { globSearchTool } from './builtin/glob-search.js';
import { grepSearchTool } from './builtin/grep-search.js';
import { diffViewTool } from './builtin/diff-view.js';
import { todoReadTool } from './builtin/todo-read.js';
import { todoWriteTool } from './builtin/todo-write.js';
import { memoryWriteTool } from './builtin/memory-write.js';
import { webFetchTool } from './builtin/web-fetch.js';
import { webSearchTool } from './builtin/web-search.js';

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

// Auto-register built-in tools
globalToolRegistry.register(bashTool);
globalToolRegistry.register(listDirTool);
globalToolRegistry.register(readFileTool);
globalToolRegistry.register(writeFileTool);
globalToolRegistry.register(editFileTool);
globalToolRegistry.register(globSearchTool);
globalToolRegistry.register(grepSearchTool);
globalToolRegistry.register(diffViewTool);
globalToolRegistry.register(todoReadTool);
globalToolRegistry.register(todoWriteTool);
globalToolRegistry.register(memoryWriteTool);
globalToolRegistry.register(webFetchTool);
globalToolRegistry.register(webSearchTool);
