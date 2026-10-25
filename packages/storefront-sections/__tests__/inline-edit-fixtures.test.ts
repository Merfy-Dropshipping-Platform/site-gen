import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { readSectionFolder } from '../src/read-folder';

// Наши секции части 6 блока 1: «Страница» с правкой в превью у заголовка и текста (design.md 3.20) и тестовая секция
// inline-edit с правкой у настроек секции и блока. Команда pnpm merfy section check — как в merfy-cli.test.ts.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

interface Run {
  code: number;
  stdout: string;
}

function merfy(...args: string[]): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', 'scripts/merfy.ts', ...args],
      { cwd: PACKAGE_DIR },
      (error, stdout) => resolve({ code: error === null ? 0 : Number(Reflect.get(error, 'code')), stdout }),
    );
  });
}

const editCalls = (render: string | null): string[] =>
  [...(render ?? '').matchAll(/__merfy\.edit\(([^)]*)\)/g)].map((match) => match[1] ?? '');

describe('«Страница» и inline-edit', () => {
  it('«Страница»: две метки правки — заголовок и текст своей страницы; ветка политики без меток', async () => {
    const result = await prepareSection({
      prefix: 'shop',
      files: await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/page`),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.section.warnings).toEqual([]);
    expect(editCalls(result.section.render)).toEqual(['"heading"', '"text"']);
  }, 60_000);

  it('inline-edit: пять меток секции и блока, предупреждений нет', async () => {
    const result = await prepareSection({
      prefix: 'shop',
      files: await readSectionFolder(`${PACKAGE_DIR}fixtures/sections/inline-edit`),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.section.warnings).toEqual([]);
    expect(editCalls(result.section.render)).toEqual([
      '"heading"',
      '"text"',
      '"answer"',
      'block, "question"',
      'block, "answer"',
    ]);
  }, 60_000);

  it('pnpm merfy section check: обе секции проходят, код выхода 0', async () => {
    expect(await merfy('section', 'check', 'fixtures/shop/page')).toEqual({
      code: 0,
      stdout: 'shop:page: проверка прошла\n',
    });
    expect(await merfy('section', 'check', 'fixtures/sections/inline-edit')).toEqual({
      code: 0,
      stdout: 'shop:inline-edit: проверка прошла\n',
    });
  }, 60_000);

  it('флаг без места правки — строка с местом и кодом, код выхода 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'merfy-section-'));
    const manifest = {
      sdk: 1,
      name: 'probe',
      kind: 'section',
      title: 'Проба',
      settings: [
        { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Шарфы', inlineEdit: true } },
      ],
    };
    await writeFile(join(dir, 'section.json'), JSON.stringify(manifest));
    await writeFile(
      join(dir, 'template.astro'),
      '---\nconst { settings } = Astro.props;\n---\n<h1>{settings.heading} — магазин шарфов</h1>',
    );
    const run = await merfy('section', 'check', dir);
    expect(run.code).toBe(1);
    expect(run.stdout).toBe(
      'template.astro:4:6 — правка в превью: у настройки «Заголовок» (heading) нет места — нужен элемент, всё содержимое которого — {settings.heading} [inline-edit-unavailable]\n',
    );
  }, 60_000);
});
