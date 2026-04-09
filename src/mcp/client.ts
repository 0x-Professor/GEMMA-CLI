import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../utils/logger.js';

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'streamable-http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export class MCPClientWrapper {
  public client: Client;
  private config: MCPServerConfig;
  private retryCount = 0;
  private maxRetries = 5;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.client = new Client({ name: 'gemma-cli', version: '1.0.0' }, {
      capabilities: {}
    });
  }

  async connect(): Promise<void> {
    try {
      if (this.config.transport === 'stdio') {
        if (!this.config.command) throw new Error('Command required for stdio transport');
        const mergedEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
           if (v !== undefined) mergedEnv[k] = v;
        }
        if (this.config.env) {
           for (const [k, v] of Object.entries(this.config.env)) {
             mergedEnv[k] = v;
           }
        }
        const transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args || [],
          env: mergedEnv,
        });
        await this.client.connect(transport);
        transport.onclose = () => { this.handleDisconnect().catch(e => logger.error(`Disconnect handling failed: ${String(e)}`)); };
      } else if (this.config.transport === 'streamable-http') {
        if (!this.config.url) throw new Error('URL required for HTTP transport');
        try {
          const transport = new StreamableHTTPClientTransport(new URL(this.config.url));
          await this.client.connect(transport);
          transport.onclose = () => { this.handleDisconnect().catch(e => logger.error(`Disconnect handling failed: ${String(e)}`)); };
        } catch (err: unknown) {
          logger.warn(`Failed StreamableHTTP for ${this.config.name}, falling back to SSE`);
          const sseTransport = new SSEClientTransport(new URL(this.config.url));
          await this.client.connect(sseTransport);
          sseTransport.onclose = () => { this.handleDisconnect().catch(e => logger.error(`Disconnect handling failed: ${String(e)}`)); };
        }
      } else if (this.config.transport === 'sse') {
        if (!this.config.url) throw new Error('URL required for SSE transport');
        const transport = new SSEClientTransport(new URL(this.config.url));
        await this.client.connect(transport);
        transport.onclose = () => { this.handleDisconnect().catch(e => logger.error(`Disconnect handling failed: ${String(e)}`)); };
      }
      this.retryCount = 0; // reset on success
    } catch (err: unknown) {
      await this.handleDisconnect();
      throw err;
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      logger.error(`Max retries reached for MCP server ${this.config.name}`);
      return;
    }
    this.retryCount++;
    const backoff = Math.min(1000 * Math.pow(2, this.retryCount - 1), 30000);
    logger.info(`Reconnecting to MCP server ${this.config.name} in ${backoff}ms...`);
    await new Promise(res => setTimeout(res, backoff));
    try {
      await this.connect();
    } catch {
      // Error already propagated and logged inside connect/handleDisconnect loop
    }
  }

  async listTools() {
    return await this.client.listTools();
  }

  async callTool(name: string, args: unknown) {
    return await this.client.callTool({ name, arguments: args as Record<string, unknown> });
  }
}
