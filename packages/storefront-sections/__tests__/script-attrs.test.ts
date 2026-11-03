import { checkAttributeWrite, checkCssVar } from '@merfy/shell/attributes';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { checkScriptSource } from '../src/script-check';

// Запись атрибутов и переменных CSS из кода секции (El.attr, El.cssVar) отказывается при сохранении, а не в браузере
// покупателя (поломка picks 0.2.1, 03.11: ctx.ref('bg')?.attr('fill', …) приняли, на витрине — ShellError). Правила —
// те же, что у ядра витрины (@merfy/shell/attributes): здесь проверяется форма вызова, список — общий.
const HEAD = "import { defineSection } from '@merfy/shell';\n";
const inMount = (body: string, outside = ''): string =>
  `${HEAD}${outside}export default defineSection({\n  mount(el, ctx) {\n    ${body}\n  },\n});\n`;
const check = (text: string) => checkScriptSource({ 'script.ts': text }, 'script.ts');
const attrProblems = (text: string) => check(text).problems.filter((item) => item.code === 'attr-forbidden');

describe('attr-forbidden: формы вызова', () => {
  it.each<[string, string, string?]>([
    ['точка', "ctx.ref('bg').attr('fill', '#fff');"],
    ['необязательная цепочка ?.', "ctx.ref('bg')?.attr('fill', '#fff');"],
    ['ключ-строка', "ctx.ref('bg')['attr']('fill', '#fff');"],
    ['?.[ключ-строка]', "ctx.ref('bg')?.['attr']('fill', '#fff');"],
    ['необязательный вызов ?.()', "ctx.ref('bg')?.attr?.('fill', '#fff');"],
    ['цепочка ref', "ctx.ref('a')?.ref('b')?.attr('fill', '#fff');"],
    ['ref через closest', "el.closest?.('x')?.attr('fill', '#fff');"],
    ['с !', "ctx.ref('bg')!.attr('fill', '#fff');"],
    ['в скобках с запятой', "(0, ctx.ref('bg')!.attr)('fill', '#fff');"],
    ['цикл по refs', "for (const row of ctx.refs('row')) row.attr('fill', '#fff');"],
    ['call', "ctx.ref('bg')?.attr.call(ctx.ref('bg'), 'fill', '#fff');"],
    ['apply', "ctx.ref('bg')?.attr.apply(ctx.ref('bg'), ['fill', '#fff']);"],
    ['имя в const файла', "ctx.ref('bg')?.attr(NAME, '#fff');", "const NAME = 'fill';\n"],
    ['имя в локальной const', "const name = 'fill'; ctx.ref('bg')?.attr(name, '#fff');"],
    ['шаблонная строка', 'ctx.ref("bg")?.attr(`fill`, "#fff");'],
    ['склейка строк', "ctx.ref('bg')?.attr('fi' + 'll', '#fff');"],
    ['ветка условия', "ctx.ref('bg')?.attr(on ? 'hidden' : 'fill', '#fff');", 'const on = Date.now() > 0;\n'],
    ['регистр', "ctx.ref('bg')?.attr('FILL', '#fff');"],
    ['псевдоним', "const put = ctx.ref('bg')?.attr; put?.('fill', '#fff');"],
    ['деструктуризация', "const { attr } = ctx.ref('bg')!; attr('fill', '#fff');"],
    ['деструктуризация с именем', "const { attr: put } = ctx.ref('bg')!; put('fill', '#fff');"],
    ['bind', "const put = ctx.ref('bg')!.attr.bind(ctx.ref('bg')); put('fill', '#fff');"],
  ])('%s', (_name, body, outside) => {
    const found = attrProblems(inMount(body, outside));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('fill');
  });

  it('место — имя атрибута в строке script.ts, текст называет атрибут и чем заменить', () => {
    const found = attrProblems(inMount("const bg = ctx.ref('bg');\n    bg?.attr('fill', '#fff');"));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'attr-forbidden', file: 'script.ts', line: 5, column: 14 });
    expect(found[0]?.message).toContain("attr('fill')");
    expect(found[0]?.message).toContain('этот атрибут код секции не пишет');
    expect(found[0]?.message).toContain('cssVar');
    expect(found[0]?.message).toContain('var(--имя)');
  });

  it('два запрещённых вызова — две проблемы с разными строками', () => {
    const found = attrProblems(inMount("ctx.ref('a')?.attr('style', 'x');\n    ctx.ref('b')?.attr('class', 'y');"));
    expect(found.map((item) => item.line)).toEqual([4, 5]);
  });
});

describe('attr-forbidden: подсказки по имени', () => {
  it.each([
    ['fill', 'cssVar'],
    ['style', 'cssVar'],
    ['stroke-width', 'cssVar'],
    ['width', 'cssVar'],
    ['display', 'hide()'],
    ['visibility', 'toggle(on)'],
    ['class', 'toggleClass'],
    ['id', 'data-ref'],
    ['onclick', 'data-action'],
    ['data-action', 'служебные data-*'],
    ['data-merfy-edit', 'служебные data-*'],
    ['foo', 'aria-*'],
  ])('%s → %s', (name, hint) => {
    const found = attrProblems(inMount(`ctx.ref('bg')?.attr('${name}', 'x');`));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain(hint);
  });
});

describe('attr-forbidden: значение-литерал', () => {
  it.each([
    ["attr('href', 'javascript:alert(1)')", 'адрес'],
    ["attr('href', '//evil.example/x')", 'адрес'],
    ["attr('src', 'http://x.ru/a.jpg')", 'адрес'],
    ["attr('src', 'data:image/png;base64,AAAA')", 'адрес'],
    ["attr('href', ' JavaScript:alert(1)')", 'адрес'],
    ["cssVar('--bg', 'red')", 'имя переменной'],
    ["cssVar('Bg', 'red')", 'имя переменной'],
    ["cssVar('bg color', 'red')", 'имя переменной'],
    ["cssVar('bg', 'url(https://evil.example/x.png)')", 'url('],
    ["cssVar('bg', 'image-set(\"x\" 1x)')", 'url('],
    ['cssVar(\'bg\', "u\\\\72 l(x.png)")', 'url('],
  ])('%s', (call, hint) => {
    const found = attrProblems(inMount(`ctx.ref('bg')?.${call};`));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain(hint);
  });

  it('cssVar: те же формы вызова', () => {
    const body = [
      "ctx.ref('a')?.['cssVar']('--x', 1);",
      "ctx.ref('b')?.cssVar?.('--x', 1);",
      "const { cssVar } = ctx.ref('c')!; cssVar('--x', 1);",
      "ctx.ref('d')?.cssVar.call(ctx.ref('d'), '--x', 1);",
    ].join('\n    ');
    expect(attrProblems(inMount(body))).toHaveLength(4);
  });
});

describe('attr-forbidden: разрешённое проходит', () => {
  it.each<[string, string?]>([
    ["ctx.ref('bg')?.attr('aria-pressed', 'true');"],
    ["ctx.ref('bg')?.attr('data-coat', 'grey');"],
    ["ctx.ref('bg')?.attr('hidden', '');"],
    ["ctx.ref('bg')?.attr('hidden', null);"],
    ["ctx.ref('bg')?.attr('title', 'Серое');"],
    ["ctx.ref('bg')?.attr('href', '/catalog');"],
    ["ctx.ref('bg')?.attr('href', 'https://merfy.ru/blog');"],
    ["ctx.ref('bg')?.attr('href', 'mailto:shop@example.ru');"],
    ["ctx.ref('bg')?.attr('src', '/media/a.jpg');"],
    ["ctx.ref('bg')?.attr('src', url);", 'const url = String(Date.now());\n'],
    ["ctx.ref('bg')?.attr('fill');"],
    ["ctx.ref('bg')?.attr(name, '#fff');", 'const name = String(Date.now());\n'],
    ["ctx.ref('bg')?.attr(String(1), '#fff');"],
    ["ctx.ref('bg')?.cssVar('pick-bg', '#c9a227');"],
    ["ctx.ref('bg')?.cssVar('progress', 40);"],
    ["ctx.ref('bg')?.cssVar('progress', null);"],
    ["ctx.ref('bg')?.cssVar('pick-bg', color);", 'const color = String(Date.now());\n'],
    ["ctx.ref('bg')?.cssVar('pick-bg', 'rgb(1, 2, 3)');"],
    ["ctx.ref('bg')?.toggleClass('bg-primary', true);"],
    ['ctx.ref(`a`)?.text("fill");'],
    ["ctx.log('fill', 1);"],
  ])('%s', (body, outside) => {
    expect(attrProblems(inMount(body, outside))).toEqual([]);
  });
});

describe('единый список с ядром витрины', () => {
  // Каждая запись из таблицы: ядро (checkAttributeWrite) и проверка при сохранении отвечают одинаково. Тег — img: src
  // у него можно, у ссылки нет; проверка тег не знает и src не отказывает по тегу.
  const writes: readonly [string, string | null][] = [
    ['fill', '#fff'],
    ['style', 'color:red'],
    ['class', 'x'],
    ['id', 'x'],
    ['onclick', 'x()'],
    ['ONMOUSEOVER', 'x()'],
    ['aria-label', 'x'],
    ['data-x', 'y'],
    ['data-action', 'y'],
    ['data-merfy-edit', 'y'],
    ['hidden', ''],
    ['tabindex', '0'],
    ['href', 'javascript:alert(1)'],
    ['href', '/ok'],
    ['href', null],
    ['src', '/a.jpg'],
    ['src', 'http://x.ru/a.jpg'],
  ];
  const coreRefuses = (name: string, value: string | null): boolean => {
    try {
      checkAttributeWrite('img', name, value);
      return false;
    } catch {
      return true;
    }
  };
  it.each(writes)('attr(%s, %j)', (name, value) => {
    const valueText = value === null ? 'null' : JSON.stringify(value);
    const found = attrProblems(inMount(`ctx.ref('bg')?.attr(${JSON.stringify(name)}, ${valueText});`));
    expect(found.length > 0).toBe(coreRefuses(name, value));
  });

  it.each([
    ['--bg', 'red'],
    ['bg', 'red'],
    ['Bg', 'red'],
    ['bg', 'url(x)'],
    ['bg', "a'b"],
    ['bg', 'a\\b'],
    ['bg', '#c9a227'],
  ])('cssVar(%s, %j)', (name, value) => {
    const refused = (() => {
      try {
        checkCssVar(name, value);
        return false;
      } catch {
        return true;
      }
    })();
    const found = attrProblems(inMount(`ctx.ref('bg')?.cssVar(${JSON.stringify(name)}, ${JSON.stringify(value)});`));
    expect(found.length > 0).toBe(refused);
  });
});

describe('приём секции', () => {
  const MANIFEST = JSON.stringify({ sdk: 1, name: 'pick', kind: 'section', title: 'Подборка', settings: [] });
  const TEMPLATE = '<section class="relative" data-ref="bg"><p class="m-0">Подборка</p></section>\n';

  it('prepareSection отказывает: код, файл, строка, колонка, атрибут', async () => {
    const script = inMount("ctx.ref('bg')?.attr('fill', '#fff');");
    const result = await prepareSection({
      prefix: 'ext-picks',
      files: { 'section.json': MANIFEST, 'template.astro': TEMPLATE, 'script.ts': script },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ code: 'attr-forbidden', file: 'script.ts', line: 4, column: 25 });
    expect(result.problems[0]?.message).toContain("attr('fill')");
  });

  it('цвет из данных через cssVar и var(--имя) в шаблоне — принимается', async () => {
    const script = inMount("ctx.ref('bg')?.cssVar('pick-bg', '#c9a227');");
    const template =
      '<section class="relative isolate" data-ref="bg"><svg class="absolute inset-0 -z-10 size-full" aria-hidden="true"><rect width="100%" height="100%" fill="var(--pick-bg)" /></svg><p class="m-0">Подборка</p></section>\n';
    const result = await prepareSection({
      prefix: 'ext-picks',
      files: { 'section.json': MANIFEST, 'template.astro': template, 'script.ts': script },
    });
    expect(result.ok).toBe(true);
  });
});
