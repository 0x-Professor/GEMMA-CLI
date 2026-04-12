import type { ToolDefinition } from '../tools/types.js';
import type { TaskLedger } from './orchestrator.js';
import type { GemmaConfig } from '../config/settings.js';

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
  sections.push(`You are Gemma, a powerful local AI agent. You run entirely on the
user's machine with no cloud dependency. You have access to tools to help with
real-world tasks: reading and writing files, searching the web, executing shell
commands, and more.`);

  // ── Behavioral rules ─────────────────────────────────────────────────
  sections.push(`RULES:
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
    const toolXml = ctx.tools.map(tool => `<tool name="${tool.name}">
  <description>${tool.description}</description>
  <parameters>${JSON.stringify((tool.schema ?? tool.parameters)?._def ?? {}, null, 2)}</parameters>
  </tool>`).join('\n');

    sections.push(`AVAILABLE TOOLS:
To call a tool, emit EXACTLY this format and nothing else before the tool result:
<tool_call>{"name": "tool_name", "arguments": {<args>}}</tool_call>

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