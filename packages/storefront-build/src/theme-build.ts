import { execFile } from 'node:child_process';
import { isAbsolute, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { StorefrontBuildError } from './errors';

// Серверная сборка темы (design.md блока 4, В4-4 Б): один раз на версию темы, по конфигу рисовальщика темы. Папка
// сборки — только внутри папки темы: бандл берёт astro и его зависимости из node_modules темы, из другого места он не
// запустится. Телеметрия Astro выключена: сборка не ходит в сеть.

export interface RendererBundle {
  serverEntry: string;
  clientDir: string;
}

const RENDERER_CONFIG = 'astro.renderer.config.mjs';
const run = promisify(execFile);

function checkOutDir(themeDir: string, outDir: string): void {
  const inside = relative(themeDir, outDir);
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) return;
  throw new StorefrontBuildError('theme-build-failed', 'папка сборки — только внутри папки темы', { path: outDir });
}

// Собрать рисовальщик темы в outDir. Упала сборка — ошибка с причиной: в ней вывод astro build.
export async function buildRendererBundle(themeDir: string, outDir: string): Promise<RendererBundle> {
  checkOutDir(themeDir, outDir);
  const astro = join(themeDir, 'node_modules', '.bin', 'astro');
  const args = ['build', '--config', RENDERER_CONFIG, '--outDir', outDir];
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
  try {
    await run(astro, args, { cwd: themeDir, env });
  } catch (error) {
    throw new StorefrontBuildError('theme-build-failed', 'astro build рисовальщика упал', {
      path: themeDir,
      cause: error,
    });
  }
  return { serverEntry: join(outDir, 'server', 'entry.mjs'), clientDir: join(outDir, 'client') };
}
