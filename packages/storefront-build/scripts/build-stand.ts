import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { parseTheme } from '@merfy/tokens';
import novaThemeJson from '../../theme-nova/theme.json';
import standInputs from '../fixtures/stand-inputs.json';
import { buildStorefront, type StorefrontBuild } from '../src/build';
import { buildJsonOf } from '../src/build-json';
import { readClientFiles } from '../src/client-files';
import { platformRenderHash } from '../src/render-files';
import { startRenderer } from '../src/renderer';
import { buildRendererBundle } from '../src/theme-build';
import { readThemeState } from '../src/theme-version';

// pnpm build:stand --out <папка> [--year <год>] — магазин-стенд темы nova целиком (design.md блока 4, «Готово, когда»):
// рисовальщик темы, входы стенда (fixtures/stand-inputs.json) с настоящими отпечатками платформы и темы. Файлы сайта —
// в <папка>/files, рядом manifest.json и build.json. Год можно задать, чтобы увидеть: правка входа — другой ключ.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(PACKAGE_DIR, '..', '..');
const THEME_ID = 'nova';
const NOVA_DIR = join(ROOT, 'themes', THEME_ID);
const run = promisify(execFile);

const { values } = parseArgs({ options: { out: { type: 'string' }, year: { type: 'string' } } });
const outDir = resolve(values.out ?? 'dist-stand');

// Входы стенда с отпечатками этого дерева: платформа и тема — как их увидит сборщик.
async function standInputsNow(): Promise<unknown> {
  const theme = await readThemeState(ROOT, THEME_ID);
  return {
    ...standInputs,
    platform: { renderHash: await platformRenderHash(ROOT) },
    theme: { id: THEME_ID, ...theme },
    year: values.year === undefined ? standInputs.year : Number(values.year),
  };
}

async function writeOut(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function writeBuild(build: StorefrontBuild): Promise<void> {
  await Promise.all(build.files.map((file) => writeOut(join(outDir, 'files', file.path), file.content)));
  await writeOut(join(outDir, 'manifest.json'), `${JSON.stringify(build.manifest, null, 2)}\n`);
  await writeOut(join(outDir, 'build.json'), buildJsonOf(build.manifest));
}

const bundle = await buildRendererBundle(NOVA_DIR, join(NOVA_DIR, 'dist-renderer'));
const renderer = await startRenderer(bundle.serverEntry);
const { stdout: commit } = await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
const tokens = parseTheme(novaThemeJson.tokens);
const theme = { tokens, render: renderer.render, clientFiles: await readClientFiles(bundle.clientDir) };
const build = await buildStorefront(await standInputsNow(), { platformCommit: commit.trim() }, theme);
await renderer.close();
await writeBuild(build);
const lines = [
  `ключ: ${build.manifest.key}`,
  `файлов: ${build.files.length}, страниц: ${build.manifest.pages.length}`,
  `записано: ${outDir}`,
];
process.stdout.write(`${lines.join('\n')}\n`);
