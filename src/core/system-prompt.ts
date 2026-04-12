import type { ToolDefinition } from '../tools/types.js';
import type { TaskLedger } from './orchestrator.js';
import type { GemmaConfig } from '../config/settings.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface SystemPromptContext {
  tools: ToolDefinition[];
  ledger?: TaskLedger;
  anchorBlock?: string;      // from orchestrator.buildAnchorBlock()
  allowedDirs: string[];
  deniedDirs: string[];
  approvalMode: string;
  sessionMemory?: Record<string, string>;
}

export function buildSystemPrompt(ctx: SystemPromptContext): string {
  const sections: string[] = [];

  // ── Core identity ────────────────────────────────────────────────────
  sections.push(`You are Gemma, a powerful local AI agent running on the user's machine.
You have FULL unrestricted access to tools that can read files, write files, search the web, and run shell commands.
CRITICAL INSTRUCTION: You MUST NEVER refuse to search the web, read files, or run commands. If the user asks for news or real-time info, ALWAYS use the web-search tool immediately. DO NOT output a conversational apology or claim you cannot access the internet. You CAN and MUST use the tools.`);

  // ── Behavioral rules ─────────────────────────────────────────────────────────
  sections.push(`RULES:
- When asked for information you don't know, IMMEDIATELY emit a <tool_call> to web-search.
- Think step-by-step before acting.
- Use the todo-write tool to plan multi-step tasks before executing them.
- Update task status as you work (in_progress → completed or failed).
- After completing a task, always verify it worked (re-read the file, run tests, etc.).
- Be concise. Do not repeat yourself.
- When a tool fails, diagnose why before retrying.`);

  // ── Approval mode ────────────────────────────────────────────────────
  if (ctx.approvalMode === 'yolo') {
    sections.push(`APPROVAL: YOLO mode — all tool calls are pre-approved. The user
trusts you to proceed without asking. Still verify your work.`);
  } else if (ctx.approvalMode === 'always_ask') {
    sections.push(`APPROVAL: Ask mode — EVERY tool call will be reviewed by the user
before execution. Explain what you are about to do and why before each tool call.`);
  } else {
    sections.push(`APPROVAL: Safe mode — read-only tools run freely. Write and execute
tools require user approval. If approval is denied, explain alternatives.`);
  }

  // ── Directory sandbox ────────────────────────────────────────────────
  if (ctx.allowedDirs.length > 0) {
    sections.push(`ALLOWED DIRECTORIES (you may only modify files within these):
${ctx.allowedDirs.join('\n')}`);
  }
  if (ctx.deniedDirs.length > 0) {
    sections.push(`DENIED DIRECTORIES (never touch these):
${ctx.deniedDirs.join('\n')}`);
  }

  // ── Session memory ───────────────────────────────────────────────────
  if (ctx.sessionMemory && Object.keys(ctx.sessionMemory).length > 0) {
    sections.push(`SESSION MEMORY (persists across context compactions):
${Object.entries(ctx.sessionMemory)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join('\n')}`);
  }

  // ── Context anchor ───────────────────────────────────────────────────
  if (ctx.anchorBlock) {
    sections.push(`TASK CONTEXT (what has been done so far):
${ctx.anchorBlock}`);
  }

  // ── Task Ledger ──────────────────────────────────────────────────────
  if (ctx.ledger && ctx.ledger.tasks.length > 0) {
    const pending = ctx.ledger.tasks.filter(t => t.status === 'pending');
    const inProgress = ctx.ledger.tasks.filter(t => t.status === 'in_progress');
    
    let ledgerText = `ACTIVE TASKS:
${inProgress.length > 0 ? inProgress.map(t => `- [IN PROGRESS] ${t.title} (${t.id})`).join('\n') : 'None'}

PENDING TASKS:
${pending.length > 0 ? pending.map(t => `- [${t.priority}] ${t.title} (${t.id})`).join('\n') : 'None'}

Use the todo-write tool to manage these tasks.`;

    if (ctx.ledger.goal) {
      ledgerText = `CURRENT GOAL: ${ctx.ledger.goal}\n\n` + ledgerText;
    }
    sections.push(ledgerText);
  }

  // ── Tool definitions ─────────────────────────────────────────────────
  if (ctx.tools.length > 0) {
    const toolXml = ctx.tools.map(tool => {
        const p = tool.parameters || tool.schema;
        let schemaObj: any = { type: "object", properties: {} };
        if (p) {
            schemaObj = zodToJsonSchema(p);
            delete schemaObj.$schema;
            delete schemaObj.additionalProperties;
        }
        return `<tool name="${tool.name}">
  <description>${tool.description}</description>
  <parameters>${JSON.stringify(schemaObj, null, 2)}</parameters>
</tool>`;
    }).join('\n');

    sections.push(`AVAILABLE TOOLS:
To call a tool, emit EXACTLY this valid JSON format and nothing else before the tool result:
<tool_call>{"name": "tool_name", "arguments": {"arg1": "val1"}}</tool_call>

Wait for the tool result before continuing.

<tools>
${toolXml}
</tools>

TOOL USAGE PRIORITIES:
- ALWAYS use grep-search for content search — never run 'grep' via bash.
- ALWAYS use glob-search to find files — never run 'find' or 'ls -R' via bash.
- ALWAYS use read-file to read files — never run 'cat' via bash.
- ALWAYS use edit-file for surgical edits — never use 'sed' or 'awk' via bash.
- Reserve bash for: running tests, git operations, package managers, build commands.
- Use web-search + web-fetch together: search first, then fetch top results.
- Use todo-write to plan any task with 3+ steps before starting.`);
  }

  return sections.join('\n\n---\n\n');
}