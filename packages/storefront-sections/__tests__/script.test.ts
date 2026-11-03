import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildScript } from '../src/script';

// Строка из шестнадцатеричных отпечатков почти не сжимается: вес brotli предсказуем (600 отпечатков — около 19 КБ,
// 1900 — около 60 КБ).
const noise = (count: number): string =>
  Array.from({ length: count }, (_, index) => createHash('sha256').update(String(index)).digest('hex')).join('');

const HEAD = "import { defineSection } from '@merfy/shell';\n";

const COLOR_MATCH = {
  'script.ts': [
    "import { defineSection, type Ctx } from '@merfy/shell';",
    "import { COLORS } from './lib/colors.ts';",
    'export default defineSection({',
    '  mount(_el, ctx: Ctx) {',
    "    ctx.ref('colors')?.text(COLORS.join(','));",
    '  },',
    '  actions: {',
    '    pick(button, ctx) {',
    "      const key = button.attr('data-color') ?? '';",
    "      ctx.ref('picked')?.text(String(ctx.state[key] ?? key));",
    "      button.toggleClass('bg-primary', true);",
    '    },',
    '  },',
    '});',
  ].join('\n'),
  'lib/colors.ts': "export const COLORS: string[] = ['black', 'camel'];",
};

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

const moduleOf = async (code: string): Promise<Record<string, unknown>> => {
  const loaded: unknown = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  return recordOf(loaded);
};

describe('сборка скрипта секции', () => {
  it('свои файлы — внутрь; import и defineSection сняты, a[k] — через помощник; факты исходника', async () => {
    const result = await buildScript(COLOR_MATCH, 'script.ts');
    const built = result.ok ? result.value : null;
    expect(built?.code).not.toContain('@merfy/shell');
    expect(built?.code).not.toMatch(/\bimport\b/);
    expect(built?.code).toContain('"camel"');
    expect(built?.code).toContain('Object.hasOwn');
    expect(built?.warnings).toEqual([]);
    expect(built?.brotliBytes).toBeGreaterThan(0);
    expect(built?.facts.actions).toEqual(['pick']);
    expect(built?.facts.classes).toEqual(['bg-primary']);
    const definition: unknown = (await moduleOf(built?.code ?? '')).default;
    expect(Object.keys(recordOf(definition))).toEqual(['mount', 'actions']);
  });

  it.each([
    [
      'чужой пакет',
      {
        'script.ts': `import confetti from 'canvas-confetti';\n${HEAD}export default defineSection({ mount() { confetti(); } });`,
      },
      'script.ts',
      22,
    ],
    [
      'файл вне секции',
      { 'script.ts': `import x from '../other/x.ts';\n${HEAD}export default defineSection({ mount() { x(); } });` },
      'script.ts',
      15,
    ],
  ])('импорт мимо правил (%s) — import-forbidden с местом', async (_, files, entry, column) => {
    const result = await buildScript(files, entry);
    expect(result.ok ? [] : result.problems).toMatchObject([
      { code: 'import-forbidden', file: entry, line: 1, column },
    ]);
  });

  it('require — sdk-only и import-forbidden разом', async () => {
    const files = {
      'script.js': `${HEAD}export default defineSection({ mount() { const x = require('./lib.js'); x(); } });`,
      'lib.js': 'export const lib = 1;',
    };
    const result = await buildScript(files, 'script.js');
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['sdk-only', 'import-forbidden']);
  });

  it('«только SDK»: document — sdk-only с подсказкой, сборки нет', async () => {
    const result = await buildScript(
      { 'script.ts': `${HEAD}export default defineSection({\n  mount() {\n    document.title = 'x';\n  },\n});` },
      'script.ts',
    );
    expect(result.ok ? [] : result.problems).toMatchObject([
      { code: 'sdk-only', file: 'script.ts', line: 4, column: 5 },
    ]);
  });

  it('опечатка — script-invalid со строкой и колонкой, одна строка на ошибку', async () => {
    const result = await buildScript(
      { 'script.ts': 'export default {\n  mount() {\n    const = 1;\n  },\n};' },
      'script.ts',
    );
    expect(result.ok ? [] : result.problems).toMatchObject([
      { code: 'script-invalid', file: 'script.ts', line: 3, column: 11 },
    ]);
  });

  it('нет export default — script-invalid', async () => {
    const result = await buildScript({ 'script.ts': 'export const mount = () => 1;' }, 'script.ts');
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['script-invalid']);
  });

  // 03.11, расширение picks: два файла, в одном — разбор HTML в строки, в другом — секция; сокращения { kind },
  // const { view, interval } = ctx.state, { collectionId, count }. Скрипт уходил на витрину с голым defineSection(…).
  const PICKS = {
    'script.ts': [
      "import { defineSection } from '@merfy/shell';",
      "import { richLines } from './rich.ts';",
      'type Card = { view?: string; interval?: number; description?: string };',
      'export default defineSection({',
      '  mount(_el, ctx) {',
      '    ctx.every(1000, () => {',
      '      const { view, interval } = ctx.state;',
      "      if (view !== 'carousel' || interval <= 0) return;",
      '      ctx.state.elapsed += 1;',
      '    });',
      '    ctx.watch(ctx.ext.picks.$pickCard(ctx.settings.pick), (value) => void apply(ctx, value as Card));',
      '  },',
      '});',
      'async function apply(ctx: any, card: Card): Promise<void> {',
      "  const collectionId = card.description ?? '';",
      '  const count = card.interval ?? 4;',
      '  const result = await ctx.ext.picks.pickProducts({ collectionId, count }, { quiet: true });',
      '  ctx.ref(`x`)?.list(richLines(result.data), (row: any, line: any) => row.text(line.kind));',
      '}',
    ].join('\n'),
    'rich.ts': [
      "const ENTITIES: Record<string, string> = { '&amp;': '&' };",
      'export type Line = { kind: string; mark: string; runs: string[] };',
      'export function richLines(source: string): Line[] {',
      '  const lines: Line[] = [];',
      "  const kind = 'p';",
      "  const mark = '';",
      '  lines.push({ kind, mark, runs: [] });',
      '  return lines.concat(source.split(" ").map((m) => ({ kind: ENTITIES[m] ?? m, mark, runs: [] })));',
      '}',
    ].join('\n'),
  };

  it.each([
    ['два файла, сокращения свойств', PICKS],
    [
      'вход в .js и псевдоним defineSection',
      {
        'script.js': [
          "import { defineSection as section } from '@merfy/shell';",
          "import { pair } from './lib/pair.js';",
          'export default section({ mount(_el, ctx) { const { a, b } = pair(1, 2); ctx.state[a] = { a, b }; } });',
        ].join('\n'),
        'lib/pair.js': 'export function pair(a, b) {\n  return { a, b };\n}',
      },
    ],
    [
      'тип из @merfy/shell во втором файле',
      {
        'script.ts': [
          "import { defineSection } from '@merfy/shell';",
          "import { tag } from './tag.ts';",
          "export default defineSection({ mount(_el, ctx) { const kind = 'p'; ctx.state.row = { kind, tag: tag(kind) }; } });",
        ].join('\n'),
        'tag.ts':
          "import type { Ctx } from '@merfy/shell';\nexport const tag = (kind: string, _ctx?: Ctx) => ({ kind });",
      },
    ],
  ])('%s: в собранном скрипте нет import и defineSection', async (_name, files) => {
    const entry = 'script.ts' in files ? 'script.ts' : 'script.js';
    const result = await buildScript(files, entry);
    expect(result.ok ? [] : result.problems).toEqual([]);
    const code = result.ok ? result.value.code : '';
    expect(code).not.toMatch(/\bimport\b|defineSection|@merfy\/shell/);
    const definition: unknown = (await moduleOf(code)).default;
    expect(typeof recordOf(definition).mount).toBe('function');
  });

  it('больше 10 КБ brotli — предупреждение, больше 50 КБ — отказ', async () => {
    const heavy = await buildScript(
      { 'script.ts': `${HEAD}export default defineSection({ mount() {} });\nexport const data = '${noise(600)}';` },
      'script.ts',
    );
    expect(heavy.ok && heavy.value.warnings.map((item) => item.code)).toEqual(['script-heavy']);
    const tooHeavy = await buildScript(
      { 'script.ts': `${HEAD}export default defineSection({ mount() {} });\nexport const data = '${noise(1900)}';` },
      'script.ts',
    );
    expect(tooHeavy.ok ? [] : tooHeavy.problems.map((item) => item.code)).toEqual(['script-too-heavy']);
  });
});
