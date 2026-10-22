import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { linkedModule, RUNTIME_URL } from '../src/module-loader';
import { ASTRO_RUNTIME } from '../src/compile';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const HERO_MANIFEST = { sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [] };

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

async function folderWith(template: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'merfy-section-'));
  await writeFile(join(dir, 'section.json'), JSON.stringify(HERO_MANIFEST));
  await writeFile(join(dir, 'template.astro'), template);
  return dir;
}

describe('pnpm merfy section check', () => {
  it('«Первый экран» проходит; префикс по умолчанию — shop, как у своей секции магазина', async () => {
    expect(await merfy('section', 'check', 'fixtures/sections/hero')).toEqual({
      code: 0,
      stdout: 'shop:hero: проверка прошла\n',
    });
  }, 30_000);

  it('запрет в шаблоне — строка с местом и кодом, выход 1', async () => {
    const run = await merfy('section', 'check', await folderWith('<div>\n  <button onclick="x">a</button>\n</div>'));
    expect(run.code).toBe(1);
    expect(run.stdout).toBe(
      'template.astro:2:11 — обработчик onclick: события — только в script.ts [template-forbidden]\n',
    );
  }, 30_000);

  it('шаблон падает при рендере — render-failed', async () => {
    const template = '---\nconst { settings } = Astro.props;\n---\n<p>{settings.missing.deep}</p>';
    const run = await merfy('section', 'check', await folderWith(template));
    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(
      /^template\.astro — шаблон не отрисовался с умолчаниями настроек: .+ \[render-failed\]\n$/,
    );
  }, 30_000);

  it('неверная команда — выход 2', async () => {
    expect((await merfy('section')).code).toBe(2);
  }, 30_000);
});

describe('модуль шаблона', () => {
  it('имя рантайма заменяется полным адресом, остальной текст — как был', async () => {
    const code = `import { render } from '${ASTRO_RUNTIME}';\nexport default 1;`;
    expect(await linkedModule(code)).toBe(`import { render } from '${RUNTIME_URL}';\nexport default 1;`);
    expect(RUNTIME_URL.startsWith('file://')).toBe(true);
  });
});

describe('секции тест-магазина (часть 3)', () => {
  it('«Первый экран» и «Вопросы и ответы» из fixtures/shop проходят без предупреждений', async () => {
    expect(await merfy('section', 'check', 'fixtures/shop/hero')).toEqual({
      code: 0,
      stdout: 'shop:hero: проверка прошла\n',
    });
    expect(await merfy('section', 'check', 'fixtures/shop/faq')).toEqual({
      code: 0,
      stdout: 'shop:faq: проверка прошла\n',
    });
  }, 60_000);

  it('блоки без корневого элемента — предупреждение block-select-unavailable, код выхода 0', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'merfy-faq-'));
    const manifest = {
      sdk: 1,
      name: 'faq',
      kind: 'section',
      title: 'Вопросы и ответы',
      settings: [],
      blocks: {
        question: {
          title: 'Вопрос',
          limit: 20,
          settings: [{ id: 'question', label: 'Вопрос', setting: { kind: 'string', default: 'Новый вопрос' } }],
        },
      },
      defaultBlocks: [{ type: 'question', settings: {} }],
    };
    await writeFile(join(dir, 'section.json'), JSON.stringify(manifest));
    await writeFile(
      join(dir, 'template.astro'),
      '---\nconst { settings, blocks } = Astro.props;\n---\n<div>{blocks.map((block) => (block.settings.question ? <p>{block.settings.question}</p> : <span>?</span>))}</div>',
    );
    expect(await merfy('section', 'check', dir)).toEqual({
      code: 0,
      stdout:
        'shop:faq: проверка прошла\ntemplate.astro:4:7 — blocks.map без одного корневого элемента: подпункт выбирается только слева [block-select-unavailable]\n',
    });
  }, 30_000);
});
