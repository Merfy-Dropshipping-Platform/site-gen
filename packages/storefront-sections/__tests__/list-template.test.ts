import { parse } from '@astrojs/compiler-rs';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';
import { checkScriptSource } from '../src/script-check';
import { templateMarkup } from '../src/template-markup';

// El.list требует у элемента дочерний <template> (storefront-shell, core/el.ts: templateOf). Секция picks 0.2.3
// (03.11) вызывала ctx.ref('lines')?.list(…) на <div> без него: расширение приняли, а на витрине — ShellError
// «у <div> нет дочернего <template>» и пустой список. Теперь это отказ при сохранении: list-template-missing.
const MANIFEST = JSON.stringify({ sdk: 1, name: 'pick', kind: 'section', title: 'Подборка', settings: [] });
const HEAD = "import { defineSection } from '@merfy/shell';\n";
const inMount = (body: string, outside = ''): string =>
  `${HEAD}${outside}export default defineSection({\n  mount(el, ctx) {\n    ${body}\n  },\n});\n`;
const WITHOUT = '<div data-ref="lines" class="m-0"><p data-ref="line" class="m-0">x</p></div>\n';
const WITH = '<div data-ref="lines" class="m-0"><template><p data-ref="line" class="m-0">x</p></template></div>\n';

async function prepare(script: string, template: string) {
  return prepareSection({
    prefix: 'ext-picks',
    files: { 'section.json': MANIFEST, 'template.astro': template, 'script.ts': script },
  });
}

async function listProblems(script: string, template: string) {
  const result = await prepare(script, template);
  if (result.ok) return [];
  return result.problems.filter((item) => item.code === 'list-template-missing');
}

describe('list-template-missing: формы вызова list', () => {
  it.each<[string, string, string?]>([
    ['точка', "ctx.ref('lines').list([], () => {});"],
    ['необязательная цепочка ?.', "ctx.ref('lines')?.list([], () => {});"],
    ['ключ-строка', "ctx.ref('lines')['list']([], () => {});"],
    ['необязательный вызов ?.()', "ctx.ref('lines')?.list?.([], () => {});"],
    ['с !', "ctx.ref('lines')!.list([], () => {});"],
    ['as', "(ctx.ref('lines') as any).list([], () => {});"],
    ['цепочка ref', "ctx.ref('a')?.ref('lines')?.list([], () => {});"],
    ['closest', "el.closest('lines')?.list([], () => {});"],
    ['шаблонная строка без вставок', 'ctx.ref(`lines`)?.list([], () => {});'],
    ['El в const', "const lines = ctx.ref('lines'); lines?.list([], () => {});"],
    ['El в const и !', "const lines = ctx.ref('lines')!; lines.list([], () => {});"],
    ['call', "const lines = ctx.ref('lines')!; lines.list.call(lines, [], () => {});"],
    ['apply', "const lines = ctx.ref('lines')!; lines.list.apply(lines, [[], () => {}]);"],
    ['псевдоним метода', "const put = ctx.ref('lines')!.list; put([], () => {});"],
    ['bind', "const lines = ctx.ref('lines')!; const put = lines.list.bind(lines); put([], () => {});"],
    ['деструктуризация', "const { list } = ctx.ref('lines')!; list([], () => {});"],
    ['деструктуризация с именем', "const { list: put } = ctx.ref('lines')!; put([], () => {});"],
    ['строка внутри fill', "ctx.ref('x')?.list([], (row) => { row.ref('lines')?.list([], () => {}); });"],
    ['ref из своей функции файла', 'fill(ctx);', "function fill(c: any) { c.ref('lines')?.list([], () => {}); }\n"],
  ])('%s', async (_name, body, outside) => {
    const found = await listProblems(inMount(body, outside), WITHOUT);
    expect(found.filter((item) => item.message.includes('«lines»'))).toHaveLength(1);
  });

  it('место — слово list в script.ts, текст называет ref, пример и строку элемента в template.astro', async () => {
    const script = inMount("const lines = ctx.ref('lines');\n    lines?.list([], () => {});");
    const found = await listProblems(script, WITHOUT);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'list-template-missing', file: 'script.ts', line: 5, column: 12 });
    const message = found[0]?.message ?? '';
    expect(message).toContain('«lines»');
    expect(message).toContain('<template>');
    expect(message).toContain('template.astro:1');
    expect(message).toContain('первый ребёнок образцом не служит');
    expect(message).toContain('<div data-ref="lines"><template>');
  });

  it('отказ приёма: секция не принята, остальных проблем нет', async () => {
    const result = await prepare(inMount("ctx.ref('lines')?.list([], () => {});"), WITHOUT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((item) => item.code)).toEqual(['list-template-missing']);
  });

  it('два list на разных ref без <template> — две проблемы со своими строками', async () => {
    const template =
      '<div data-ref="lines" class="m-0"><p class="m-0">a</p></div>\n<ul data-ref="runs" class="m-0"><li class="m-0">b</li></ul>\n';
    const script = inMount("ctx.ref('lines')?.list([], () => {});\n    ctx.ref('runs')?.list([], () => {});");
    const found = await listProblems(script, template);
    expect(found.map((item) => [item.line, item.message.includes('«lines»'), item.message.includes('«runs»')])).toEqual(
      [
        [4, true, false],
        [5, false, true],
      ],
    );
  });

  it('вложенный список: у ref внутри <template> своего <template> нет — отказ только про него', async () => {
    const template =
      '<div data-ref="lines" class="m-0"><template><p data-ref="line" class="m-0"><span data-ref="runs" class="m-0"><a data-ref="run" class="m-0">x</a></span></p></template></div>\n';
    const script = inMount(
      "ctx.ref('lines')?.list([], (row) => {\n      row.ref('runs')?.list([], () => {});\n    });",
    );
    const found = await listProblems(script, template);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('«runs»');
    expect(found[0]?.line).toBe(5);
  });
});

describe('list-template-missing: принимается', () => {
  it('у элемента есть дочерний <template>', async () => {
    expect(await listProblems(inMount("ctx.ref('lines')?.list([], () => {});"), WITH)).toEqual([]);
    const result = await prepare(inMount("ctx.ref('lines')?.list([], () => {});"), WITH);
    expect(result.ok).toBe(true);
  });

  it('<template> не первым ребёнком — тоже годится (ядро ищет среди детей)', async () => {
    const template =
      '<div data-ref="lines" class="m-0"><p class="m-0">a</p><template><p class="m-0">x</p></template></div>\n';
    expect(await listProblems(inMount("ctx.ref('lines')?.list([], () => {});"), template)).toEqual([]);
  });

  it('вложенный список с <template> на каждом уровне', async () => {
    const template =
      '<div data-ref="lines" class="m-0"><template><p data-ref="line" class="m-0"><span data-ref="runs" class="m-0"><template><a data-ref="run" class="m-0">x</a></template></span></p></template></div>\n';
    const script = inMount(
      "ctx.ref('lines')?.list([], (row) => {\n      row.ref('runs')?.list([], () => {});\n    });",
    );
    expect(await listProblems(script, template)).toEqual([]);
  });

  it('<template> внутри выражения шаблона — не считается его отсутствием', async () => {
    const template = '<div data-ref="lines" class="m-0">{true && <template><p class="m-0">x</p></template>}</div>\n';
    expect(await listProblems(inMount("ctx.ref('lines')?.list([], () => {});"), template)).toEqual([]);
  });

  it('<template> только у одного из элементов с тем же data-ref', async () => {
    const template =
      '<div data-ref="lines" class="m-0"></div>\n<div data-ref="lines" class="m-0"><template><p class="m-0">x</p></template></div>\n';
    expect(await listProblems(inMount("ctx.ref('lines')?.list([], () => {});"), template)).toEqual([]);
  });

  it('элемента с таким data-ref в шаблоне нет или имя из выражения — не судим', async () => {
    const template = '<div data-ref={name} class="m-0"></div>\n';
    expect(await listProblems(inMount("ctx.ref('lines')?.list([], () => {});"), template)).toEqual([]);
    expect(await listProblems(inMount('ctx.ref(name)?.list([], () => {});', 'const name = "x";\n'), WITHOUT)).toEqual(
      [],
    );
  });

  it('list не у El: чужие объекты и методы того же имени не трогаем', async () => {
    const body = "const items = { list: (a: number[]) => a };\n    items.list([]);\n    ctx.ref('lines')?.text('x');";
    expect(await listProblems(inMount(body), WITHOUT)).toEqual([]);
  });
});

describe('разметка шаблона: refs', () => {
  const markupOf = async (text: string) => templateMarkup((await Promise.resolve(parse(text))).ast, text);

  it('refs — имя data-ref, есть ли дочерний <template> и место атрибута', async () => {
    const markup = await markupOf(WITH + WITHOUT);
    expect(markup.refs).toEqual([
      { name: 'lines', template: true, line: 1, column: 16 },
      { name: 'line', template: false, line: 1, column: 58 },
      { name: 'lines', template: false, line: 2, column: 16 },
      { name: 'line', template: false, line: 2, column: 48 },
    ]);
  });

  it('нет data-ref — ключа refs нет', async () => {
    expect(await markupOf('<p class="m-0">x</p>')).toEqual({ actions: [] });
  });

  it('факты скрипта: lists называет ref и место list', () => {
    const script = inMount("ctx.ref('lines')?.list([], () => {});");
    const facts = checkScriptSource({ 'script.ts': script }, 'script.ts').facts;
    expect(facts.lists).toEqual([{ name: 'lines', file: 'script.ts', line: 4, column: 23 }]);
  });
});
