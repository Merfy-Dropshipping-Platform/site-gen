import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShell } from '../build/build';
import { parseCoreParts } from '../build/core-parts';

// pnpm build — ядро в dist/shell/ и dist/shell.json. Состав — core-parts.json (С7-3 Б), версия — package.json пакета.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

async function readJson(file: string): Promise<unknown> {
  const value: unknown = JSON.parse(await readFile(join(PACKAGE_DIR, file), 'utf8'));
  return value;
}

function versionOf(pkg: unknown): string {
  const version: unknown = typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, 'version') : undefined;
  if (typeof version === 'string') return version;
  throw new Error('package.json: нет version');
}

const core = parseCoreParts(await readJson('core-parts.json'));
const version = versionOf(await readJson('package.json'));
const manifest = await buildShell({ packageDir: PACKAGE_DIR, outDir: join(PACKAGE_DIR, 'dist'), core, version });
process.stdout.write(`ядро ${manifest.version}: ${manifest.preload.join(', ')} — ${manifest.brotliBytes} Б brotli\n`);
