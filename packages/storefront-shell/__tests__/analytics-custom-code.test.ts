import { afterEach, describe, expect, it } from 'vitest';
import type { ConsentState } from '../src/core/analytics/consent';
import { customCodeRunner, type CustomCode } from '../src/core/analytics/custom-code';

// «Свой код» мерчанта (блок 13 «Секций и SDK», 13.4; В13-1 В): из текста — только <script>, в конец <head>, как у
// loader.js пяти тем; разбор в <template>; отметка согласия — по столбцу custom таблицы; каждый код — один раз.
// Метка выполнения — атрибут <html>: окно vitest jsdom не делегирует в тест новые свойства window из vm-контекста
// скрипта (разрешённая правка теста от 24.10).
const mark = (name: string): string | null => document.documentElement.getAttribute(name);

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('«свой код» мерчанта', () => {
  it('только <script> — в конец <head>: адрес и текст как в коде, async; остальная разметка не вставляется', () => {
    document.head.innerHTML = '<meta charset="utf-8">';
    const code =
      '<div id="chat">чат</div><script src="https://chat.example/widget.js"></script>' +
      '<script>document.documentElement.setAttribute("data-b13a-run", "ok")</script>' +
      '<noscript><img src="https://px.example/1.gif"></noscript>';
    customCodeRunner(document, [{ code, consent: 'none' }]).apply('unknown');
    const scripts = [...document.head.querySelectorAll('script')];
    expect(scripts.map((script) => [script.getAttribute('src'), script.text, script.async])).toEqual([
      ['https://chat.example/widget.js', '', true],
      [null, 'document.documentElement.setAttribute("data-b13a-run", "ok")', true],
    ]);
    expect(document.head.firstElementChild?.tagName).toBe('META');
    expect(document.querySelectorAll('#chat, noscript, img')).toHaveLength(0);
    expect(mark('data-b13a-run')).toBe('ok');
  });

  it('разбор — в <template>: картинки и обработчики из кода в документ не попадают', () => {
    const code = '<img src="x" onerror="document.documentElement.setAttribute(\'data-b13a-img\', \'1\')">';
    customCodeRunner(document, [{ code, consent: 'none' }]).apply('unknown');
    expect([document.querySelectorAll('img').length, document.head.children.length, mark('data-b13a-img')]).toEqual([
      0,
      0,
      null,
    ]);
  });

  it.each<[CustomCode['consent'], ConsentState, boolean]>([
    ['required', 'unknown', false],
    ['required', 'accepted', true],
    ['required', 'declined', false],
    ['none', 'unknown', true],
    ['none', 'accepted', true],
    ['none', 'declined', true],
  ])('отметка %s при ответе %s — запускается: %s', (consent, answer, runs) => {
    customCodeRunner(document, [{ code: '<script>window.__b13aTable = 1</script>', consent }]).apply(answer);
    expect(document.head.querySelectorAll('script')).toHaveLength(runs ? 1 : 0);
  });

  it('каждый код — один раз; «Принять» после «не ответил» запускает ждавший код', () => {
    const bump = (name: string): string =>
      `<script>document.documentElement.setAttribute("${name}", String(Number(document.documentElement.getAttribute("${name}")) + 1))</script>`;
    const codes: CustomCode[] = [
      { code: bump('data-b13a-once'), consent: 'none' },
      { code: bump('data-b13a-later'), consent: 'required' },
    ];
    const runner = customCodeRunner(document, codes);
    runner.apply('unknown');
    runner.apply('unknown');
    runner.apply('accepted');
    runner.apply('accepted');
    expect([mark('data-b13a-once'), mark('data-b13a-later')]).toEqual(['1', '1']);
  });
});
