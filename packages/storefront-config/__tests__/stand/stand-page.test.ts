import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import standConfigJson from '../../fixtures/stand-config.json';
import { parseStorefrontConfig } from '../../src/read';

// Стенд темы nova (design.md блока 3, 5.6): тема собирается целиком, как её соберёт команда stand.
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const STAND_HTML = 'theme-stand/index.html';
// Тот же адрес, что задаёт команда stand: его подменяет таблица моков стенда.
const STAND_API_URL = 'http://localhost:4321/api';
const CONFIG_OPEN = '<script type="application/json" id="merfy-config">';
// Признак zod в сборке: внутреннее поле, которое есть у каждой схемы zod 4.
const ZOD_MARK = '_zod';

type Build = { outDir: string; status: number | null; output: string };

// Сборка во временную папку: dist темы не трогаем. undefined в env — переменной нет вовсе.
function buildNova(env: Record<string, string | undefined>): Build {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-config-'));
  const build = spawnSync('pnpm', ['exec', 'astro', 'build', '--outDir', outDir], {
    cwd: NOVA_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { outDir, status: build.status, output: `${build.stdout}${build.stderr}` };
}

// Файлы сборки, в которых есть текст.
function filesWith(outDir: string, text: string): string[] {
  const files = readdirSync(outDir, { recursive: true, encoding: 'utf8' });
  const plain = files.filter((file) => statSync(path.join(outDir, file)).isFile());
  return plain.filter((file) => readFileSync(path.join(outDir, file), 'utf8').includes(text));
}

describe('стенд с флагом: тег конфига в <head>', () => {
  let build: Build;
  let html: string;

  beforeAll(() => {
    build = buildNova({ MERFY_THEME_STAND: '1', PUBLIC_MERFY_API_URL: STAND_API_URL });
    html = readFileSync(path.join(build.outDir, STAND_HTML), 'utf8');
  });

  it('ровно один тег #merfy-config, он в <head> и раньше любого другого скрипта', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(html.split('id="merfy-config"')).toHaveLength(2);
    expect(head).toContain(CONFIG_OPEN);
    expect(html.indexOf('<script')).toBe(html.indexOf(CONFIG_OPEN));
  });

  it('разбор тега даёт эталон стенда', () => {
    const start = html.indexOf(CONFIG_OPEN) + CONFIG_OPEN.length;
    const text = html.slice(start, html.indexOf('</script>', start));
    expect(parseStorefrontConfig(text)).toEqual(standConfigJson);
  });

  it('в скриптах страницы нет zod: читатель взят отдельным входом', () => {
    expect(filesWith(build.outDir, ZOD_MARK)).toEqual([]);
  });
});

describe('стенд без флага и без переменной', () => {
  it('без флага страницы стенда нет, и тега конфига нет нигде в сборке', () => {
    const build = buildNova({ MERFY_THEME_STAND: undefined, PUBLIC_MERFY_API_URL: undefined });
    expect(build.status).toBe(0);
    expect(existsSync(path.join(build.outDir, STAND_HTML))).toBe(false);
    expect(filesWith(build.outDir, 'merfy-config')).toEqual([]);
  });

  it('с флагом, но без PUBLIC_MERFY_API_URL сборка падает и называет переменную', () => {
    const build = buildNova({ MERFY_THEME_STAND: '1', PUBLIC_MERFY_API_URL: undefined });
    expect(build.status).not.toBe(0);
    expect(build.output).toContain('PUBLIC_MERFY_API_URL');
  });
});
