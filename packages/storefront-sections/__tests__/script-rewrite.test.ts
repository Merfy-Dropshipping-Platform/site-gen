import { describe, expect, it } from 'vitest';
import { leftoversOf, rewriteChecked, rewriteModule } from '../src/script-rewrite';

// Переписывание модуля после esbuild (design.md блока 5, раздел 3.9, «После проверки», пп. 1–2). Вход — текст в том
// виде, в каком его печатает esbuild без сжатия: import из @merfy/shell, var … = defineSection({ … }), export { … }.
const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

const moduleOf = async (code: string): Promise<Record<string, unknown>> => {
  const loaded: unknown = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  return recordOf(loaded);
};

const definitionOf = async (code: string): Promise<Record<string, unknown>> => recordOf((await moduleOf(code)).default);

const call = (definition: Record<string, unknown>, name: string, ...args: unknown[]): unknown => {
  const fn: unknown = definition[name];
  return typeof fn === 'function' ? Reflect.apply(fn, undefined, args) : undefined;
};

const BUNDLED = [
  'import { defineSection as defineSection2 } from "@merfy/shell";',
  'var script_default = defineSection2({',
  '  read(o, k) {',
  '    return o[k];',
  '  },',
  '  write(o, k, v) {',
  '    o[k] = v;',
  '    return o;',
  '  },',
  '  nested(grid, i, j) {',
  '    grid[i][j] = grid[j][i] + 10;',
  '    return (grid[i] = grid[i])[j];',
  '  },',
  '  plain(list) {',
  '    return list[0] + list["length"];',
  '  }',
  '});',
  'export {',
  '  script_default as default',
  '};',
  '',
].join('\n');

describe('модуль секции после проверки', () => {
  it('без import и defineSection: export default { … }; помощник ключей — один раз в начале', () => {
    const text = rewriteModule(BUNDLED);
    expect(text).not.toContain('@merfy/shell');
    expect(text).not.toContain('defineSection');
    expect(text).toContain('var script_default = ({');
    expect(text.split('const __merfyGet =')).toHaveLength(2);
    expect(text).toContain('return __merfyGet(o, k);');
    expect(text).toMatch(/__merfySet\(o, k,\s+v\);/);
    expect(text).toMatch(/return __merfyGet\(\(__merfySet\(grid, i,\s+__merfyGet\(grid, i\)\)\), j\);/);
    expect(text).toContain('return list[0] + list["length"];');
  });

  it('a[k] читает только собственные поля; constructor и __proto__ — undefined; номера массивов и строк — как есть', async () => {
    const definition = await definitionOf(rewriteModule(BUNDLED));
    expect(call(definition, 'read', {}, 'constructor')).toBeUndefined();
    expect(call(definition, 'read', [], 'constructor')).toBeUndefined();
    expect(call(definition, 'read', {}, '__proto__')).toBeUndefined();
    expect(call(definition, 'read', { a: 1 }, 'a')).toBe(1);
    expect(call(definition, 'read', ['x', 'y'], 1)).toBe('y');
    expect(call(definition, 'read', 'abc', 'length')).toBe(3);
    expect(
      call(
        definition,
        'nested',
        [
          [1, 2],
          [3, 4],
        ],
        1,
        0,
      ),
    ).toBe(12);
  });

  it('ключ, который меняется между проверкой и чтением, не подменяет поле', async () => {
    const definition = await definitionOf(rewriteModule(BUNDLED));
    let calls = 0;
    const tricky = { toString: () => (calls++ === 0 ? 'a' : 'constructor') };
    expect(call(definition, 'read', { a: 1 }, tricky)).toBe(1);
  });

  it('a[k] = v со служебным полем — исключение; обычное поле пишется', async () => {
    const definition = await definitionOf(rewriteModule(BUNDLED));
    expect(() => call(definition, 'write', {}, '__proto__', { polluted: true })).toThrow(TypeError);
    expect(() => call(definition, 'write', {}, 'constructor', 1)).toThrow('поле constructor коду секции недоступно');
    expect(call(definition, 'write', {}, 'a', 1)).toEqual({ a: 1 });
  });

  // 03.11: секция расширения picks (несколько файлов, { kind } и const { a, b } = … в своих функциях) уходила на витрину
  // с голым defineSection(…): обход дерева останавливался на первом свойстве-сокращении — у него в Babel клон
  // идентификатора с range: undefined. Каждая форма ниже — свой вид сокращения в разных местах модуля.
  const SHORTHANDS: ReadonlyArray<readonly [string, string]> = [
    ['сокращение в литерале объекта до секции', 'function line(kind) {\n  return { kind, runs: [] };\n}\n'],
    [
      'сокращение со значением по умолчанию',
      'function pick({ view = "grid", interval }) {\n  return view + interval;\n}\n',
    ],
    ['сокращение в стрелке внутри массива', 'const rows = [1].map((index) => ({ index }));\n'],
    ['сокращений до секции нет, после — есть', ''],
  ];

  it.each(SHORTHANDS)('%s: defineSection и import сняты, a[k] — через помощник', async (_name, before) => {
    const code = [
      'import { defineSection } from "@merfy/shell";',
      '// merfy-section:rich.ts',
      before,
      '// merfy-section:script.ts',
      'var script_default = defineSection({',
      '  mount(el, ctx) {',
      '    const { view, interval } = ctx.state;',
      '    return { view, interval, key: ctx.state[view] };',
      '  }',
      '});',
      'function after(kind) {',
      '  return { kind };',
      '}',
      'export {',
      '  script_default as default',
      '};',
      '',
    ].join('\n');
    const result = rewriteChecked(code);
    expect(result.text).not.toContain('defineSection');
    expect(result.text).not.toMatch(/\bimport\b/);
    expect(result.text).toContain('__merfyGet(ctx.state, view)');
    expect(result.leftovers).toEqual([]);
    const definition = await definitionOf(result.text);
    expect(call(definition, 'mount', {}, { state: { view: 'grid', interval: 3, grid: 'G' } })).toEqual({
      view: 'grid',
      interval: 3,
      key: 'G',
    });
  });

  it('несколько import из @merfy/shell, псевдонимы и вызов с типом: все локальные имена сняты', async () => {
    const code = [
      'import { defineSection as ds } from "@merfy/shell";',
      'import { defineSection as ds2, defineStore } from "@merfy/shell";',
      'var a = ds({ mount() { return { x: 1 }; } });',
      'var b = ds2({ mount() { const k = 1; return { k }; } });',
      'var c = defineStore({ value: 1 });',
      'export { a as default, b, c };',
      '',
    ].join('\n');
    const result = rewriteChecked(code);
    expect(result.text).not.toMatch(/\bds2?\(|defineStore|\bimport\b/);
    expect(result.leftovers).toEqual([]);
    const loaded = await moduleOf(result.text);
    expect(Object.keys(recordOf(loaded.default))).toEqual(['mount']);
  });

  it('что осталось от @merfy/shell после переписывания — в leftovers с местом: import, реэкспорт, голый вызов', () => {
    const rewritten = rewriteChecked(
      'import { defineSection } from "@merfy/shell";\nvar d = defineSection;\nexport { d as default };\n',
    );
    expect(rewritten.leftovers).toMatchObject([{ kind: 'name', name: 'defineSection' }]);
    const reexport = rewriteChecked('export { defineSection } from "@merfy/shell";\n');
    expect(reexport.leftovers).toMatchObject([{ kind: 'import', name: '@merfy/shell' }]);
    const unbound = leftoversOf('var d = defineSection({});\nexport { d as default };\n', new Set(['defineSection']));
    expect(unbound).toEqual([{ kind: 'name', name: 'defineSection', offset: 8 }]);
    const own = leftoversOf('function f(defineSection) { return defineSection({}); }\n', new Set(['defineSection']));
    expect(own).toEqual([]);
    const key = leftoversOf('var d = { defineSection: 1 }; d.defineSection;\n', new Set(['defineSection']));
    expect(key).toEqual([]);
  });

  it('строка служебного поля, которую подставил esbuild, — тоже в помощник; без a[k] помощника нет', async () => {
    const folded = rewriteModule('var d = { get(o) { return o["constructor"]; } };\nexport { d as default };\n');
    expect(folded).toContain('__merfyGet(o, "constructor")');
    expect(call(await definitionOf(folded), 'get', {})).toBeUndefined();
    const plain = rewriteModule('var d = { mount() {} };\nexport { d as default };\n');
    expect(plain).not.toContain('__merfy');
  });
});
