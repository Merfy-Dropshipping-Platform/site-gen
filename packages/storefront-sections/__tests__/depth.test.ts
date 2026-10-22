import { describe, expect, it } from 'vitest';
import { MAX_TEMPLATE_DEPTH, templateDepth } from '../src/depth';

describe('глубина шаблона', () => {
  it('теги и скобки дают уровень; пустые элементы и закрытые «/>» — нет', () => {
    expect(templateDepth('<div><p>{settings.a}</p></div>')).toBe(3);
    expect(templateDepth('<div><br><img src="/a.jpg"><input /><span /></div>')).toBe(2);
    expect(templateDepth('<p>{((((1))))}</p>')).toBe(6);
    expect(templateDepth('<p>a<br>b</p>'.repeat(1000))).toBe(1);
  });

  it('вложенность за пределом видна до разбора', () => {
    expect(MAX_TEMPLATE_DEPTH).toBe(256);
    expect(templateDepth(`${'<div>'.repeat(5000)}x${'</div>'.repeat(5000)}`)).toBe(5000);
  });
});
