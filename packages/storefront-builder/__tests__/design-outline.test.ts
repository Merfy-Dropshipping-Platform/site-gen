import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { EMPTY_CONTENT, httpsUrl, parseContent } from '../src/design/design-content';
import { parseDom, parseProbe, type DomBlock } from '../src/design/design-dom';
import { bandOf, blockOf, contextOf, domOutline, domRole } from '../src/design/design-outline';
import { ROLES } from '../src/design/design-types';
import { covered, designlangOutline } from '../src/design/tools/designlang';
import { dom } from '../src/design/tools/dom';
import { domBlock, fakeCaptured } from './design-fake';

const block = (fields: Partial<DomBlock>): DomBlock => domBlock({ box: { x: 0, y: 1000, w: 1366, h: 400 }, ...fields });
const roleOf = (fields: Partial<DomBlock>, index = 3, total = 10): string =>
  domRole(contextOf(block(fields), index, total)).role;

describe('роли блоков по правилам DOM', () => {
  it.each<[string, Partial<DomBlock>, number?]>([
    ['header', { tag: 'header' }],
    ['header', { tag: 'div', box: { x: 0, y: 0, w: 1366, h: 90 }, links: 6 }, 0],
    ['footer', { tag: 'footer' }],
    ['footer', { links: 12 }, 9],
    ['service', { fixed: true, text: 'Мы используем файлы cookie' }],
    ['announcement', { box: { x: 0, y: 0, w: 1366, h: 40 }, text: 'Доставка бесплатно от 3000 ₽' }, 0],
    ['video', { video: true }],
    ['map', { iframeMap: true }],
    ['newsletter', { form: true, email: true, fields: 1, text: 'Подпишитесь на рассылку' }],
    ['contact-form', { form: true, textarea: true }],
    ['faq', { details: 4 }],
    ['faq', { heading: 'Частые вопросы' }],
    ['slider', { slides: 3 }],
    ['reviews', { heading: 'Отзывы покупателей' }],
    ['instagram', { text: 'Мы в Instagram' }],
    ['brands', { heading: 'Наши бренды', images: 8 }],
    ['blog', { heading: 'Блог', cards: 3, images: 3 }],
    ['countdown', { text: 'До конца акции 02 : 14 : 55' }],
    ['product-grid', { cards: 8, prices: 8, images: 8 }],
    ['collection-tiles', { cards: 4, images: 4, text: 'Категории' }],
    ['features', { cards: 3, images: 0, text: 'быстро надёжно' }],
    ['gallery', { cards: 4, images: 4 }],
    ['hero', { box: { x: 0, y: 80, w: 1366, h: 600 }, images: 1 }, 1],
    ['image-text', { layout: 'image-left', images: 1 }],
    ['gallery', { images: 6 }],
    ['text', { text: 'Длинный текст о магазине, его истории, ценностях, людях и том, как мы делаем наши вещи.' }],
    ['text', {}],
  ])('%s', (role, fields, index) => {
    expect(roleOf(fields, index)).toBe(role);
  });

  it('все роли правил — из словаря контракта', () => {
    const vocabulary = new Set<string>(ROLES);
    const outline = domOutline(
      [block({ tag: 'header' }), block({ cards: 5, prices: 5 }), block({ tag: 'footer' })],
      [],
    );
    expect(outline.blocks.every((entry) => vocabulary.has(entry.role))).toBe(true);
  });
});

describe('блок контура', () => {
  it('полоса цвета — по середине блока', () => {
    const bands = [{ top: 0 }, { top: 900 }, { top: 2000 }];
    expect(bandOf({ x: 0, y: 0, w: 10, h: 100 }, bands)).toBe(0);
    expect(bandOf({ x: 0, y: 800, w: 10, h: 400 }, bands)).toBe(1);
    expect(bandOf({ x: 0, y: 5000, w: 10, h: 10 }, bands)).toBe(2);
    expect(bandOf({ x: 0, y: 0, w: 10, h: 10 }, [])).toBe(0);
  });

  it('поля по контракту: целые рамки, заголовок до 120, колонок ≥ 1', () => {
    const made = blockOf(
      block({ box: { x: 0.4, y: 10.6, w: 1366.2, h: 99.5 }, heading: 'х'.repeat(200), columns: 0, cards: 3.2 }),
      { role: 'features', confidence: 0.555 },
      [{ top: 0 }],
    );
    expect(made).toMatchObject({
      role: 'features',
      confidence: 0.56,
      box: { x: 0, y: 11, w: 1366, h: 100 },
      columns: 1,
      cards: 3,
      band: 0,
    });
    expect(made.heading).toHaveLength(120);
  });

  it('переходник dom: роли по правилам, сырого ответа — только число блоков', async () => {
    const facts = { google: new Set<string>(), dom: [block({ tag: 'header' })], bands: [] };
    expect(dom.outline(null, facts).blocks[0]?.role).toBe('header');
    expect(await dom.raw({ captured: fakeCaptured({ dom: facts.dom }), budgetMs: 1 })).toEqual({ blocks: 1 });
  });
});

describe('designlang поверх DOM', () => {
  const raw: unknown = JSON.parse(
    gunzipSync(readFileSync(new URL('./design-fixtures/nova.designlang.json.gz', import.meta.url))).toString('utf8'),
  );

  it('доля накрытия', () => {
    expect(covered({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 50 })).toBe(0.5);
    expect(covered({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 10, h: 10 })).toBe(0);
    expect(covered({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(0);
  });

  it('секция увереннее правила — её роль; слабее — роль DOM', () => {
    const facts = {
      google: new Set<string>(),
      dom: [
        block({ box: { x: 0, y: 10961, w: 1366, h: 498 }, text: 'просто текст' }),
        block({ box: { x: 0, y: 2000, w: 1366, h: 600 }, cards: 8, prices: 8 }),
      ],
      bands: [{ top: 0 }],
    };
    const outline = designlangOutline(raw, facts);
    expect(outline.blocks.map((entry) => entry.role)).toEqual(['footer', 'product-grid']);
    expect(outline.blocks[0]?.confidence).toBe(0.95);
  });

  it('чужой ответ без секций — роли DOM', () => {
    expect(designlangOutline({}, { dom: [block({ tag: 'footer' })], bands: [] }).blocks[0]?.role).toBe('footer');
  });
});

describe('разбор ответов скриптов страницы', () => {
  it('контур: значения по умолчанию, негодные блоки отброшены', () => {
    const parsed = parseDom({
      height: 'x',
      blocks: [
        { tag: 'div', box: { x: 1, y: 2, w: 3, h: 4 }, heading: '  Заголовок  ', layout: 'diagonal' },
        'мусор',
        null,
      ],
    });
    expect(parsed.height).toBe(0);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({
      tag: 'div',
      heading: 'Заголовок',
      layout: 'unknown',
      cards: 0,
      form: false,
    });
    expect(parseDom(null)).toEqual({ height: 0, blocks: [] });
  });

  it('признаки страницы', () => {
    expect(parseProbe({ title: 'Т', textLength: 10, canvas: 0.9, html: '<p>', google: ['Onest'] })).toEqual({
      title: 'Т',
      textLength: 10,
      canvas: 0.9,
      html: '<p>',
      google: ['Onest'],
    });
    expect(parseProbe(undefined)).toEqual({ title: '', textLength: 0, canvas: 0, html: '', google: [] });
  });
});

describe('содержимое своего сайта', () => {
  it('только https-картинки, ссылки меню http(s), длины режутся, блоков не больше контура', () => {
    const content = parseContent(
      {
        logo: 'https://shop.example/logo.png',
        menu: [
          { label: 'Каталог', href: 'https://shop.example/catalog' },
          { label: 'Почта', href: 'mailto:a@b.c' },
          { label: '', href: 'https://x.y' },
        ],
        blocks: [
          {
            heading: 'Тёплые шарфы',
            text: 'т'.repeat(3000),
            buttons: ['Купить', 42, 'к'.repeat(100)],
            items: [{ heading: 'Шарф', text: null, image: 'http://insecure.example/a.jpg' }],
            images: ['https://cdn.example/a.jpg', 'https://cdn.example/a.jpg', 'data:image/png;base64,xx', 'не адрес'],
          },
          { heading: 'лишний' },
        ],
      },
      1,
    );
    expect(content.logo).toBe('https://shop.example/logo.png');
    expect(content.menu).toEqual([{ label: 'Каталог', href: 'https://shop.example/catalog' }]);
    expect(content.blocks).toHaveLength(1);
    expect(content.blocks[0]).toMatchObject({
      index: 0,
      heading: 'Тёплые шарфы',
      images: ['https://cdn.example/a.jpg'],
      items: [{ heading: 'Шарф', text: null, image: null }],
    });
    expect(content.blocks[0]?.text).toHaveLength(2000);
    expect(content.blocks[0]?.buttons).toEqual(['Купить', 'к'.repeat(60)]);
    expect(parseContent(null, 3)).toEqual(EMPTY_CONTENT);
    expect(httpsUrl('https://a.b/c d')).toBe('https://a.b/c%20d');
  });
});
