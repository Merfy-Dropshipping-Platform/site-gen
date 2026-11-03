import { describe, expect, it, vi } from 'vitest';

// Переписывание, которое что-то оставило от @merfy/shell, должно кончаться отказом при приёме — с файлом автора и
// строкой, — а не страницей, на которой падают скрипты всех секций (03.11: «defineSection is not defined»). Настоящее
// переписывание после правки обхода такого уже не оставляет, поэтому остаток подставлен: проверяется проводка.
vi.mock('../src/script-rewrite', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/script-rewrite')>();
  return {
    ...original,
    rewriteChecked: (code: string) => {
      const text = original
        .rewriteChecked(code)
        .text.replace('var script_default = ({', 'var script_default = defineSection({');
      return { text, leftovers: original.leftoversOf(text, new Set(['defineSection'])) };
    },
  };
});

const { buildScript } = await import('../src/script');

const FILES = {
  'script.ts': [
    "import { defineSection } from '@merfy/shell';",
    "import { helper } from './lib/helper.ts';",
    '',
    'export default defineSection({',
    '  mount(_el, ctx) {',
    '    ctx.state.value = helper();',
    '  },',
    '});',
  ].join('\n'),
  'lib/helper.ts': 'export function helper(): number {\n  return 1;\n}',
};

describe('остаток от @merfy/shell после переписывания', () => {
  it('check отказывает: script-invalid с файлом и строкой, где автор писал defineSection', async () => {
    const result = await buildScript(FILES, 'script.ts', 'defineSection');
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems).toMatchObject([
      { code: 'script-invalid', file: 'script.ts', line: 1, column: 10 },
    ]);
    const message = result.ok ? '' : (result.problems[0]?.message ?? '');
    expect(message).toContain('defineSection');
    expect(message).toContain('ReferenceError');
  });
});
