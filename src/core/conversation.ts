export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
  content: string;
}

export class ConversationHistory {
  public messages: ConversationMessage[] = [];
  public tokenCount: number = 0;
  private maxTokens: number;
  private compactThreshold: number = 0.85;

  constructor(maxTokens: number) {
    this.maxTokens = maxTokens;
  }

  addMessage(message: ConversationMessage, tokens: number) {
    this.messages.push(message);
    this.tokenCount += tokens;

    const fillRatio = this.tokenCount / this.maxTokens;
    if (fillRatio >= this.compactThreshold) {
      console.warn(`\n⚠ Context ${(fillRatio * 100).toFixed(0)}% full — type /compact to summarise.`);
    }
  }

  clear() {
    this.messages = [];
    this.tokenCount = 0;
  }
}
