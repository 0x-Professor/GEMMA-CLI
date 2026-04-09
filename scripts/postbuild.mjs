import { readFileSync, writeFileSync, chmodSync } from 'fs';

const path = 'dist/bin/gemma.js';
const src  = readFileSync(path, 'utf8');

if (!src.startsWith('#!')) {
  writeFileSync(path, '#!/usr/bin/env node\n' + src);
}

if (process.platform !== 'win32') {
  chmodSync(path, 0o755);
}
