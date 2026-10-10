import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildScript } from '../src/script';

// Строка из шестнадцатеричных отпечатков почти не сжимается: вес brotli предсказуем (600 отпечатков — около 19 КБ,
// 1900 — около 60 КБ).
const noise = (count: number): string =>
  Array.from({ length: count }, (_, index) => createHash('sha256').update(String(index)).digest('hex')).join('');

const COLOR_MATCH = {
  'script.ts': [
    "import { defineSection, part } from '@merfy/shell';",
    "import { COLORS } from './lib/colors.ts';",
    'export default defineSection({',
    '  async mount(element: HTMLElement) {',
    "    const cart = await part('cart');",
    "    element.dataset.colors = COLORS.join(',');",
    '    cart.count();',
    '  },',
    '});',
  ].join('\n'),
  'lib/colors.ts': "export const COLORS: string[] = ['black', 'camel'];",
};

describe('сборка скрипта секции', () => {
  it('свои файлы — внутрь, @merfy/shell — внешний; лёгкий скрипт без предупреждений', async () => {
    const result = await buildScript(COLOR_MATCH, 'script.ts');
    const built = result.ok ? result.value : null;
    expect(built?.code).toContain('from"@merfy/shell"');
    expect(built?.code).toContain('"camel"');
    expect(built?.warnings).toEqual([]);
    expect(built?.brotliBytes).toBeGreaterThan(0);
  });

  it.each([
    [
      'чужой пакет',
      { 'script.ts': "import confetti from 'canvas-confetti';\nexport default { mount() { confetti(); } };" },
      'script.ts',
      22,
    ],
    [
      'файл вне секции',
      { 'script.ts': "import x from '../other/x.ts';\nexport default { mount() { x(); } };" },
      'script.ts',
      15,
    ],
    [
      'require',
      {
        'script.js': "const x = require('./lib.js');\nexport default { mount() { x(); } };",
        'lib.js': 'module.exports = 1;',
      },
      'script.js',
      19,
    ],
  ])('импорт мимо правил (%s) — import-forbidden с местом', async (_, files, entry, column) => {
    const result = await buildScript(files, entry);
    expect(result.ok ? [] : result.problems).toMatchObject([
      { code: 'import-forbidden', file: entry, line: 1, column },
    ]);
  });

  it('опечатка — script-invalid со строкой и колонкой', async () => {
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

  it('больше 10 КБ brotli — предупреждение, больше 50 КБ — отказ', async () => {
    const heavy = await buildScript(
      { 'script.ts': `export default { mount() {} };\nexport const data = '${noise(600)}';` },
      'script.ts',
    );
    expect(heavy.ok && heavy.value.warnings.map((item) => item.code)).toEqual(['script-heavy']);
    const tooHeavy = await buildScript(
      { 'script.ts': `export default { mount() {} };\nexport const data = '${noise(1900)}';` },
      'script.ts',
    );
    expect(tooHeavy.ok ? [] : tooHeavy.problems.map((item) => item.code)).toEqual(['script-too-heavy']);
  });
});
