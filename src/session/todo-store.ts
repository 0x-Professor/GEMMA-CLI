// In-session singleton for the TodoWrite/TodoRead tools to access.
import type { Task } from '../core/orchestrator.js';

class TodoStore {
  private tasks: Task[] = [];

  getAll(): Task[] { return [...this.tasks]; }

  add(task: Omit<Task, 'id'>): Task {
    const id = `todo-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const t: Task = { id, ...task } as Task;
    this.tasks.push(t);
    return t;
  }

  update(id: string, updates: Partial<Task>): Task | null {
    const t = this.tasks.find(t => t.id === id);
    if (!t) return null;
    Object.assign(t, updates);
    return t;
  }

  remove(id: string): boolean {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.id !== id);
    return this.tasks.length < before;
  }

  clear(): void { this.tasks = []; }
}

export const SessionTodoStore = new TodoStore();