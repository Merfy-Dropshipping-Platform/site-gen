import { describe, expect, it } from 'vitest';
import { inlineScripts } from '../src/inline-scripts';

// Исполняемые встроенные скрипты HTML для хешей CSP (блок 15, часть 15е, Р15е-4): текст как есть, по порядку.
describe('inlineScripts', () => {
  it('без src с типом JavaScript, module или importmap — текст как есть, по порядку', () => {
    const html =
      '<head><script>window.a = 1;</script><script type="module">import "./x.js";</script>' +
      '<script type="text/javascript">b()</script><script TYPE="Module">c()</script>' +
      '<script type="importmap">{"imports":{}}</script></head>';
    expect(inlineScripts(html)).toEqual(['window.a = 1;', 'import "./x.js";', 'b()', 'c()', '{"imports":{}}']);
  });

  it('файлы, блоки данных и пустые — не в списке', () => {
    const html =
      '<script type="module" src="/_merfy/b/ab.js"></script>' +
      '<script type="application/json" id="merfy-config">{"v":1}</script>' +
      '<script type="application/ld+json">{"@type":"Product"}</script><script></script>';
    expect(inlineScripts(html)).toEqual([]);
  });

  it('переводы строк и табы — текст без изменений', () => {
    const text = '\n\t\t\t(function(){const config = {"shopId":"s"};\n\t\t\twindow.x = config;\n\t\t})();\n\t\t';
    expect(inlineScripts(`<body><div></div><script>${text}</script></body>`)).toEqual([text]);
  });
});
