import fs from 'fs';
import path from 'path';
import os from 'os';

export function checkFirstRun(): boolean {
  // Return true if ~/.gemma-cli does not exist.
  // Note: Since we auto-created it in logger.ts upon import, 
  // checking exactly the folder existence might fail if logger ran first.
  // The spec says: returns true if ~/.gemma-cli/ does not exist. We'll use a marker file.
  const appDir = path.join(os.homedir(), '.gemma-cli');
  const setupMarker = path.join(appDir, '.setup_complete');
  
  return !fs.existsSync(setupMarker);
}

export function markSetupComplete(): void {
  const appDir = path.join(os.homedir(), '.gemma-cli');
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  fs.writeFileSync(path.join(appDir, '.setup_complete'), new Date().toISOString());
}
