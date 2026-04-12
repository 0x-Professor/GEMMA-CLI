import os from 'os';
import path from 'path';

export const SESSIONS_DIR = path.join(os.homedir(), '.gemma-cli', 'sessions');

export const GEMMA_MODELS = {
  'gemma-3-1b-it': {
    displayName: 'Gemma 3 1B Instruct',
    repo: 'bartowski/google_gemma-3-1b-it-GGUF',
    filename: 'google_gemma-3-1b-it-Q4_K_M.gguf',
    sizeMB: 669,
    minRamGB: 2,
    minDiskGB: 1,
    contextLength: 8192,
    sha256: '<hash>',
    recommended: false,
  },
  'gemma-3-4b-it': {
    displayName: 'Gemma 3 4B Instruct',
    repo: 'bartowski/google_gemma-3-4b-it-GGUF',
    filename: 'google_gemma-3-4b-it-Q4_K_M.gguf',
    sizeMB: 2600,
    minRamGB: 6,
    minDiskGB: 3,
    contextLength: 32768,
    sha256: '<hash>',
    recommended: true,
  },
  'gemma-3-12b-it': {
    displayName: 'Gemma 3 12B Instruct',
    repo: 'bartowski/google_gemma-3-12b-it-GGUF',
    filename: 'google_gemma-3-12b-it-Q4_K_M.gguf',
    sizeMB: 7400,
    minRamGB: 12,
    minDiskGB: 8,
    contextLength: 32768,
    sha256: '<hash>',
    recommended: false,
  },
  'gemma-3-27b-it': {
    displayName: 'Gemma 3 27B Instruct',
    repo: 'bartowski/google_gemma-3-27b-it-GGUF',
    filename: 'google_gemma-3-27b-it-Q4_K_M.gguf',
    sizeMB: 16500,
    minRamGB: 24,
    minDiskGB: 17,
    contextLength: 131072,
    sha256: '<hash>',
    recommended: false,
  },
  'gemma-4-e4b-it': {
    displayName: 'Gemma 4 E4B Instruct',
    repo: 'unsloth/gemma-4-E4B-it-GGUF',
    filename: 'gemma-4-E4B-it-Q8_0.gguf',
    sizeMB: 5500,
    minRamGB: 8,
    minDiskGB: 6,
    contextLength: 128000,
    sha256: '<hash>',
    recommended: false,
  },
} as const;

export type ModelId = keyof typeof GEMMA_MODELS;

export const HF_BASE_URL = 'https://huggingface.co';

export const HF_RESOLVE = (repo: string, filename: string) =>
  `${HF_BASE_URL}/${repo}/resolve/main/${filename}`;

export const DEFAULT_DENIED_DIRS = process.platform === 'win32'
  ? ['C:\\Windows', 'C:\\Program Files']
  : ['/etc', '/usr', '/bin', '/sbin', '/boot', '/sys', '/proc'];

export const APP_NAME = 'gemma-cli';
