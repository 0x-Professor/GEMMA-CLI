import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SESSIONS_DIR } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import type { GemmaEngine } from './inference.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolExecutor } from '../tools/executor.js';
import { maybeCompact, totalTokens } from './compaction.js';
import type { ConversationMessage } from './conversation.js';

// ── Task Ledger (Todo System) ─────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependsOn?: string[];          // task IDs that must complete first
  requiresApproval?: boolean;    // human-in-the-loop gate
  result?: string;               // outcome when completed
  error?: string;                // failure reason
  startedAt?: string;
  completedAt?: string;
  toolCalls?: number;            // how many tool calls this task used
}

export interface TaskLedger {
  sessionId: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  checkpoints: CheckpointEntry[];
  completedSteps: string[];      // summary of what was done — for context anchoring
}

export interface CheckpointEntry {
  taskId: string;
  timestamp: string;
  contextSnapshot: string;       // compressed summary of context at this point
  filesModified: string[];
  tokenCount: number;
}

// ── Checkpoint persistence ────────────────────────────────────────────────────

function ledgerPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.ledger.json`);
}

export function saveLedger(ledger: TaskLedger): void {
  ledger.updatedAt = new Date().toISOString();
  writeFileSync(ledgerPath(ledger.sessionId), JSON.stringify(ledger, null, 2));
}

export function loadLedger(sessionId: string): TaskLedger | null {
  const path = ledgerPath(sessionId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TaskLedger;
  } catch { return null; }
}

// ── Stuck Detection ───────────────────────────────────────────────────────────
// If the same task has been in_progress for > 3 minutes with no tool calls,
// it is considered stuck. The user is notified.

const STUCK_TIMEOUT_MS = 3 * 60 * 1000;

export function isStuck(task: Task): boolean {
  if (task.status !== 'in_progress' || !task.startedAt) return false;
  return Date.now() - new Date(task.startedAt).getTime() > STUCK_TIMEOUT_MS;
}

// ── Orchestrator Class ────────────────────────────────────────────────────────

export class TaskOrchestrator {
  private ledger: TaskLedger;
  private stuckCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sessionId: string,
    private engine: GemmaEngine,
    private toolRegistry: ToolRegistry,
    private toolExecutor: ToolExecutor,
    private contextLength: number,
    private onEvent: OrchestratorEvent,
  ) {
    // Load existing ledger or create fresh
    this.ledger = loadLedger(sessionId) ?? {
      sessionId,
      goal: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: [],
      checkpoints: [],
      completedSteps: [],
    };
  }

  // ── Task Management ─────────────────────────────────────────────────────

  setGoal(goal: string): void {
    this.ledger.goal = goal;
    saveLedger(this.ledger);
  }

  addTasks(tasks: Omit<Task, 'id'>[]): void {
    for (const t of tasks) {
      const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.ledger.tasks.push({ id, ...t });
    }
    saveLedger(this.ledger);
    this.onEvent({ type: 'tasks_updated', ledger: this.ledger });
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const task = this.ledger.tasks.find(t => t.id === id);
    if (!task) return;
    Object.assign(task, updates);
    if (updates.status === 'completed') task.completedAt = new Date().toISOString();
    if (updates.status === 'in_progress') task.startedAt = new Date().toISOString();
    saveLedger(this.ledger);
    this.onEvent({ type: 'task_updated', task });
  }

  getNextTask(): Task | null {
    // Find highest-priority pending task with all dependencies met
    const completed = new Set(
      this.ledger.tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    return this.ledger.tasks
      .filter(t => t.status === 'pending')
      .filter(t => !t.dependsOn || t.dependsOn.every(dep => completed.has(dep)))
      .sort((a, b) => {
        const prio = { critical: 0, high: 1, medium: 2, low: 3 };
        return prio[a.priority] - prio[b.priority];
      })[0] ?? null;
  }

  getLedger(): TaskLedger { return this.ledger; }

  // ── Checkpoint ───────────────────────────────────────────────────────────

  async checkpoint(
    taskId: string,
    messages: ConversationMessage[],
    filesModified: string[] = [],
  ): Promise<void> {
    // Compact context before checkpointing
    const { messages: compacted } = await maybeCompact(
      messages, this.contextLength, this.engine
    );

    // Build a short context snapshot string for the ledger
    const snapshot = [
      `Goal: ${this.ledger.goal}`,
      `Completed: ${this.ledger.tasks.filter(t => t.status === 'completed').map(t => t.title).join(', ')}`,
      `Current: ${taskId}`,
      `Files changed: ${filesModified.join(', ')}`,
    ].join('\n');

    this.ledger.checkpoints.push({
      taskId,
      timestamp: new Date().toISOString(),
      contextSnapshot: snapshot,
      filesModified,
      tokenCount: totalTokens(compacted),
    });

    // Record a completed step summary for context anchoring
    const task = this.ledger.tasks.find(t => t.id === taskId);
    if (task?.result) {
      this.ledger.completedSteps.push(`✓ ${task.title}: ${task.result}`);
    }

    saveLedger(this.ledger);
    this.onEvent({ type: 'checkpoint', taskId, tokenCount: totalTokens(compacted) });
  }

  // ── Stuck Detection ──────────────────────────────────────────────────────

  startStuckDetection(): void {
    this.stuckCheckInterval = setInterval(() => {
      for (const task of this.ledger.tasks) {
        if (isStuck(task)) {
          this.onEvent({ type: 'task_stuck', task });
        }
      }
    }, 30_000); // check every 30s
  }

  stopStuckDetection(): void {
    if (this.stuckCheckInterval) {
      clearInterval(this.stuckCheckInterval);
      this.stuckCheckInterval = null;
    }
  }

  // ── Context Anchor Block ─────────────────────────────────────────────────
  // Returns a compact string summarizing all past work.
  // Injected at the start of every new inference call.

  buildAnchorBlock(): string {
    if (!this.ledger.goal && this.ledger.completedSteps.length === 0) return '';

    const lines: string[] = [];
    if (this.ledger.goal) lines.push(`GOAL: ${this.ledger.goal}`);
    if (this.ledger.completedSteps.length > 0) {
      lines.push('COMPLETED STEPS:');
      lines.push(...this.ledger.completedSteps.slice(-10)); // last 10 steps max
    }

    const inProgress = this.ledger.tasks.filter(t => t.status === 'in_progress');
    if (inProgress.length > 0) {
      lines.push(`CURRENT: ${inProgress.map(t => t.title).join(', ')}`);
    }

    const pending = this.ledger.tasks.filter(t => t.status === 'pending');
    if (pending.length > 0) {
      lines.push(`REMAINING: ${pending.map(t => t.title).join(', ')}`);
    }

    return lines.join('\n');
  }
}

// ── Event System ─────────────────────────────────────────────────────────────

export type OrchestratorEventPayload =
  | { type: 'tasks_updated'; ledger: TaskLedger }
  | { type: 'task_updated'; task: Task }
  | { type: 'task_stuck'; task: Task }
  | { type: 'checkpoint'; taskId: string; tokenCount: number }
  | { type: 'compaction'; phase: string; reductionPercent: number };

export type OrchestratorEvent = (event: OrchestratorEventPayload) => void;