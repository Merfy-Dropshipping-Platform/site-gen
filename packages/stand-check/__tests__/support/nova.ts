import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packagePath } from '../../src/paths';

// Тема nova собирается целиком, как её соберут стенд и образ; флаг — переменная окружения сборки (design.md 5.2).
// Нужна установка темы: pnpm --dir themes/nova install --ignore-workspace.
const NOVA_DIR = packagePath('../../themes/nova');

export const STAND_HTML = 'theme-stand/index.html';
export const SITEMAP = 'sitemap-0.xml';

// Сборка во временную папку: dist темы не трогаем. Возвращает папку сборки.
export function buildNova(flag: '1' | undefined): string {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-dist-'));
  const env = { ...process.env, MERFY_THEME_STAND: flag };
  const build = spawnSync('pnpm', ['exec', 'astro', 'build', '--outDir', outDir], {
    cwd: NOVA_DIR,
    env,
    encoding: 'utf8',
  });
  if (build.status !== 0) throw new Error(`astro build упал:\n${build.stdout}\n${build.stderr}`);
  return outDir;
}

export const readBuilt = (outDir: string, file: string): string => readFileSync(path.join(outDir, file), 'utf8');
