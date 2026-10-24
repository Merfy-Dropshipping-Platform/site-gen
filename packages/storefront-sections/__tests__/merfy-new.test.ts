import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// pnpm merfy section new <папка> (блок 14, 14.5): копия шаблона packages/sdk-docs/template с именем папки.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

function merfy(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', 'scripts/merfy.ts', ...args],
      { cwd: PACKAGE_DIR },
      (error, stdout, stderr) => resolve({ code: error === null ? 0 : Number(Reflect.get(error, 'code')), stdout, stderr }),
    );
  });
}

describe('pnpm merfy section new', () => {
  it('папка из шаблона с именем папки; она проходит проверку; второй раз — отказ', async () => {
    const folder = join(await mkdtemp(join(tmpdir(), 'merfy-new-')), 'size-chart');
    const created = await merfy('section', 'new', folder);
    expect(created).toMatchObject({ code: 0, stdout: `создана папка ${folder}: AGENTS.md, CLAUDE.md, section.json, template.astro\n` });
    expect((await readdir(folder)).sort()).toEqual(['AGENTS.md', 'CLAUDE.md', 'section.json', 'template.astro']);
    const manifest: unknown = JSON.parse(await readFile(join(folder, 'section.json'), 'utf8'));
    expect(manifest).toMatchObject({ sdk: 1, name: 'size-chart', kind: 'section', title: 'Новая секция' });
    expect(await merfy('section', 'check', folder)).toMatchObject({ code: 0, stdout: 'shop:size-chart: проверка прошла\n' });
    const again = await merfy('section', 'new', folder);
    expect(again.code).toBe(1);
    expect(again.stderr).toBe(`папка ${folder} уже есть: выбери другое имя\n`);
  }, 60_000);

  it('имя папки не по правилу имени секции — выход 2', async () => {
    const folder = join(await mkdtemp(join(tmpdir(), 'merfy-new-')), 'Size_Chart');
    const run = await merfy('section', 'new', folder);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('имя секции Size_Chart: строчные латинские буквы и цифры через одиночный дефис');
  }, 30_000);
});
