export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
  content: string;
  timestamp: string;
  tokenCount?: number;
  toolName?: string;
  toolArgs?: unknown;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  modelId: string;
  title: string;          // first user message, max 60 chars
  messages: SessionMessage[];
  tokenCount: number;
}
