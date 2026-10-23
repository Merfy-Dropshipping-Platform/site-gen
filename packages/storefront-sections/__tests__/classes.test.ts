import { classSystem, type ClassSystem } from '@merfy/storefront-build';
import { platformDictionary } from '@merfy/tokens';
import { beforeAll, describe, expect, it } from 'vitest';
import { classProblems, type ClassField, type ClassFields } from '../src/classes';
import type { SectionProblem } from '../src/problems';

// Шаг «Классы» (блок 4 «Секций и SDK», design.md 4.1; Р4-5…Р4-8).
const NO_FIELDS: ClassFields = { settings: [], blocks: [] };
const FRONT = '---\nconst { settings } = Astro.props;\n---\n';
const FRONT_BLOCKS = '---\nconst { settings, blocks } = Astro.props;\n---\n';
const select = (id: string, values: string[]): ClassField => ({
  id,
  label: id,
  setting: { kind: 'select', options: values.map((value) => ({ value })) },
});
const toggle = (id: string): ClassField => ({ id, label: id, setting: { kind: 'toggle' } });
const string = (id: string, label: string): ClassField => ({ id, label, setting: { kind: 'string' } });

let system: ClassSystem;
beforeAll(async () => {
  system = await classSystem(platformDictionary, '');
});

const check = (text: string, fields: ClassFields = NO_FIELDS): Promise<SectionProblem[]> =>
  classProblems(text, fields, system, platformDictionary);
const codes = (problems: SectionProblem[]) => problems.map((item) => item.code);

describe('классы словаря проходят', () => {
  it('словарь, служебные шкалы, варианты, классы платформы', async () => {
    const text =
      '<div class="flex gap-4 p-section bg-primary text-5xl rounded-card max-md:hidden data-open:block group">' +
      '<p class="group-data-picked:not-data-match:opacity-35 scheme-card font-body">x</p></div>';
    expect(await check(text)).toEqual([]);
  });

  it('варианты по атрибутам data-[…] и aria-[…] — не произвольное значение', async () => {
    const text = '<div class="data-[state=open]:block aria-[expanded=true]:rotate-180 group-data-[open]:block">x</div>';
    expect(await check(text)).toEqual([]);
  });
});

describe('правила и подсказки (таблица design.md 4.1)', () => {
  it.each([
    ['text-6xl', 'class-unknown', ['text-6xl', 'text-5xl']],
    ['text-primay', 'class-unknown', ['text-primary']],
    ['rounded-lg', 'class-unknown', ['rounded-card']],
    ['js-open', 'class-unknown', ['data-ref']],
    ['color-scheme-2', 'class-unknown', ['color-scheme-2']],
    ['bg-[#c9a227]', 'class-arbitrary', ['токен секции']],
    ['p-[13px]', 'class-arbitrary', ['p-3', 'p-section']],
    ['[&>li]:p-2', 'class-arbitrary', ['data-']],
    ['p-4!', 'class-arbitrary', ['p-4!']],
    ['dark:bg-foreground', 'class-dark', ['схема']],
    ['bg-theme-gold', 'class-theme-token', ['токен секции']],
  ])('%s — %s', async (name, code, parts) => {
    const problems = await check(`<div class="flex ${name}">x</div>`);
    expect(codes(problems)).toEqual([code]);
    for (const part of parts) expect(problems[0]?.message).toContain(part);
  });

  it('место — строка и колонка начала класса', async () => {
    const [found] = await check('<div class="flex\n  text-6xl">x</div>');
    expect(found).toMatchObject({ file: 'template.astro', line: 2, column: 3 });
  });

  it('повтор класса в двух местах — две проблемы', async () => {
    expect(codes(await check('<p class="text-6xl">a</p><p class="text-6xl">b</p>'))).toEqual([
      'class-unknown',
      'class-unknown',
    ]);
  });
});

describe('классы из выражений', () => {
  const fields: ClassFields = { settings: [select('align', ['left', 'center']), toggle('dark')], blocks: [] };

  it('строки, обе ветки ?:, ключи объекта в class:list', async () => {
    const text = `${FRONT}<div class:list={['flex gap-4', { 'text-center': settings.align === 'center' }, settings.dark ? 'scheme-card' : 'bg-primary']}>x</div>`;
    expect(await check(text, fields)).toEqual([]);
  });

  it('ветка ?: с классом вне словаря — одна проблема', async () => {
    const problems = await check(`${FRONT}<div class={settings.dark ? 'text-6xl' : 'p-4'}>x</div>`, fields);
    expect(codes(problems)).toEqual(['class-unknown']);
  });

  it('шаблонная строка — подстановка значений select', async () => {
    const overlay = { settings: [select('overlay', ['0', '40', '80'])], blocks: [] };
    expect(await check(`${FRONT}<div class={\`opacity-\${settings.overlay} p-4\`}>x</div>`, overlay)).toEqual([]);
    const wrong = { settings: [select('overlay', ['0', 'half'])], blocks: [] };
    const problems = await check(`${FRONT}<div class={\`opacity-\${settings.overlay}\`}>x</div>`, wrong);
    expect(codes(problems)).toEqual(['class-unknown']);
    expect(problems[0]?.message).toContain('opacity-half');
  });

  it('поле без конечного набора — class-dynamic с подписью поля', async () => {
    const title = { settings: [string('title', 'Заголовок')], blocks: [] };
    const problems = await check(`${FRONT}<div class={settings.title}>x</div>`, title);
    expect(codes(problems)).toEqual(['class-dynamic']);
    expect(problems[0]?.message).toContain('Заголовок');
  });

  it('поля блока: block.settings.<id>', async () => {
    const blockFields = { settings: [], blocks: [select('align', ['left', 'center'])] };
    const text = `${FRONT_BLOCKS}{blocks.map((block) => <p class={\`text-\${block.settings.align}\`}>x</p>)}`;
    expect(await check(text, blockFields)).toEqual([]);
  });
});
