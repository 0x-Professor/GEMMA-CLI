import { MCPClientWrapper, MCPServerConfig } from './client.js';
import { ToolRegistry } from '../tools/registry.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

export class MCPManager {
  private servers = new Map<string, MCPClientWrapper>();
  public status = new Map<string, 'connected' | 'error' | 'disconnected'>();

  constructor(private registry: ToolRegistry) {}

  async connectAll(configs: MCPServerConfig[]): Promise<void> {
    for (const config of configs) {
      if (!config.enabled) continue;
      
      const wrapper = new MCPClientWrapper(config);
      this.servers.set(config.name, wrapper);
      
      try {
        await wrapper.connect();
        this.status.set(config.name, 'connected');
        await this.registerTools(wrapper, config.name);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to connect to MCP server ${config.name}: ${msg}`);
        this.status.set(config.name, 'error');
      }
    }
  }

  private async registerTools(wrapper: MCPClientWrapper, serverName: string): Promise<void> {
    try {
      const { tools } = await wrapper.listTools();
      for (const t of tools) {
        this.registry.register({
          name: `${serverName}_${t.name}`,
          description: `[MCP: ${serverName}] ${t.description || ''}`,
          parameters: z.object({}).catchall(z.unknown()), // Accepting any params for MCP pass-through
          execute: async (args) => {
            try {
              const response = await wrapper.callTool(t.name, args);
              
              if (response && Array.isArray(response.content)) {
                const textContent = response.content
                  .map((c: unknown) => {
                    if (c && typeof c === 'object' && 'text' in c) {
                      return String((c as Record<string, unknown>).text);
                    }
                    return JSON.stringify(c);
                  })
                  .join('\\n');
                return { result: textContent };
              }
              
              return { result: JSON.stringify(response) };
            } catch (err: unknown) {
              return { error: err instanceof Error ? err.message : String(err) };
            }
          }
        });
      }
    } catch (err: unknown) {
       const msg = err instanceof Error ? err.message : String(err);
       logger.error(`Error listing tools for MCP server ${serverName}: ${msg}`);
    }
  }

  getServerStatus(name: string): string {
     return this.status.get(name) || 'disconnected';
  }
}
