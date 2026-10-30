import { describe, expect, it } from 'vitest';
import { parseListQuery } from '../src/list-query';
import { renderShopPage, type ShopTheme } from '../src/page';
import { VARIANTS_ATTRIBUTE, pageVariantsOf, variantsTagOf } from '../src/page-variants';
import { money, type ProductRecord } from '../src/records';
import { ID, RECORD_SECTION, product, recordInputs, recordPage } from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// JSON вариантов страницы и теги страницы с параметрами списка (блок 11 «Секций и SDK», часть 11а, Р11а-12, Р11а-13).
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const NOVA = ID(101);
const OPTIONS = [
  {
    id: 'color',
    name: 'Цвет',
    values: [
      { id: 'grey', value: 'серый', images: [], swatch: null },
      { id: 'blue', value: 'синий', images: ['https://s3.merfy.ru/p/blue.jpg'], swatch: null },
    ],
  },
  {
    id: 'length',
    name: 'Длина',
    values: [
      { id: '150', value: '150 см', images: [], swatch: null },
      { id: '180', value: '180 см', images: [], swatch: null },
    ],
  },
];
const VARIANTS = [
  {
    id: 'v-grey-150',
    title: 'серый / 150 см',
    price: 190000,
    compareAtPrice: null,
    available: true,
    options: { Цвет: 'серый', Длина: '150 см' },
  },
  {
    id: 'v-grey-180',
    title: 'серый / 180 см',
    price: 230000,
    compareAtPrice: null,
    available: false,
    options: { Цвет: 'серый', Длина: '180 см' },
  },
  {
    id: 'v-broken',
    title: 'зелёный',
    price: 1,
    compareAtPrice: null,
    available: true,
    options: { Цвет: 'зелёный', Длина: '150 см' },
  },
];
const inputs = (pages = {}) =>
  recordInputs([product(NOVA, { handle: 'nova', options: OPTIONS, variants: VARIANTS })], {
    product: [{ id: 'product-1', section: RECORD_SECTION, settings: {} }],
    ...pages,
  });
const jsonOf = (html: string): unknown => {
  const match = new RegExp(`<script type="application/json" ${VARIANTS_ATTRIBUTE}>([\\s\\S]*?)</script>`).exec(html);
  return match === null ? null : JSON.parse(match[1] ?? '');
};

describe('JSON вариантов страницы', () => {
  it('товар страницы: значения по id, цены — Money, наличие, сочетание по умолчанию; чужое значение — без варианта', async () => {
    const rendered = await renderShopPage(inputs(), '/product/nova', theme, recordPage());
    expect(jsonOf(Buffer.from(rendered.file.content).toString('utf8'))).toEqual({
      [NOVA]: {
        options: [
          {
            id: 'color',
            name: 'Цвет',
            values: [
              { id: 'grey', value: 'серый', images: [] },
              { id: 'blue', value: 'синий', images: ['https://s3.merfy.ru/p/blue.jpg'] },
            ],
          },
          {
            id: 'length',
            name: 'Длина',
            values: [
              { id: '150', value: '150 см', images: [] },
              { id: '180', value: '180 см', images: [] },
            ],
          },
        ],
        variants: [
          { id: 'v-grey-150', options: ['grey', '150'], price: money(190000), compareAtPrice: null, available: true },
          { id: 'v-grey-180', options: ['grey', '180'], price: money(230000), compareAtPrice: null, available: false },
        ],
        default: 'v-grey-150',
      },
    });
  });

  it('страница без товаров — тега нет; «<» в тексте экранирован', async () => {
    const home = await renderShopPage(inputs(), '/', theme, recordPage());
    expect(Buffer.from(home.file.content).toString('utf8')).not.toContain(VARIANTS_ATTRIBUTE);
    const escaped: ProductRecord = {
      id: 'p-escaped',
      title: 'Шарф',
      slug: 'sharf',
      url: '/product/sharf',
      description: '',
      price: money(190000),
      compareAtPrice: null,
      images: [],
      available: true,
      preorder: false,
      options: [{ id: 'g', name: '</script>', values: [] }],
      variants: [],
      collections: [],
      updatedAt: '2026-10-20T10:00:00.000Z',
    };
    const tag = variantsTagOf(pageVariantsOf([escaped]));
    expect(tag).not.toContain('</script><');
    expect(tag).toContain('\\u003c/script>');
  });
});

describe('теги страницы с параметрами списка', () => {
  const listInputs = () =>
    recordInputs([product(NOVA, { handle: 'nova' })], {
      catalog: [{ id: 'list-1', section: RECORD_SECTION, settings: { 'per-page': 2 } }],
    });

  it('с параметрами — noindex, follow и merfy-list с каноническим видом; canonical без параметров', async () => {
    const query = parseListQuery(new URLSearchParams('sort=price_desc&availability=in_stock'));
    const rendered = await renderShopPage(listInputs(), '/catalog', theme, recordPage(), {
      query,
      listed: { ids: [NOVA], total: 1, facets: null },
    });
    const html = Buffer.from(rendered.file.content).toString('utf8');
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain('<meta name="merfy-list" content="availability=in_stock&amp;sort=price_desc">');
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/catalog">/);
  });

  it('без параметров — тегов нет', async () => {
    const html = Buffer.from(
      (await renderShopPage(listInputs(), '/catalog', theme, recordPage())).file.content,
    ).toString('utf8');
    expect(html).not.toContain('merfy-list');
    expect(html).not.toContain('noindex');
  });
});
