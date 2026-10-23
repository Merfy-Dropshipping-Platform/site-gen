import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { WORKER_FILES } from '../src/worker-files';

// pnpm build:workers — собранные процессы пакета (блок 2 «Секций и SDK», src/worker-files.ts): процесс рендера,
// процесс проверки и проба песочницы, по файлу .mjs в dist-render/. Код пакета, zod, es-module-lexer и @merfy/tokens —
// внутри файла; astro, компилятор и esbuild-wasm процесс загружает из node_modules пакета. Файл пишется через временный и
// переименование: процесс, который стартует во время сборки, читает старый файл или новый, но не половину.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENTRIES: Readonly<Record<string, string>> = {
  [WORKER_FILES.render]: 'src/render-worker.ts',
  [WORKER_FILES.check]: 'src/worker.ts',
  [WORKER_FILES.probe]: 'src/sandbox-probe.ts',
};
// jsonc-parser — тоже из node_modules (блок 3 «Секций и SDK», Р3.10): его UMD-сборку esbuild в ESM не собирает
// («Dynamic require of "./impl/format" is not supported»), а ESM-сборку пакета Node без сборщика не загружает.
// sanitize-html (часть 3 блока 1) — тоже из node_modules: это CommonJS с require('path') внутри, в собранном ESM-файле
// он не загружается («Dynamic require of "path" is not supported»). Процесс проверки получает его через format.ts.
const EXTERNAL = [
  'astro',
  'astro/*',
  '@astrojs/compiler-rs',
  'esbuild-wasm',
  'jsonc-parser',
  'sanitize-html',
  'tailwindcss',
];

async function bundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [join(PACKAGE_DIR, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: EXTERNAL,
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles.map((output) => output.text).join('');
}

async function writeIfChanged(file: string, text: string): Promise<void> {
  const old = await readFile(file, 'utf8').catch(() => null);
  if (old === text) return;
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}`);
  await writeFile(temporary, text);
  await rename(temporary, file);
}

export async function buildWorkers(): Promise<void> {
  await mkdir(dirname(WORKER_FILES.render), { recursive: true });
  for (const [file, entry] of Object.entries(ENTRIES)) await writeIfChanged(file, await bundle(entry));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await buildWorkers();
