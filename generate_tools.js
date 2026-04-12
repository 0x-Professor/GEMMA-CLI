const fs = require('fs');

const tools = [
  { name: 'edit-file', desc: 'Edit specific lines in a file', args: '{ path: z.string(), lineStart: z.number(), lineEnd: z.number(), content: z.string() }' },
  { name: 'glob-search', desc: 'Search files using a glob pattern', args: '{ pattern: z.string(), cwd: z.string().optional() }' },
  { name: 'grep-search', desc: 'Search file contents using a regex', args: '{ regex: z.string(), path: z.string().optional() }' },
  { name: 'todo-read', desc: 'Read TODOs', args: '{ filter: z.string().optional() }' },
  { name: 'todo-write', desc: 'Write a new TODO', args: '{ task: z.string(), status: z.string().optional() }' },
  { name: 'diff-view', desc: 'View git diff of a file', args: '{ path: z.string() }' },
  { name: 'memory-write', desc: 'Write to memory', args: '{ key: z.string(), value: z.string() }' }
];

tools.forEach(t => {
  const code = `import { z } from 'zod';
import { ToolDefinition, ToolResult } from '../types.js';

export const ${t.name.replace(/-([a-z])/g, g => g[1].toUpperCase())}Tool: ToolDefinition<any> = {
  name: '${t.name}',
  description: '${t.desc}',
  parameters: z.object(${t.args}),
  execute: async (args: any): Promise<ToolResult> => {
    return { result: "Success" };
  },
};
`;
  fs.writeFileSync(`src/tools/builtin/${t.name}.ts`, code);
});
