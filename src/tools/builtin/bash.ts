import { z } from 'zod';
import { spawn } from 'child_process';
import { ToolDefinition } from '../types.js';

export const bashTool: ToolDefinition<{ command: z.ZodString }> = {
  name: 'bash',
  description: 'Execute a shell command',
  parameters: z.object({
    command: z.string().describe('The shell command to run'),
  }),
  execute: async ({ command }) => {
    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const args = process.platform === 'win32' ? ['/c', command] : ['-c', command];
      
      const child = spawn(shell, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? -1,
        });
      });

      child.on('error', (err) => {
        resolve({ error: err.message });
      });
    });
  },
};
