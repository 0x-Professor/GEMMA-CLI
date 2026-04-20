import fs from 'fs';
import path from 'path';

function parseEnvLine(line: string): { key: string; value: string } | null {
  const normalized = line.trim();
  if (!normalized || normalized.startsWith('#')) {
    return null;
  }

  const exportPrefix = 'export ';
  const lineWithoutExport = normalized.startsWith(exportPrefix)
    ? normalized.slice(exportPrefix.length)
    : normalized;

  const separator = lineWithoutExport.indexOf('=');
  if (separator <= 0) {
    return null;
  }

  const key = lineWithoutExport.slice(0, separator).trim();
  if (!key) {
    return null;
  }

  let value = lineWithoutExport.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadLocalEnvFiles(): void {
  const candidates = ['.env.local', '.env'];

  for (const filename of candidates) {
    const filePath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
}
