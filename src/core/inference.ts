import { getLlama, Llama, LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import { ConversationMessage } from './conversation.js';
import { detectGpu } from '../system/requirements.js';
import { GEMMA_MODELS, ModelId } from '../utils/constants.js';
import path from 'path';
import os from 'os';

export class GemmaEngine {
  private llama?: Llama;
  private model?: LlamaModel;
  private ctx?: LlamaContext;
  private session?: LlamaChatSession;
  private tokensPerSec: number = 0;

  async loadModel(modelId: string, systemPrompt?: string): Promise<void> {
    const config = GEMMA_MODELS[modelId as ModelId];
    if (!config) throw new Error(`Unknown model: ${modelId}`);

    const baseDir = process.env.GEMMA_HOME || path.join(os.homedir(), '.gemma-cli');
    const modelPath = path.join(baseDir, 'models', config.filename);

    const fs = await import('fs/promises');
    try {
      await fs.access(modelPath);
    } catch {
      throw new Error(`Model file not found. Please run '/model' to download it first.`);
    }

    // Suppress noisy node-llama-cpp fallback warnings that break the TUI
    const cw = console.warn;
    const ce = console.error;
    const cl = console.log;
    console.warn = () => {};
    console.error = () => {};
    console.log = () => {};

    try {
      // Use 'auto' to let node-llama-cpp automatically locate a prebuilt binary
      // for the appropriate GPU or fallback to CPU seamlessly avoiding build crashes
      this.llama = await getLlama({ gpu: 'auto', progressLogs: false, build: 'never' });
      this.model = await this.llama.loadModel({ modelPath });
      this.ctx = await this.model.createContext({ contextSize: Math.min(config.contextLength, 8192) });
      const seq = this.ctx.getSequence();

      this.session = new LlamaChatSession({ 
        contextSequence: seq,
        systemPrompt
      });
    } finally {
      console.warn = cw;
      console.error = ce;
      console.log = cl;
    }
  }

  async *streamChat(
    messages: ConversationMessage[],
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    if (!this.session) throw new Error('Model not loaded');
    
    const lastUserMessage = messages[messages.length - 1];
    
    let fullResponse = '';
    
    // Default recommendations for Gemma
    const startTime = Date.now();
    let generatedTokens = 0;

    const response = await this.session.prompt(lastUserMessage.content, {
      onTextChunk: (chunk: string) => {
        generatedTokens++;
        onToken(chunk);
      },
      signal,
      temperature: 1.0,
      topK: 64,
      topP: 0.95,
      minP: 0.0,
      repeatPenalty: { penalty: 1.0 }
    });

    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > 0) {
        this.tokensPerSec = generatedTokens / elapsed;
    }

    fullResponse = response;
    yield fullResponse;
  }

  async unloadModel(): Promise<void> {
    if (this.ctx) await this.ctx.dispose();
    if (this.model) await this.model.dispose();
    if (this.llama) await this.llama.dispose();
  }

  getStats(): { contextUsed: number; contextMax: number; tokensPerSec: number } {
    return {
      contextUsed: this.ctx?.contextSize || 0,
      contextMax: this.ctx?.contextSize || 0,
      tokensPerSec: this.tokensPerSec
    };
  }
}
