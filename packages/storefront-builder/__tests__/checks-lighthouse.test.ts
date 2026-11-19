// Lighthouse в месте `browser` (`checks/browser/lighthouse.ts`): разбор отчёта, настройки прогона, находки. Настоящий
// Lighthouse по вкладке Chromium и привязка путей к секциям — `look-vitals-browser.test.ts`.
import { describe, expect, it } from 'vitest';
import {
  failedNodes,
  LIGHTHOUSE_AUDITS,
  lighthouseConfig,
  lighthouseFindings,
  tagOfSnippet,
} from '../src/checks/browser/lighthouse';

const IMG_PATH = '1,HTML,1,BODY,0,MERFY-SECTION,0,IMG';

describe('разбор отчёта Lighthouse', () => {
  it('берутся только свои непройденные проверки и их элементы, в порядке списка проверок', () => {
    const nodes = failedNodes({
      lighthouseVersion: '13.6.0',
      audits: {
        'paste-preventing-inputs': { score: 0, details: { items: [{ node: { path: '1,HTML,1,BODY,2,INPUT' } }] } },
        'unsized-images': {
          score: 0,
          details: {
            items: [
              { node: { path: IMG_PATH, snippet: '<img src="/i/scarf.png" alt="Шарф">' } },
              { node: { snippet: '<img src="/i/hat.png">' } },
              { url: '/i/none.png' },
            ],
          },
        },
        'image-aspect-ratio': { score: 1, details: { items: [{ node: { path: IMG_PATH } }] } },
        'crawlable-anchors': { score: null },
        // Чужая проверка с непривычным видом не мешает.
        'first-contentful-paint': { score: 'n/a', numericValue: 4_300 },
      },
    });
    expect(nodes).toEqual([
      { audit: 'unsized-images', path: IMG_PATH, snippet: '<img src="/i/scarf.png" alt="Шарф">' },
      { audit: 'unsized-images', path: null, snippet: '<img src="/i/hat.png">' },
      { audit: 'unsized-images', path: null, snippet: '' },
      { audit: 'paste-preventing-inputs', path: '1,HTML,1,BODY,2,INPUT', snippet: '' },
    ]);
  });

  it('непройденная проверка без элементов — пусто', () => {
    expect(failedNodes({ audits: { 'unsized-images': { score: 0 } } })).toEqual([]);
  });

  it('отчёт или своя проверка не по форме — ошибка', () => {
    expect(() => failedNodes({})).toThrow();
    expect(() => failedNodes({ audits: { 'unsized-images': { score: 'плохо' } } })).toThrow();
  });
});

describe('настройки прогона', () => {
  it('только свои проверки; экран, устройство и браузер держит снимок; без снимка всей страницы', () => {
    for (const device of ['mobile', 'desktop'] as const) {
      expect(lighthouseConfig(device)).toEqual({
        extends: 'lighthouse:default',
        settings: {
          onlyAudits: [...LIGHTHOUSE_AUDITS],
          formFactor: device,
          screenEmulation: { disabled: true },
          emulatedUserAgent: false,
          disableFullPageScreenshot: true,
        },
      });
    }
  });
});

describe('находки Lighthouse', () => {
  it('одинаковые в секции — одной строкой со счётчиком; элемент вне секций — находка страницы', () => {
    const found = lighthouseFindings([
      { audit: 'unsized-images', section: 'media-1', where: 'img scarf.png' },
      { audit: 'unsized-images', section: 'media-1', where: 'img hat.png' },
      { audit: 'crawlable-anchors', section: null, where: 'a «Каталог»' },
    ]);
    expect(found).toEqual([
      {
        place: 'browser',
        check: 'lighthouse',
        rule: 'unsized-images',
        level: 'warning',
        section: 'media-1',
        where: 'img scarf.png',
        text: 'Картинка без размеров — страница прыгнет, когда она загрузится · задай width и height (или aspect-ratio в CSS)',
        count: 2,
        fix: 'silent',
      },
      {
        place: 'browser',
        check: 'lighthouse',
        rule: 'crawlable-anchors',
        level: 'warning',
        section: null,
        where: 'a «Каталог»',
        text: 'Ссылка, по которой поисковик не пройдёт · дай ей настоящий адрес в href, а действие без перехода сделай кнопкой',
        count: 1,
        fix: 'silent',
      },
    ]);
  });

  it('у каждой проверки свой текст «что не так · как починить»', () => {
    const texts = lighthouseFindings(
      LIGHTHOUSE_AUDITS.map((audit) => ({ audit, section: 'shop-1', where: 'элемент' })),
    ).map((finding) => finding.text);
    expect(new Set(texts).size).toBe(LIGHTHOUSE_AUDITS.length);
    for (const text of texts) expect(text).toMatch(/^[^·]+ · [^·]+$/);
  });

  it('чужая проверка или нет поля — ошибка', () => {
    expect(() => lighthouseFindings([{ audit: 'uses-http2', section: null, where: 'страница' }])).toThrow();
    expect(() => lighthouseFindings([{ audit: 'unsized-images', section: 'media-1' }])).toThrow();
  });
});

describe('элемента уже нет в странице — описание по началу разметки', () => {
  it('тег из начала разметки, иначе «элемент»', () => {
    expect(tagOfSnippet('<img src="/i/scarf.png">')).toBe('img');
    expect(tagOfSnippet('<A href="javascript:void(0)">')).toBe('a');
    expect(tagOfSnippet('<merfy-section data-section-id="hero-1">')).toBe('merfy-section');
    expect(tagOfSnippet('')).toBe('элемент');
    expect(tagOfSnippet('текст')).toBe('элемент');
  });
});
