import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * Resolve an executable via the user's login shell. Apps launched from
 * Finder/the Dock don't inherit the shell PATH (e.g. ~/.local/bin), so a
 * bare name would not be found. Falls back to the bare name.
 */
export function findOnShellPath(name: string): string {
  if (process.platform === 'win32') return name;
  try {
    const shell = process.env.SHELL || os.userInfo().shell || '/bin/sh';
    const found = execSync(`${shell} -l -c "which ${name}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).toString().trim();
    if (found) return found;
  } catch {
    // fall through to bare name
  }
  return name;
}
