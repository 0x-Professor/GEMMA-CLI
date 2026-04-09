import fs from 'fs';
import path from 'path';
import os from 'os';

const logDir = path.join(os.homedir(), '.gemma-cli');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export const logger = {
  info: (msg: string) => {
    fs.appendFileSync(path.join(logDir, 'gemma.log'), `[INFO] ${new Date().toISOString()} - ${msg}\n`);
  },
  warn: (msg: string) => {
    fs.appendFileSync(path.join(logDir, 'gemma.log'), `[WARN] ${new Date().toISOString()} - ${msg}\n`);
  },
  error: (msg: string | Error) => {
    const message = msg instanceof Error ? msg.stack || msg.message : msg;
    fs.appendFileSync(path.join(logDir, 'gemma.log'), `[ERROR] ${new Date().toISOString()} - ${message}\n`);
  }
};
