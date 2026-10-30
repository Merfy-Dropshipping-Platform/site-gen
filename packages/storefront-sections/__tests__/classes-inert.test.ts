import { classSystem, type ClassSystem } from '@merfy/storefront-build';
import { platformDictionary } from '@merfy/tokens';
import { beforeAll, describe, expect, it } from 'vitest';
import { classProblems, type ClassFields } from '../src/classes';
import type { SectionProblem } from '../src/problems';

// Классы из словаря, которые ничего не рисуют (Н1 «MCP-опыта», 30.10): правило class-inert, inert-classes.ts.
const NO_FIELDS: ClassFields = { settings: [], blocks: [] };

let system: ClassSystem;
beforeAll(async () => {
  system = await classSystem(platformDictionary, '');
});

const check = (text: string): Promise<SectionProblem[]> => classProblems(text, NO_FIELDS, system, platformDictionary);
const codes = (problems: SectionProblem[]) => problems.map((item) => item.code);

describe('градиент целиком — проходит', () => {
  it.each([
    'bg-linear-to-r from-primary to-foreground bg-clip-text text-transparent',
    'bg-linear-to-r from-destructive via-primary to-foreground bg-clip-text text-transparent',
    'bg-radial from-primary to-background',
    'bg-conic from-primary to-destructive',
    'bg-linear-45 from-primary',
    'bg-gradient-to-r from-primary to-background',
    'bg-linear-to-b from-primary/50 to-transparent',
    // Направление и точки на одном элементе, но в разных вариантах — основа есть, отказа нет.
    'bg-linear-to-r md:from-primary md:to-foreground',
    // Цвет фона вместо градиента: вырезка по буквам показывает его.
    'bg-primary bg-clip-text text-transparent',
    // Прозрачный текст без вырезки фона и «показать при наведении» — не про градиент.
    'text-transparent hover:text-foreground',
    'hover:text-transparent',
  ])('%s', async (classes) => {
    expect(await check(`<h2 class="${classes}">x</h2>`)).toEqual([]);
  });

  it('из той же правки: uppercase underline decoration-4 не затронуты', async () => {
    const classes =
      'uppercase underline decoration-4 bg-linear-to-r from-primary to-foreground bg-clip-text text-transparent';
    expect(await check(`<h2 class="${classes}">x</h2>`)).toEqual([]);
  });
});

describe('class-inert', () => {
  it('точки градиента без направления — отказ на первом классе точек, с советом', async () => {
    const problems = await check('<h2 class="m-0 from-primary to-foreground bg-clip-text text-transparent">x</h2>');
    expect(codes(problems)).toEqual(['class-inert', 'class-inert']);
    expect(problems[0]).toMatchObject({ file: 'template.astro', line: 1, column: 16 });
    expect(problems[0]?.message).toContain('класс from-primary не даёт стилей');
    expect(problems[0]?.message).toContain('· добавь bg-linear-to-r');
  });

  it('направление без точек', async () => {
    const problems = await check('<div class="h-4 bg-linear-to-r">x</div>');
    expect(codes(problems)).toEqual(['class-inert']);
    expect(problems[0]?.message).toContain('класс bg-linear-to-r не даёт стилей');
    expect(problems[0]?.message).toContain('· добавь цвета токенов');
  });

  it('вырезка фона и прозрачный текст без фона — отказ на text-transparent', async () => {
    const problems = await check('<h2 class="bg-clip-text text-transparent">x</h2>');
    expect(codes(problems)).toEqual(['class-inert']);
    expect(problems[0]?.message).toContain('класс text-transparent не даёт стилей, а прячет текст');
  });

  it('точки на одном элементе, направление — на соседнем: отказ (--tw-gradient-* не наследуются)', async () => {
    const text = '<div class="bg-linear-to-r"><span class="from-primary to-foreground">x</span></div>';
    expect(codes(await check(text))).toEqual(['class-inert', 'class-inert']);
  });

  it('class:list: точки в одной ветке, направление в другой — основа есть, отказа нет', async () => {
    const text = `---
const { settings } = Astro.props;
---
<h2 class:list={['bg-clip-text text-transparent', settings.on ? 'bg-linear-to-r from-primary to-foreground' : 'bg-primary']}>x</h2>`;
    expect(await check(text)).toEqual([]);
  });

  it('неизвестный класс на элементе — только class-unknown, без второго отказа', async () => {
    const problems = await check('<h2 class="from-primary to-nope">x</h2>');
    expect(codes(problems)).toEqual(['class-unknown']);
  });
});
