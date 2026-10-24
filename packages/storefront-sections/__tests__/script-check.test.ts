import { describe, expect, it } from 'vitest';
import { checkScriptSource } from '../src/script-check';

// «Только SDK» и факты скрипта при сохранении (design.md блока 5, раздел 3.9; раздел 8, п. 4): таблица «код → ответ».
const HEAD = "import { defineSection } from '@merfy/shell';\n";
const inMount = (body: string): string =>
  `${HEAD}export default defineSection({\n  mount(el, ctx) {\n    ${body}\n  },\n});\n`;
const check = (text: string, file = 'script.ts') => checkScriptSource({ [file]: text }, file);
const lines = (text: string): string[] =>
  check(text).problems.map((item) => `${item.code} ${item.line}:${item.column} ${item.message}`);

// «Подбор шарфа» (раздел 1 design.md) с классом из скрипта.
export const SCARF_SCRIPT = `import { defineSection, type Ctx } from '@merfy/shell';

type State = { coat: string | null; mounts: number };

export default defineSection<State>({
  mount(_el, ctx) {
    ctx.state.mounts = (ctx.state.mounts ?? 0) + 1;
    show(ctx);
    const opened = Date.now();
    ctx.every(1000, () => {
      const seconds = Math.round((Date.now() - opened) / 1000);
      ctx.ref('clock')?.text(\`Подбор открыт \${seconds} с · запусков: \${ctx.state.mounts}\`);
    });
  },
  actions: {
    pick(button, ctx) {
      ctx.state.coat = button.attr('data-coat');
      show(ctx);
    },
  },
});

function show(ctx: Ctx<State>): void {
  const coat = ctx.state.coat ?? null;
  for (const button of ctx.refs('coat')) {
    const pressed = button.attr('data-coat') === coat;
    button.attr('aria-pressed', String(pressed));
    button.toggleClass('bg-primary', pressed);
    button.toggleClass('text-primary-foreground', pressed);
  }
  for (const scarf of ctx.refs('scarf')) {
    const goes = (scarf.attr('data-goes-with') ?? '').split(' ');
    scarf.toggle(coat === null || goes.includes(coat));
  }
}
`;

describe('только SDK: обходы и имена вне списка — sdk-only с местом', () => {
  it.each([
    ['({}).constructor.constructor("x")', '4:10 поле constructor — служебное поле JS'],
    ['globalThis.x', '4:5 globalThis — не из SDK: элементы своей секции — ctx.ref и ctx.refs'],
    ['this.x', '4:5 this в коде секции нет'],
    ["import('./x.js')", '4:5 import() — исполнять строку и подгружать код нельзя'],
    ['eval("1")', '4:5 eval — не из SDK: исполнять строку и подгружать код нельзя'],
    ['Function("return 1")', '4:5 Function — не из SDK'],
    ['Reflect.get(ctx, "x")', '4:5 Reflect — не из SDK: меняет объекты страницы'],
    ['Object.getPrototypeOf(ctx)', '4:5 Object.getPrototypeOf — не из SDK: меняет объекты страницы'],
    ['Math.random = () => 1', '4:5 Math.random — менять нельзя'],
    ['const M = Math', '4:15 Math — только вызовом или чтением члена из списка'],
    ['arguments.length', '4:5 arguments — не из SDK: параметры — по именам'],
    ['class A {}', '4:5 class в коде секции нет'],
    ['delete ctx.state.x', '4:5 delete нельзя'],
    ['document.querySelector("a")', '4:5 document — не из SDK'],
    ['setTimeout(() => 1, 1)', '4:5 setTimeout — не из SDK: таймеры — ctx.after и ctx.every'],
    ['fetch("/x")', '4:5 fetch — не из SDK: данные — ctx.data и модули SDK по uses'],
    ['localStorage.getItem("x")', '4:5 localStorage — не из SDK: хранилище секции — ctx.storage'],
    ['console.log(1)', '4:5 console — не из SDK: отладка — ctx.log'],
    ['const k = "a"; ctx.state[k] += 1', '4:20 a[k] += … и a[k]++ нельзя'],
    ['const k = "a"; ctx.state[k]++', '4:20 a[k] += … и a[k]++ нельзя'],
    ['const k = "a"; const { [k]: v } = ctx.state', '4:29 вычисляемый ключ в деструктуризации'],
    ['const k = "a"; [ctx.state[k]] = [1]', '4:21 вычисляемый ключ в деструктуризации'],
    ['const k = "a"; ctx.state?.[k]', '4:20 a?.[k] нельзя'],
    ['ctx["constructor"]', '4:9 поле constructor'],
    ['const o = { __proto__: null }', '4:17 поле __proto__'],
    ['const { constructor: c } = ctx', '4:13 поле constructor'],
    ['const { arguments: a } = ctx', '4:13 поле arguments'],
    ['new Foo()', '4:9 Foo — не из SDK'],
    ['const F = () => 1; new F()', '4:24 new — только у Date'],
    ['Symbol.iterator', '4:5 Symbol — не из SDK'],
    ['import.meta', '4:5 import.meta и new.target'],
    ['const __merfyGet = 1', '4:11 имя __merfyGet: префикс __merfy — служебный'],
    ['undefined = 1', '4:5 undefined — менять нельзя'],
    ['new Intl.Locale("ru")', '4:9 new — только у Date'],
    ['const o = { m() { const k = "a"; return super[k]; } }', '4:45 super в коде секции нет'],
  ])('%s', (body, expected) => {
    const found = lines(inMount(body));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((line) => line.startsWith('sdk-only '))).toBe(true);
    expect(found[0]).toContain(`sdk-only ${expected}`);
  });

  it.each([
    'const k = "a"; ctx.state[k] = 1',
    'const k = "a"; const v = ctx.state[k]',
    'const list = [1, 2]; const x = list[0] + list["length"]',
    'const n = Number("1") + parseInt("2", 10) + Number.parseFloat("1.5") + Math.max(1, 2)',
    'const d = new Date(Date.now()); const m = new Map(); const f = new Intl.NumberFormat("ru")',
    'const j = JSON.stringify(JSON.parse("{}"))',
    'const a = Array.from([1]); const o = Object.keys({ a: 1 })',
    'const p = Promise.all([]); const e = new Error("x")',
    'const u = undefined; const i = Infinity; const nan = NaN',
    'const s = String(1) + encodeURIComponent("a")',
    'ctx.listen("merfy:cart:add", () => undefined)',
    'const copy = { ...ctx.state }',
    'const x = ctx.state.coat!; const y = (ctx.state as { a?: number }).a',
  ])('разрешено: %s', (body) => {
    expect(lines(inMount(body))).toEqual([]);
  });

  it('«Подбор шарфа» проходит; факты — действия и классы скрипта', () => {
    const result = check(SCARF_SCRIPT);
    expect(result.problems).toEqual([]);
    expect(result.facts.actions).toEqual(['pick']);
    expect(result.facts.classes).toEqual(['bg-primary', 'text-primary-foreground']);
  });
});

describe('верхний уровень, импорты, определение', () => {
  it('вне defineSection — только объявления: let, вызов и const с вызовом — отказ', () => {
    const text = `${HEAD}const LIMIT = 3;\nconst COLORS = ['a', 'b'] as const;\nlet count = 0;\nfoo();\nconst made = make();\nexport const helper = (x: number): number => x;\ntype T = { a: number };\nexport default defineSection({ mount() {} });\n`;
    const found = lines(text).filter((line) => line.includes('только объявления'));
    expect(found.map((line) => line.split(' ')[1])).toEqual(['4:1', '5:1', '6:1']);
  });

  it('из @merfy/shell — только defineSection и типы; свой файл — по именам', () => {
    const text = `import { defineSection, part, type Ctx } from '@merfy/shell';\nimport * as lib from './lib.ts';\nexport default defineSection({ mount() {} });\n`;
    expect(lines(text)).toEqual([
      'sdk-only 1:25 из @merfy/shell — только defineSection и типы; модули — uses и ctx',
      'sdk-only 2:8 свои файлы — импорт по именам: import { show } from "./show"',
    ]);
  });

  it('export { … } from @merfy/shell в своём файле — отказ: модуль ядра мимо uses', () => {
    const result = checkScriptSource(
      {
        'script.ts': `${HEAD}import { cart } from './lib.ts';\nexport default defineSection({ mount() { cart.add({ productId: 'p' }); } });\n`,
        'lib.ts': "export { cart } from '@merfy/shell';\nexport type { Ctx } from '@merfy/shell';\n",
      },
      'script.ts',
    );
    expect(result.problems.map((item) => `${item.file}:${item.line}:${item.column} ${item.code}`)).toEqual([
      'lib.ts:1:1 sdk-only',
    ]);
  });

  it('defineSection с именем, без defineSection, defineSection не в export default — отказ', () => {
    const codes = (text: string): string[] => check(text).problems.map((item) => item.code);
    expect(codes(`${HEAD}export default defineSection('scarf', { mount() {} });\n`)).toEqual(['script-invalid']);
    expect(check(`${HEAD}export default defineSection('scarf', { mount() {} });\n`).problems[0]?.message).toBe(
      'имя секции пишется в section.json: export default defineSection({ … })',
    );
    expect(codes('export default { mount() {} };\n')).toEqual(['script-invalid']);
    const outside = lines(
      `${HEAD}function d() { return defineSection({}); }\nexport default defineSection({ mount() {} });\n`,
    );
    expect(outside).toEqual(['sdk-only 2:23 defineSection — только в export default defineSection({ … })']);
  });

  it('declare, enum, импорт типа значением — отказ: за ними имя страницы', () => {
    expect(
      lines(`${HEAD}declare const document: any;\nexport default defineSection({ mount() { document.cookie; } });\n`),
    ).toContain('sdk-only 2:1 declare, enum и namespace в коде секции нет');
    const typed = lines(
      `import { defineSection, type El as document } from '@merfy/shell';\nexport default defineSection({ mount() { document.title; } });\n`,
    );
    expect(typed.some((line) => line.startsWith('sdk-only 2:42 document — не из SDK'))).toBe(true);
    expect(lines(`${HEAD}enum E { A }\nexport default defineSection({ mount() {} });\n`)).toEqual([
      'sdk-only 2:1 declare, enum и namespace в коде секции нет',
    ]);
  });

  it('файл не разобрался — script-invalid с местом, parsed: false', () => {
    const result = check('export default {\n  mount() {\n    const = 1;\n  },\n};');
    expect(result.parsed).toBe(false);
    expect(result.problems.map((item) => [item.code, item.file, item.line, item.column])).toEqual([
      ['script-invalid', 'script.ts', 3, 11],
    ]);
  });

  it('script.js без типов проверяется так же', () => {
    const result = checkScriptSource(
      {
        'script.js': `${HEAD}export default defineSection({ mount(el, ctx) { ctx.ref('a')?.text(window.name); } });\n`,
      },
      'script.js',
    );
    expect(result.problems.map((item) => [item.file, item.code, item.column])).toEqual([['script.js', 'sdk-only', 68]]);
  });
});

describe('факты: ctx.listen, чтения ctx, ключи actions', () => {
  const FILES = {
    'script.ts': `${HEAD}import { watchCart } from './lib/cart.ts';\nexport default defineSection({\n  mount(el, ctx) {\n    ctx.listen('merfy:cart:ad', () => undefined);\n    subscribe(ctx);\n    watchCart(ctx);\n    const { settings } = ctx;\n    ctx.log(settings.heading, ctx.theme['cart-type']);\n  },\n  actions: { 'pick-coat': (b, c) => { c.listen('merfy:page:redy', () => undefined); } },\n});\nfunction subscribe(x) { x.listen('merfy:auth:signin', () => undefined); }\n`,
    'lib/cart.ts': `import type { Ctx } from '@merfy/shell';\nexport function watchCart(ctx: Ctx): void { ctx.listen('shop:scarf-match:coat-picked', () => undefined); }\n`,
  };

  it('ctx — параметры mount и действий, своя функция с ctx, параметр с типом Ctx из @merfy/shell', () => {
    const result = checkScriptSource(FILES, 'script.ts');
    expect(result.problems).toEqual([]);
    expect(result.facts.actions).toEqual(['pick-coat']);
    expect(result.facts.listens.map((item) => `${item.file}:${item.line}:${item.column} ${item.name}`).sort()).toEqual([
      'lib/cart.ts:2:56 shop:scarf-match:coat-picked',
      'script.ts:11:48 merfy:page:redy',
      'script.ts:13:34 merfy:auth:signin',
      'script.ts:5:16 merfy:cart:ad',
    ]);
  });

  it('чтения ctx.<имя>[.<поле>] и через const { settings } = ctx — для сверки имён блоков 9 и дальше', () => {
    const reads = checkScriptSource(FILES, 'script.ts').facts.reads.map((item) => item.path.join('.'));
    expect(reads).toEqual(expect.arrayContaining(['settings', 'settings.heading', 'theme.cart-type', 'log', 'listen']));
  });

  it('ключи actions не известны — null; без actions — пусто', () => {
    expect(
      check(`${HEAD}const A = {};\nexport default defineSection({ actions: { ...A } });\n`).facts.actions,
    ).toBeNull();
    expect(check(`${HEAD}export default defineSection({ mount() {} });\n`).facts.actions).toEqual([]);
  });
});
