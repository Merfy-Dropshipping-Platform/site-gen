import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { platformDictionary } from '../src/dictionary';
import { baseCss } from './base-css';
import { packageFiles, themeFiles, type GeneratedFiles } from '../src/generate/files';
import { parseTheme } from '../src/values';

// pnpm generate — файлы пакета в generated/.
// pnpm generate --theme <папка темы> — файлы темы в <папка темы>/generated/tokens/ по её theme.json → tokens.

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const themeFileShape = z.object({ tokens: z.unknown() });

function writeFiles(baseDir: string, files: GeneratedFiles): void {
  for (const [path, text] of Object.entries(files)) {
    const target = join(baseDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    process.stdout.write(`записан ${target}\n`);
  }
}

function themeDirOf(args: readonly string[]): string | undefined {
  const index = args.indexOf('--theme');
  if (index < 0) return undefined;
  const dir: string | undefined = args[index + 1];
  if (dir === undefined) throw new Error('после --theme нужна папка темы: pnpm generate --theme <папка>');
  return resolve(dir);
}

async function main(): Promise<void> {
  const themeDir = themeDirOf(process.argv.slice(2));
  if (themeDir === undefined) {
    // База страницы (блок 4 «Секций и SDK») — асинхронно: её компилирует Tailwind.
    writeFiles(PACKAGE_DIR, {
      ...packageFiles(platformDictionary),
      'generated/base.css': await baseCss(platformDictionary),
    });
    return;
  }
  const raw: unknown = JSON.parse(readFileSync(join(themeDir, 'theme.json'), 'utf8'));
  const theme = parseTheme(themeFileShape.parse(raw).tokens);
  writeFiles(themeDir, themeFiles(theme.dictionary));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
