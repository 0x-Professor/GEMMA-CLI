import { resolve, normalize, sep } from 'path';

export function checkSandbox(targetPath: string, allowedDirs: string[], deniedDirs: string[]): boolean {
  if (allowedDirs.length === 0 && deniedDirs.length === 0) return true;

  const normalizedTarget = normalize(resolve(targetPath)) + sep;

  // Check Denied first
  for (const dir of deniedDirs) {
    const normalizedDenied = normalize(resolve(dir)) + sep;
    if (normalizedTarget.startsWith(normalizedDenied)) {
      return false;
    }
  }

  // If no allowed dirs configured, only denied dirs apply
  if (allowedDirs.length === 0) return true;

  // Check Allowed
  for (const dir of allowedDirs) {
    const normalizedAllowed = normalize(resolve(dir)) + sep;
    if (normalizedTarget.startsWith(normalizedAllowed)) {
      return true;
    }
  }

  return false;
}