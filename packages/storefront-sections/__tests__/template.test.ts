import { describe, expect, it } from 'vitest';
import { templateProblems } from '../src/template';

describe('шаблон секции', () => {
  it('обычная разметка с data-атрибутами — без проблем', () => {
    const html = '<div class="swatches">\n  <button type="button" data-color="black">Чёрный</button>\n</div>';
    expect(templateProblems(html)).toEqual([]);
  });

  it('скрипт, стиль, рамка, вложенная секция — отказ со строкой и колонкой тега', () => {
    const html =
      '<p>Подбор</p>\n<script>alert(1)</script>\n  <STYLE>p{}</STYLE><iframe src="/x"></iframe>\n<merfy-section>';
    const found = templateProblems(html).map((item) => [item.code, item.line, item.column, item.message.split(':')[0]]);
    expect(found).toEqual([
      ['template-forbidden', 2, 1, 'тег <script> в шаблоне нельзя'],
      ['template-forbidden', 3, 3, 'тег <style> в шаблоне нельзя'],
      ['template-forbidden', 3, 21, 'тег <iframe> в шаблоне нельзя'],
      ['template-forbidden', 4, 1, 'тег <merfy-section> в шаблоне нельзя'],
    ]);
  });

  it('обработчик on… и адрес javascript: — отказ; слово «only =» в тексте — не обработчик', () => {
    const html = '<button onclick="buy()">Купить</button><a href=" javascript:void(0)">Ещё</a><p>only = 1</p>';
    expect(templateProblems(html).map((item) => item.message)).toEqual([
      'обработчик в атрибуте <button> нельзя: события вешает скрипт секции',
      'адрес javascript: в <a> нельзя: действия — в скрипте секции',
    ]);
  });
});
