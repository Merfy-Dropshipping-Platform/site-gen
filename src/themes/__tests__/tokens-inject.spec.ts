import { injectTokensCssIntoHtml, tokensStyleTag } from '../tokens-inject';

describe('tokens-inject', () => {
  const CSS = ':root{--radius-button:4px}';

  it('вставляет style перед </head>', () => {
    const out = injectTokensCssIntoHtml('<html><head><title>x</title></head><body></body></html>', CSS);
    expect(out).toBe(`<html><head><title>x</title>${tokensStyleTag(CSS)}</head><body></body></html>`);
  });

  it('идемпотентен — повторный вызов не дублирует', () => {
    const once = injectTokensCssIntoHtml('<html><head></head><body></body></html>', CSS);
    expect(injectTokensCssIntoHtml(once, CSS)).toBe(once);
  });

  it('style, вставленный другим источником (композером), обновляется, а не дублируется', () => {
    const fromComposer = `<html><head><style id="__merfy_tokens_css">:root{--x:1}</style></head><body></body></html>`;
    const out = injectTokensCssIntoHtml(fromComposer, CSS);
    expect(out.match(/__merfy_tokens_css/g)?.length).toBe(1);
    expect(out).toContain('--radius-button:4px');
  });

  it('обновляет существующий style при повторе с другим CSS', () => {
    const once = injectTokensCssIntoHtml('<html><head></head><body></body></html>', CSS);
    const twice = injectTokensCssIntoHtml(once, ':root{--radius-button:9px}');
    expect(twice).toContain('--radius-button:9px');
    expect(twice).not.toContain('--radius-button:4px');
  });

  it('без </head> возвращает HTML как есть', () => {
    expect(injectTokensCssIntoHtml('<div>no head</div>', CSS)).toBe('<div>no head</div>');
  });

  it('CSS с $-паттернами вставляется дословно (без интерпретации $&)', () => {
    const once = injectTokensCssIntoHtml('<html><head></head><body></body></html>', CSS);
    const out = injectTokensCssIntoHtml(once, ':root{--font-heading:"$&weird"}');
    expect(out).toContain('--font-heading:"$&weird"');
    expect(out.match(/__merfy_tokens_css/g)?.length).toBe(1);
  });
});
