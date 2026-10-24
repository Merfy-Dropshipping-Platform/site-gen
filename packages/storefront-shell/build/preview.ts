import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ShellError } from '../src/errors';

// Сборка скрипта превью (блок 5 «Секций и SDK», часть 5г): dist/preview.js — обычный скрипт (IIFE), сборщик вставляет
// его текстом в <script> HTML превью. «</script» или «<!--» в тексте закрыли бы тег раньше — такая сборка — отказ.
export const PREVIEW_FILE = 'preview.js';

export interface PreviewBuildOptions {
  packageDir: string;
  outDir: string;
  entry?: string; // вход сборки; по умолчанию <packageDir>/src/preview/entry.ts — другой только у теста
}

// Текст, который закрыл бы тег <script> страницы: совпадение — отказ, файл не пишется.
const UNSAFE_TEXT = /<\/script|<!--/i;

async function buildPreviewCode(options: PreviewBuildOptions): Promise<string> {
  const entry = options.entry ?? join(options.packageDir, 'src/preview/entry.ts');
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

export async function buildPreview(options: PreviewBuildOptions): Promise<{ bytes: number }> {
  const code = await buildPreviewCode(options);
  if (UNSAFE_TEXT.test(code)) {
    throw new ShellError('preview-unsafe', 'в тексте скрипта превью есть «</script» или «<!--»', {
      path: PREVIEW_FILE,
    });
  }
  await mkdir(options.outDir, { recursive: true });
  const bytes = Buffer.byteLength(code, 'utf8');
  await writeFile(join(options.outDir, PREVIEW_FILE), code);
  return { bytes };
}
