import { glob } from 'glob';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { ToolRegistry } from '../tools/registry.js';
import { Skill } from './types.js';

export class SkillLoader {
  constructor(private registry: ToolRegistry) {}

  async loadAll(): Promise<void> {
    const skillsDir = path.join(os.homedir(), '.gemma-cli', 'skills');
    if (!(await fs.pathExists(skillsDir))) {
      return;
    }

    try {
      const searchPattern = path.posix.join(skillsDir.replace(/\\/g, '/'), '*', 'package.json');
      const files = await glob(searchPattern);

      for (const pkgPath of files) {
        try {
          await this.loadSkill(pkgPath);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`Failed to open skill at ${pkgPath}: ${msg}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error searching for skills plugins: ${msg}`);
    }
  }

  private async loadSkill(pkgPathStr: string): Promise<void> {
    const pkgStr = await fs.readFile(pkgPathStr, 'utf-8');
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(pkgStr);
    } catch {
      throw new Error('Invalid package.json');
    }

    const gemmaCli = pkg.gemmaCli as Record<string, unknown> | undefined;
    if (!gemmaCli || !Array.isArray(gemmaCli.tools)) {
      return; // Not a gemma skill
    }

    const skillDir = path.dirname(pkgPathStr);
    // Determine the main entry point to load. Assume 'index.js' if not specified in package.js 'main'
    const mainFile = typeof pkg.main === 'string' ? pkg.main : 'index.js';
    const entryPath = path.join(skillDir, mainFile);

    if (!(await fs.pathExists(entryPath))) {
      throw new Error(`Entry file ${entryPath} does not exist`);
    }

    // Dynamic import to load the skill module
    const fileUrl = new URL(`file://${process.platform === 'win32' && !entryPath.startsWith('/') ? '/' : ''}${entryPath.replace(/\\/g, '/')}`);
    
    let imported: Skill;
    try {
      imported = await import(fileUrl.href);
    } catch (err: unknown) {
      throw new Error(`Failed to import ${fileUrl.href}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!imported || !Array.isArray(imported.tools)) {
      throw new Error(`Module ${mainFile} must export a 'tools' array`);
    }

    for (const tool of imported.tools) {
      if (!tool.name || !tool.description || !tool.parameters || typeof tool.execute !== 'function') {
         logger.warn(`Skipping invalid tool inside skill ${pkgPathStr}`);
         continue;
      }

      this.registry.register({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as any, // Cast because skill zod object could be arbitrary mapping
        execute: async (args) => {
           try {
             return await tool.execute(args);
           } catch (err: unknown) {
             return { error: err instanceof Error ? err.message : String(err) };
           }
        }
      });
    }
    
    logger.info(`Successfully loaded skill tools from ${pkgPathStr}`);
  }
}
