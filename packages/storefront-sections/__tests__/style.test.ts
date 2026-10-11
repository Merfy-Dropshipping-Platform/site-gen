import { describe, expect, it } from 'vitest';
import { scopeOf, scopeStyle } from '../src/style';

const NAME = 'shop:color-match';
const SCOPE = scopeOf(NAME);

describe('стили секции', () => {
  it('правила — в рамке секции, :scope — сама обёртка; @media — тоже; @keyframes — как есть', () => {
    const css = [
      '.swatch, button { color: var(--color-text); }',
      ':scope > .row { display: grid; }',
      '@media (min-width: 768px) { .row { gap: 8px; } }',
      '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }',
    ].join('\n');
    expect(scopeStyle(css, NAME)).toEqual({
      ok: true,
      value: {
        css: [
          `${SCOPE} .swatch, ${SCOPE} button { color: var(--color-text); }`,
          `${SCOPE} > .row { display: grid; }`,
          `@media (min-width: 768px) { ${SCOPE} .row { gap: 8px; } }`,
          '@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }',
        ].join('\n'),
        warnings: [],
      },
    });
  });

  it('сырой цвет — предупреждение со строкой, стили приняты', () => {
    const result = scopeStyle('.a { color: var(--color-text); }\n.b { background: #ff0000; }', NAME);
    expect(result.ok && result.value.warnings.map((item) => [item.code, item.line])).toEqual([['style-raw-color', 2]]);
  });

  it('html, body, :root, @import, @font-face, вложенное правило — отказ; предупреждения — в том же ответе', () => {
    const css = [
      '@import url("/x.css");',
      'body .a { margin: 0; }',
      ':root { --x: 1; }',
      '@font-face { font-family: X; src: url(x.woff2); }',
      '.card { color: rgb(0 0 0); .title { margin: 0; } }',
    ].join('\n');
    const result = scopeStyle(css, NAME);
    expect(result.ok ? [] : result.problems.map((item) => [item.code, item.line])).toEqual([
      ['style-forbidden', 1],
      ['style-forbidden', 2],
      ['style-forbidden', 3],
      ['style-forbidden', 4],
      ['style-raw-color', 5],
      ['style-forbidden', 5],
    ]);
  });

  it('CSS не разобрался — style-invalid со строкой и колонкой', () => {
    const result = scopeStyle('.a { color: red;\n.b { }', NAME);
    expect(result.ok ? [] : result.problems).toMatchObject([{ code: 'style-invalid', file: 'styles.css', line: 1 }]);
  });
});
