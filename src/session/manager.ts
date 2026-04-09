import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionMessage } from './types.js';
import { logger } from '../utils/logger.js';

export class SessionManager {
  private sessionsDir: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.sessionsDir = path.join(os.homedir(), '.gemma-cli', 'sessions');
    fs.ensureDirSync(this.sessionsDir);
  }

  create(modelId: string): Session {
    const id = uuidv4();
    const now = new Date().toISOString();
    return {
      id,
      createdAt: now,
      updatedAt: now,
      modelId,
      title: 'New Session',
      messages: [],
      tokenCount: 0,
    };
  }

  async persist(session: Session): Promise<void> {
    try {
      session.updatedAt = new Date().toISOString();

      if (session.messages.length > 0 && session.title === 'New Session') {
        const firstUserMsg = session.messages.find(m => m.role === 'user');
        if (firstUserMsg) {
          session.title = firstUserMsg.content.substring(0, 60).replace(/\n/g, ' ');
        }
      }

      const fp = path.join(this.sessionsDir, `${session.id}.json`);
      await fs.writeJson(fp, session, { spaces: 2 });
    } catch (err: unknown) {
      logger.error(`Failed to save session ${session.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  scheduleSave(session: Session): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persist(session);
      this.saveTimer = null;
    }, 500); // Configured as debounced 500ms
  }

  async list(): Promise<Session[]> {
    try {
      if (!(await fs.pathExists(this.sessionsDir))) return [];
      
      const files = await fs.readdir(this.sessionsDir);
      const sessions: Session[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const fp = path.join(this.sessionsDir, file);
          const data = await fs.readJson(fp);
          sessions.push(data as Session);
        } catch (err) {
          logger.warn(`Failed to read session file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // Sort by updatedAt descending
      return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err: unknown) {
      logger.error(`Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async load(idPrefix: string): Promise<Session | null> {
    const sessions = await this.list();
    const match = sessions.find(s => s.id.startsWith(idPrefix));
    return match || null;
  }

  async getMostRecent(): Promise<Session | null> {
    const sessions = await this.list();
    return sessions.length > 0 ? sessions[0] : null;
  }

  async delete(id: string): Promise<void> {
    const fp = path.join(this.sessionsDir, `${id}.json`);
    if (await fs.pathExists(fp)) {
      await fs.remove(fp);
      logger.info(`Deleted session file: ${id}.json`);
    }
  }

  async export(session: Session, targetFilename: string): Promise<string> {
    let md = `# ${session.title}\n\n`;
    md += `**Model:** ${session.modelId}\n`;
    md += `**Date:** ${new Date(session.createdAt).toLocaleString()}\n\n---\n\n`;

    for (const msg of session.messages) {
      if (msg.role === 'user') {
        md += `### User\n\n${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        md += `### Assistant\n\n${msg.content}\n\n`;
      } else if (msg.role === 'tool_call') {
        md += `### Tool Call (${msg.toolName})\n\n\`\`\`json\n${JSON.stringify(msg.toolArgs, null, 2)}\n\`\`\`\n\n`;
      } else if (msg.role === 'tool_result') {
        md += `### Tool Result\n\n\`\`\`\n${msg.content}\n\`\`\`\n\n`;
      }
    }

    const outPath = path.resolve(targetFilename);
    await fs.writeFile(outPath, md, 'utf-8');
    return outPath;
  }
}
