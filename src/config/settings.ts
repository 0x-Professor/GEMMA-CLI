// Only Phase 1 requirement: implement settings configuration using conf
import Conf from 'conf';
import { z } from 'zod';
import { APP_NAME, ModelId } from '../utils/constants.js';

export const GemmaConfigSchema = z.object({
  model: z.string(), // Represents the chosen ModelId
  allowedDirs: z.array(z.string()).default([]),
  deniedDirs: z.array(z.string()).default([]),
  approvalMode: z.enum(['always_ask', 'risky_only', 'yolo']).default('risky_only'),
  toolsEnabled: z.boolean().default(true),
});

export type GemmaConfig = z.infer<typeof GemmaConfigSchema>;

const configManager = new Conf<GemmaConfig>({
  projectName: APP_NAME,
  schema: {
    model: { type: 'string', default: 'gemma-3-4b-it' },
    allowedDirs: { type: 'array', items: { type: 'string' }, default: [] },
    deniedDirs: { type: 'array', items: { type: 'string' }, default: [] },
    approvalMode: { type: 'string', enum: ['always_ask', 'risky_only', 'yolo'], default: 'risky_only' },
    toolsEnabled: { type: 'boolean', default: true },
  },
});

export function loadConfig(): GemmaConfig {
  return configManager.store;
}

export function saveConfig(config: GemmaConfig): void {
  configManager.store = config;
}

export function updateConfig(updates: Partial<GemmaConfig>): void {
  const current = loadConfig();
  const next = { ...current, ...updates };
  saveConfig(GemmaConfigSchema.parse(next));
}
