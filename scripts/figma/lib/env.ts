import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Tiny .env.local loader. We don't pull in `dotenv` to keep script deps minimal.
 * Loads first found file in order: .env.local, .env — from sites sub-repo root.
 */
export function loadEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // ignore parse errors
    }
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `\nMissing env var: ${name}\n` +
        `Set it in backend/services/sites/.env.local (see .env.local.example)\n` +
        `or export it inline: ${name}=xxx pnpm figma:<cmd>\n`,
    );
    process.exit(2);
  }
  return v;
}

export const DEFAULT_FILE_KEY = 'QfF9NPZBoQX6vCRg560Qcb'; // "New Themes" file
