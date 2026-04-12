import { spawnSync } from 'child_process';

export function hasRipgrep(): boolean {
  try {
    const rm = spawnSync('rg', ['--version']);
    if (rm.error || rm.status !== 0) return false;
    return true;
  } catch (e) {
    return false;
  }
}