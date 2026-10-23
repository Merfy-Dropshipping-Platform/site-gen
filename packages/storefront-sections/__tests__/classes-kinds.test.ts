import { classSystem, type ClassSystem } from '@merfy/storefront-build';
import { platformDictionary } from '@merfy/tokens';
import { beforeAll, describe, expect, it } from 'vitest';
import { classProblems, type ClassField, type ClassFields } from '../src/classes';

// Конечные наборы новых видов, запись поля в скобках, класс схемы и логические выражения в class:list
// (часть 5 блока 1 «Секций и SDK», Р1-5-9, Р1-5-10).
const FRONT = '---\nconst { settings, blocks } = Astro.props;\n---\n';
const field = (id: string, setting: ClassField['setting']): ClassField => ({ id, label: id, setting });
const options = (...values: string[]) => values.map((value) => ({ value }));
const check = (text: string, ...settings: ClassField[]) =>
  classProblems(`${FRONT}${text}`, { settings, blocks: [] } satisfies ClassFields, system, platformDictionary);
const checkBlock = (text: string, ...blocks: ClassField[]) =>
  classProblems(`${FRONT}${text}`, { settings: [], blocks } satisfies ClassFields, system, platformDictionary);
const codes = (problems: { code: string }[]) => problems.map((item) => item.code);

let system: ClassSystem;
beforeAll(async () => {
  system = await classSystem(platformDictionary, '');
});

// Подстановку, которую проверка не раскрывает, она отмечает как class-dynamic. Кроме него в ответе бывает class-unknown на
// недописанном классе («text-» без значения): так 4а разбирает шаблонную строку. Поэтому class-dynamic ищем среди кодов.
describe('подстановка значений новых видов', () => {
  it('range: значения от min до max с шагом — opacity-0 … opacity-100', async () => {
    const overlay = field('overlay', { kind: 'range', min: 0, max: 100, step: 5 });
    expect(await check('<div class={`opacity-${settings.overlay}`}>x</div>', overlay)).toEqual([]);
  });

  it('range шире 101 значения — class-dynamic', async () => {
    const wide = field('wide', { kind: 'range', min: 0, max: 1000, step: 1 });
    expect(codes(await check('<div class={`opacity-${settings.wide}`}>x</div>', wide))).toContain('class-dynamic');
  });

  it('alignment: left, center, right; radio: значения вариантов, лишнее значение — class-unknown', async () => {
    const align = field('align', { kind: 'alignment' });
    expect(await check('<div class={`text-${settings.align}`}>x</div>', align)).toEqual([]);
    const height = field('height', { kind: 'radio', options: options('left', 'right') });
    expect(await check('<div class={`text-${settings.height}`}>x</div>', height)).toEqual([]);
    const wrong = field('height', { kind: 'radio', options: options('left', 'huge') });
    expect(codes(await check('<div class={`text-${settings.height}`}>x</div>', wrong))).toEqual(['class-unknown']);
  });
});

describe('поле в скобках с литералом строки читается как settings.<id>', () => {
  const alignX = field('align-x', { kind: 'select', options: options('left', 'center') });
  const wrongX = field('align-x', { kind: 'select', options: options('left', 'huge') });

  it("select: text-${settings['align-x']} — проверяется каждое значение, кавычки любые", async () => {
    expect(await check("<p class={`text-${settings['align-x']}`}>x</p>", alignX)).toEqual([]);
    expect(codes(await check("<p class={`text-${settings['align-x']}`}>x</p>", wrongX))).toEqual(['class-unknown']);
    expect(codes(await check('<p class={`text-${settings["align-x"]}`}>x</p>', wrongX))).toEqual(['class-unknown']);
  });

  it("поле блока: text-${block.settings['heading-size']} — те же значения", async () => {
    const size = field('heading-size', { kind: 'select', options: options('sm', 'lg') });
    const wrong = field('heading-size', { kind: 'select', options: options('sm', 'huge') });
    const text = "{blocks.map((block) => <p class={`text-${block.settings['heading-size']}`}>x</p>)}";
    expect(await checkBlock(text, size)).toEqual([]);
    expect(codes(await checkBlock(text, wrong))).toEqual(['class-unknown']);
  });

  it.each<[string, ClassField['setting'], string]>([
    ['radio', { kind: 'radio', options: options('left', 'right') }, 'text'],
    ['alignment', { kind: 'alignment' }, 'text'],
    ['range', { kind: 'range', min: 0, max: 100, step: 25 }, 'opacity'],
  ])('%s: скобки проходят так же, как точка', async (_kind, setting, prefix) => {
    const item = field('kind-id', setting);
    expect(await check(`<p class={\`${prefix}-\${settings['kind-id']}\`}>x</p>`, item)).toEqual([]);
  });

  it('скобки не с литералом строки — class-dynamic', async () => {
    expect(codes(await check('<p class={`text-${settings[name]}`}>x</p>', alignX))).toContain('class-dynamic');
    expect(codes(await check('<p class={`text-${settings[0]}`}>x</p>', alignX))).toContain('class-dynamic');
    const text = '{blocks.map((block) => <p class={`text-${block.settings[name]}`}>x</p>)}';
    expect(codes(await checkBlock(text, alignX))).toContain('class-dynamic');
  });

  it('поля с таким id нет — class-dynamic', async () => {
    expect(codes(await check("<p class={`text-${settings['other']}`}>x</p>", alignX))).toContain('class-dynamic');
  });
});

describe('класс схемы от поля вида color-scheme', () => {
  const tint = field('tint', { kind: 'color-scheme' });
  const scheme = field('color-scheme', { kind: 'color-scheme' });
  const title = field('title', { kind: 'string' });

  it('color-${поле вида color-scheme} — проходит, и в class:list с условием &&', async () => {
    expect(await check('<nav class={`color-${settings.tint}`}>x</nav>', tint)).toEqual([]);
    expect(await check('<nav class:list={[settings.tint && `color-${settings.tint}`]}>x</nav>', tint)).toEqual([]);
  });

  it('скобки с литералом строки в одинарных и двойных кавычках — проходят (id с дефисом)', async () => {
    const single = "<nav class:list={[settings['color-scheme'] && `color-${settings['color-scheme']}`]}>x</nav>";
    expect(await check(single, scheme)).toEqual([]);
    expect(await check('<nav class={`color-${settings["color-scheme"]}`}>x</nav>', scheme)).toEqual([]);
  });

  it('скобки не с литералом — class-dynamic; скобки с полем другого вида — class-dynamic', async () => {
    expect(codes(await check('<nav class={`color-${settings[name]}`}>x</nav>', scheme))).toContain('class-dynamic');
    expect(codes(await check("<nav class={`color-${settings['title']}`}>x</nav>", title))).toContain('class-dynamic');
  });

  it('то же от поля другого вида — class-dynamic; литерал color-scheme-2 — class-unknown', async () => {
    expect(codes(await check('<nav class={`color-${settings.title}`}>x</nav>', title))).toContain('class-dynamic');
    expect(codes(await check('<nav class="color-scheme-2">x</nav>', tint))).toEqual(['class-unknown']);
  });

  it('другой префикс у поля color-scheme — не пропускается', async () => {
    expect(codes(await check('<nav class={`bg-${settings.tint}`}>x</nav>', tint))).toContain('class-dynamic');
  });
});

describe('логические выражения в class:list', () => {
  const list = (item: string) => `<p class:list={[${item}]}>x</p>`;
  const alignX = field('align-x', { kind: 'select', options: options('left', 'center') });

  it('a && "класс" — проверяется правая часть, левая — условие', async () => {
    expect(await check(list("ok && 'text-center'"))).toEqual([]);
    expect(codes(await check(list("ok && 'no-such-class'")))).toEqual(['class-unknown']);
    expect(await check(list("settings['align-x'] === 'left' && 'text-left'"), alignX)).toEqual([]);
  });

  it('a || "класс" и a ?? "класс" — обе части: правая проверяется, левая как любое выражение класса', async () => {
    expect(codes(await check(list("a || 'p-4'")))).toEqual(['class-dynamic']);
    expect(codes(await check(list("a ?? 'no-such-class'")))).toEqual(['class-dynamic', 'class-unknown']);
    expect(await check(list("'flex' || 'p-4'"))).toEqual([]);
    expect(codes(await check(list("'no-such-class' || 'flex'")))).toEqual(['class-unknown']);
  });

  it('вложенность — как у остальных узлов: цепочка, ?:, массив, шаблонная строка', async () => {
    expect(codes(await check(list("a && b && 'no-such-class'")))).toEqual(['class-unknown']);
    expect(codes(await check(list("a || b && 'no-such-class'")))).toEqual(['class-dynamic', 'class-unknown']);
    expect(codes(await check(list("ok ? 'flex' : big && 'no-such-class'")))).toEqual(['class-unknown']);
    expect(codes(await check(list("ok && ['flex', 'no-such-class']")))).toEqual(['class-unknown']);
    expect(await check(list("ok && `text-${settings['align-x']}`"), alignX)).toEqual([]);
  });

  it('правая часть не класс — class-dynamic; в class={…} разбор тот же', async () => {
    expect(codes(await check(list('ok && b')))).toEqual(['class-dynamic']);
    expect(codes(await check("<p class={ok && 'no-such-class'}>x</p>"))).toEqual(['class-unknown']);
  });
});
