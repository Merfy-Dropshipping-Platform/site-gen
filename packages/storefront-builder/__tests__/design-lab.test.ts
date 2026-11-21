import { describe, expect, it } from 'vitest';
import type { StylePart } from '../src/design/design-style';
import { DesignError } from '../src/design/design-types';
import { labHtml, labSite, parseSites, summaryLine, type LabDeps } from '../src/design/lab';
import { dom } from '../src/design/tools/dom';
import { TAB_ORDER, type StyleTool } from '../src/design/tools/tool';
import { domBlock, fakeCaptured, fakeSession } from './design-fake';

// Стенд без браузера: все инструменты на одном захвате, итог цепочек, отчёт HTML.

const part: StylePart = {
  bands: {
    value: [{ bg: '#0f766e', fg: '#ffffff', primary: '#ffcc00', secondary: '#222222', area: 1, top: 0 }],
    confidence: 0.7,
  },
  'fonts.body': {
    value: { family: 'Onest', category: 'sans', weight: 400, cyrillic: true, source: 'google' },
    confidence: 0.8,
  },
  'radius.button': { value: 12, confidence: 0.8 },
  'button.look': { value: 'filled', confidence: 0.8 },
};
const tab = { order: TAB_ORDER.reads, limitMs: 1000 };
const good: StyleTool = {
  name: 'good',
  version: '1',
  ...tab,
  raw: () => Promise.resolve({ ok: '<b>' }),
  style: () => part,
};
const bad: StyleTool = {
  name: 'bad',
  version: '2',
  ...tab,
  raw: () => Promise.reject(new Error('упал')),
  style: () => ({}),
};

const deps = (fields: Partial<LabDeps> = {}): LabDeps => {
  const session = fakeSession(
    fakeCaptured({ dom: [domBlock({ tag: 'header', heading: 'Шапка <script>' }), domBlock({ tag: 'footer' })] }),
  );
  return {
    capture: () => Promise.resolve(session),
    style: [bad, good],
    outline: [dom],
    chainStyle: [bad, good],
    chainOutline: [dom],
    now: () => 0,
    budgetMs: 1000,
    ...fields,
  };
};

describe('стенд «Дизайн по ссылке»', () => {
  it('все инструменты, итог цепочек, снимок страницы', async () => {
    const site = await labSite(deps(), 'https://shop.example/');
    expect(site.error).toBeNull();
    expect(site.tools.map((tool) => [tool.kind, tool.name, tool.error])).toEqual([
      ['style', 'bad', 'упал'],
      ['style', 'good', null],
      ['outline', 'dom', null],
    ]);
    expect(site.chosen.tool).toBe('good');
    expect(site.chosen.outlineTool).toBe('dom');
    expect(site.chosen.outline?.blocks.map((block) => block.role)).toEqual(['header', 'footer']);
    expect(site.screen).toBe(Buffer.from('f').toString('base64'));
    expect(summaryLine(site)).toBe('https://shop.example/ — 0.0 с — стиль good, контур dom, полос 1, блоков 2');
    const html = labHtml([site], '2026-11-21');
    expect(html).toContain('#0f766e');
    expect(html).toContain('Шапка &lt;script&gt;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<script>');
  });

  it('захват отказал — строка с кодом, без инструментов', async () => {
    const site = await labSite(
      deps({ capture: () => Promise.reject(new DesignError('bot-protection', 'не пустил')) }),
      'https://x.example/',
    );
    expect(site.error).toEqual({ code: 'bot-protection', message: 'не пустил' });
    expect(summaryLine(site)).toContain('bot-protection: не пустил');
    expect(labHtml([site], 'т')).toContain('bot-protection');
  });

  it('все стили упали — итога нет, отчёт строится', async () => {
    const site = await labSite(deps({ style: [bad], chainStyle: [bad] }), 'https://shop.example/');
    expect(site.chosen.style).toBeNull();
    expect(labHtml([site], 'т')).toContain('—');
  });

  it('сбой внутри замера — строка с ошибкой, браузер закрыт', async () => {
    const session = fakeSession(fakeCaptured({ shot: () => Promise.reject(new Error('нет')) }));
    const broken: StyleTool = {
      ...good,
      style: () => {
        throw new Error('перевод упал');
      },
    };
    const site = await labSite(
      deps({ capture: () => Promise.resolve(session), style: [broken], chainStyle: [broken] }),
      'https://shop.example/',
    );
    expect(site.error?.code).toBe('tool-failed');
    expect(session.closed).toBe(1);
  });

  it('список сайтов: адрес — первое слово, заметки и пустые строки пропускаются', () => {
    expect(parseSites('# заголовок\n\nhttps://a.example/   # заметка\nftp://b\nhttp://c.example x\n')).toEqual([
      'https://a.example/',
      'http://c.example',
    ]);
  });
});
