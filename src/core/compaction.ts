import type { ConversationMessage } from './conversation.js';
import type { GemmaEngine } from './inference.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompactionPhase = 'none' | 'mask' | 'summarize' | 'emergency';

export interface CompactionResult {
  phase: CompactionPhase;
  tokensBefore: number;
  tokensAfter: number;
  reductionPercent: number;
  messagesCompacted: number;
  anchorSummary?: string;    // set after Phase 2/3 summarization
}

export interface CompactionThresholds {
  maskAt: number;            // fraction of contextLength. Default 0.70
  summarizeAt: number;       // Default 0.80
  emergencyAt: number;       // Default 0.90
  keepRecentTurns: number;   // verbatim-protected tail. Default 6 messages
}

const DEFAULT_THRESHOLDS: CompactionThresholds = {
  maskAt: 0.70,
  summarizeAt: 0.80,
  emergencyAt: 0.90,
  keepRecentTurns: 6,
};

// ── Token approximation ───────────────────────────────────────────────────────
// GPT-style: ~4 chars per token. Close enough for local models.
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function totalTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + approxTokens(m.content), 0);
}

// ── Phase 1: Observation Masking ──────────────────────────────────────────────
// Replace tool_result content with a compact placeholder.
// The tool_call stays visible so the model knows what ran.
// Only masks tool_results that are NOT in the keepRecentTurns window.

export function applyObservationMasking(
  messages: ConversationMessage[],
  keepRecentTurns: number
): { messages: ConversationMessage[]; maskedCount: number } {
  const protectedStart = Math.max(0, messages.length - keepRecentTurns);
  let maskedCount = 0;

  const updated = messages.map((msg, idx) => {
    if (idx >= protectedStart) return msg;                // protected tail
    if (msg.role !== 'tool_result') return msg;           // only mask results
    if (msg.content.startsWith('[masked:')) return msg;   // already masked

    const originalTokens = approxTokens(msg.content);
    maskedCount++;
    return {
      ...msg,
      content: `[masked: tool output ~${originalTokens} tokens]`,
    };
  });

  return { messages: updated, maskedCount };
}

// ── Phase 2: Incremental Summarization ───────────────────────────────────────
// Summarize the oldest N user/assistant pairs into one anchor block.
// Uses the same GemmaEngine — no external model needed.

const SUMMARIZATION_PROMPT = `You are a context compaction assistant. The following is a portion of a conversation between a user and an AI assistant. Summarize it into a compact, factual block that preserves:
- All file paths, line numbers, and code snippets mentioned
- All errors, their root causes, and fixes applied
- All decisions made and their rationale
- All task objectives and their completion status
- Any user preferences or constraints stated

Format the summary as a structured block with clear headings.
Be concise but complete — nothing important should be lost.
Do NOT include your meta-commentary. Output only the summary block.

CONVERSATION TO SUMMARIZE:
`;

export async function summarizeChunk(
  messages: ConversationMessage[],
  engine: GemmaEngine
): Promise<string> {
  const text = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const prompt = SUMMARIZATION_PROMPT + text;
  let summary = '';

  // Use streamChat but collect all tokens into one string
  for await (const _ of engine.streamChat(
    [{ role: 'user', content: prompt }],
    (token) => { summary += token; },
  )) { /* collect */ }

  return summary.trim();
}

export async function applyIncrementalSummarization(
  messages: ConversationMessage[],
  keepRecentTurns: number,
  engine: GemmaEngine
): Promise<{ messages: ConversationMessage[]; summary: string }> {
  // Split: old chunk to summarize | recent tail to keep verbatim
  const splitPoint = Math.max(0, messages.length - keepRecentTurns);
  const oldChunk = messages.slice(0, splitPoint);
  const recentTail = messages.slice(splitPoint);

  if (oldChunk.length === 0) {
    return { messages, summary: '' };
  }

  logger.info(`Compacting ${oldChunk.length} messages via summarization`);
  const summary = await summarizeChunk(oldChunk, engine);

  // Inject the summary as a synthetic system-level message
  const anchorMessage: ConversationMessage = {
    role: 'assistant',
    content: `[CONTEXT SUMMARY — earlier conversation compacted]\n\n${summary}`,
    timestamp: new Date().toISOString(),
    tokenCount: approxTokens(summary),
  };

  return {
    messages: [anchorMessage, ...recentTail],
    summary,
  };
}

// ── Phase 3: Emergency Compaction ─────────────────────────────────────────────
// Summarize the ENTIRE history into one anchor + keep tail verbatim.
// Triggered at 90% context usage. Last resort.

export async function applyEmergencyCompaction(
  messages: ConversationMessage[],
  engine: GemmaEngine
): Promise<{ messages: ConversationMessage[]; summary: string }> {
  const KEEP_LAST = 4;
  const toSummarize = messages.slice(0, Math.max(0, messages.length - KEEP_LAST));
  const tail = messages.slice(-KEEP_LAST);

  if (toSummarize.length === 0) return { messages, summary: '' };

  logger.warn(`Emergency compaction: summarizing ${toSummarize.length} messages`);
  const summary = await summarizeChunk(toSummarize, engine);

  const anchor: ConversationMessage = {
    role: 'assistant',
    content: `[EMERGENCY CONTEXT SUMMARY — ${toSummarize.length} messages compacted]\n\n${summary}`,
    timestamp: new Date().toISOString(),
    tokenCount: approxTokens(summary),
  };

  return { messages: [anchor, ...tail], summary };
}

// ── Main Compaction Orchestrator ───────────────────────────────────────────────
// Called by ConversationHistory before every LLM call.
// Decides which phase to apply based on current token usage.

export async function maybeCompact(
  messages: ConversationMessage[],
  contextLength: number,
  engine: GemmaEngine,
  thresholds: CompactionThresholds = DEFAULT_THRESHOLDS,
  onPhaseStart?: (phase: CompactionPhase, usage: number) => void,
): Promise<{ messages: ConversationMessage[]; result: CompactionResult }> {
  const used = totalTokens(messages);
  const usage = used / contextLength;

  const noOp: CompactionResult = {
    phase: 'none', tokensBefore: used, tokensAfter: used,
    reductionPercent: 0, messagesCompacted: 0,
  };

  if (usage < thresholds.maskAt) {
    return { messages, result: noOp };
  }

  // Phase 1: Observation masking (free — no LLM call)
  if (usage >= thresholds.maskAt && usage < thresholds.summarizeAt) {
    onPhaseStart?.('mask', usage);
    const { messages: masked, maskedCount } = applyObservationMasking(
      messages, thresholds.keepRecentTurns
    );
    const after = totalTokens(masked);
    return {
      messages: masked,
      result: {
        phase: 'mask',
        tokensBefore: used, tokensAfter: after,
        reductionPercent: Math.round((1 - after / used) * 100),
        messagesCompacted: maskedCount,
      },
    };
  }

  // Phase 2: Incremental summarization
  if (usage >= thresholds.summarizeAt && usage < thresholds.emergencyAt) {
    onPhaseStart?.('summarize', usage);
    const { messages: compacted, summary } = await applyIncrementalSummarization(
      messages, thresholds.keepRecentTurns, engine
    );
    const after = totalTokens(compacted);
    return {
      messages: compacted,
      result: {
        phase: 'summarize',
        tokensBefore: used, tokensAfter: after,
        reductionPercent: Math.round((1 - after / used) * 100),
        messagesCompacted: messages.length - compacted.length,
        anchorSummary: summary,
      },
    };
  }

  // Phase 3: Emergency
  onPhaseStart?.('emergency', usage);
  const { messages: compacted, summary } = await applyEmergencyCompaction(messages, engine);
  const after = totalTokens(compacted);
  return {
    messages: compacted,
    result: {
      phase: 'emergency',
      tokensBefore: used, tokensAfter: after,
      reductionPercent: Math.round((1 - after / used) * 100),
      messagesCompacted: messages.length - compacted.length,
      anchorSummary: summary,
    },
  };
}