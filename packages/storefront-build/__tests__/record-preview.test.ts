import { describe, expect, it } from 'vitest';
import type { BuildInputs } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
import { DEFAULT_BLOG_HANDLE, EXAMPLE_IDS, EXAMPLE_IMAGE } from '../src/record-preview';
import { money, type RecordType } from '../src/records';
import { isRecordType, pageInfoById, previewRecordPath, routeOf, shopRoutes } from '../src/routes';
import type { PageRender, SectionRenderRequest } from '../src/sections-render';
import { HOME_PAGE } from '../src/special-pages';
import { errorOf } from './support';
import {
  A1,
  B1,
  C1,
  ID,
  P1,
  P2,
  article,
  blog,
  collection,
  placed,
  product,
  recordInputs,
  recordPage,
} from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// Превью шаблонов записей (блок 8 «Секций и SDK», часть 8б-2; design.md 8.9, Р8б-14): страницы всех шаблонов, запись
// по id, по адресу или по умолчанию, примеры платформы — только в превью.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const [B2, A2, A3] = [ID(302), ID(402), ID(403)];
const previewPage = (requests: SectionRenderRequest[] = []): PageRender => ({
  ...recordPage(requests),
  mode: 'preview',
});
const recordAt = (inputs: BuildInputs, type: RecordType) =>
  routeOf(previewRecordPath(inputs, type, null) ?? '', inputs, 'preview').record;

describe('страницы превью', () => {
  it('в превью — страница у каждой записи, и у шаблона без секций; в сборке их нет', () => {
    const inputs = recordInputs([product(P1), collection(C1)]);
    expect(shopRoutes(inputs).map((route) => route.path)).toEqual(['/']);
    expect(routeOf('/product/sharf', inputs, 'preview').record?.id).toBe(P1);
    expect(routeOf('/collections/kashemir', inputs, 'preview').record?.id).toBe(C1);
    expect(routeOf('/product/sharf', inputs, 'preview')).toBe(routeOf('/product/sharf', inputs, 'preview'));
    expect(errorOf(() => routeOf('/product/sharf', inputs))).toMatchObject({ code: 'page-unknown' });
  });

  it('записей вида нет — пример: «Пример товара», 0 ₽, картинка-заглушка; в сборке примера нет', () => {
    const inputs = recordInputs([]);
    expect(previewRecordPath(inputs, 'product', null)).toBe('/product/primer-tovara');
    expect(recordAt(inputs, 'product')?.record).toMatchObject({
      id: EXAMPLE_IDS.product,
      title: 'Пример товара',
      price: money(0),
      images: [EXAMPLE_IMAGE],
    });
    expect(EXAMPLE_IMAGE.startsWith('data:image/svg+xml,')).toBe(true);
    expect(errorOf(() => routeOf('/product/primer-tovara', inputs))).toMatchObject({ code: 'page-unknown' });
    expect(shopRoutes(inputs).map((route) => route.path)).toEqual(['/']);
  });

  it('примеры других видов: коллекция — с товарами превью, запись — в блоге магазина, политика', () => {
    const inputs = recordInputs([product(P1), blog(B1)]);
    expect(recordAt(inputs, 'collection')?.record).toMatchObject({ title: 'Пример коллекции', productsCount: 1 });
    expect(recordAt(inputs, 'article')?.path).toBe('/blogs/novosti/primer-zapisi');
    expect(recordAt(inputs, 'blog')?.id).toBe(B1);
    expect(recordAt(inputs, 'policy')).toMatchObject({ id: 'privacy', path: '/legal/privacy' });
    const empty = recordInputs([]);
    expect(recordAt(empty, 'collection')?.record).toMatchObject({ productsCount: 1 });
    expect(recordAt(empty, 'article')?.path).toBe('/blogs/primer-bloga/primer-zapisi');
  });
});

describe('запись шаблона в превью', () => {
  it('record — id записи; нет или не нашли — первый товар по порядку входов (product.list: новые сверху)', () => {
    const inputs = recordInputs([product(P2, { handle: 'pled' }), product(P1)]);
    expect(previewRecordPath(inputs, 'product', P1)).toBe('/product/sharf');
    expect(previewRecordPath(inputs, 'product', null)).toBe('/product/pled');
    expect(previewRecordPath(inputs, 'product', 'missing')).toBe('/product/pled');
  });

  it('record — адрес от корня (ссылка из превью): основной, по id, закодированный; чужой вид — по умолчанию', () => {
    const inputs = recordInputs([product(P1), product(P2, { handle: 'плед' })]);
    expect(previewRecordPath(inputs, 'product', '/product/плед')).toBe('/product/плед');
    expect(previewRecordPath(inputs, 'product', encodeURI('/product/плед'))).toBe('/product/плед');
    expect(previewRecordPath(inputs, 'product', `/product/${P1}`)).toBe('/product/sharf');
    expect(previewRecordPath(inputs, 'collection', '/product/sharf')).toBe('/collections/primer-kollekcii');
  });

  it('блог по умолчанию — «Новости», в нём пусто — блог самой свежей записи; запись — самая свежая', () => {
    const sovety = blog(B2, { title: 'Советы', handle: 'sovety' });
    const inSovety = { blogId: B2, blogHandle: 'sovety' };
    const older = article(A1, { ...inSovety, slug: 'linen', publishedAt: '2026-10-19T10:00:00.000Z' });
    const newer = article(A2, { ...inSovety, slug: 'wool', publishedAt: '2026-10-21T10:00:00.000Z' });
    const quiet = recordInputs([blog(B1), sovety, older, newer]);
    expect(previewRecordPath(quiet, 'blog', null)).toBe('/blogs/sovety');
    expect(previewRecordPath(quiet, 'article', null)).toBe('/blogs/sovety/wool');
    const news = article(A3, { slug: 'old', publishedAt: '2026-10-01T10:00:00.000Z' });
    const busy = recordInputs([blog(B1), sovety, older, newer, news]);
    expect(previewRecordPath(busy, 'blog', null)).toBe(`/blogs/${DEFAULT_BLOG_HANDLE}`);
    expect(previewRecordPath(busy, 'article', null)).toBe('/blogs/sovety/wool');
  });
});

describe('страница превью и один блок на шаблоне', () => {
  it('секции шаблона получают запись; пустой шаблон в превью рендерится, в сборке такой страницы нет', async () => {
    const requests: SectionRenderRequest[] = [];
    const inputs = recordInputs([product(P1)], { product: [placed('product-1')] });
    await renderShopPage(inputs, '/product/sharf', theme, previewPage(requests));
    expect(requests[0]?.page).toMatchObject({ id: 'product', path: '/product/sharf', record: { id: P1 } });
    const empty = recordInputs([product(P1)]);
    await expect(renderShopPage(empty, '/product/sharf', theme, previewPage())).resolves.toMatchObject({
      row: { path: '/product/sharf' },
    });
    await expect(renderShopPage(empty, '/product/sharf', theme, recordPage())).rejects.toMatchObject({
      code: 'page-unknown',
    });
  });

  it('политика без секций и без текстов — пример текста от платформы', async () => {
    // Отклонение от плана (RULES §8, 24.10): содержимое файла — Buffer в рантайме, аннотация даёт toString('utf8').
    const { file }: { file: { content: { toString(encoding: string): string } } } = await renderShopPage(
      recordInputs([]),
      '/legal/privacy',
      theme,
      previewPage(),
    );
    const html = file.content.toString('utf8');
    expect(html).toContain('data-merfy-policy');
    expect(html).toContain('<title>Политика конфиденциальности</title>');
  });

  it('один блок: pageInfoById — страница шаблона с записью; не шаблон — как раньше', () => {
    const inputs = recordInputs([product(P1), product(P2, { handle: 'pled' })]);
    expect(pageInfoById(inputs, 'product', P2)).toMatchObject({
      id: 'product',
      path: '/product/pled',
      record: { id: P2 },
    });
    expect(pageInfoById(inputs, 'product')).toMatchObject({ path: '/product/sharf' });
    expect(pageInfoById(inputs, 'collection')).toMatchObject({ path: '/collections/primer-kollekcii' });
    expect(pageInfoById(inputs, 'not-found')).toEqual({ id: 'not-found', path: null });
    expect(pageInfoById(inputs, 'page-unknown')).toEqual(HOME_PAGE);
  });

  it('isRecordType — только виды записей', () => {
    expect(['product', 'collection', 'blog', 'article', 'policy'].every(isRecordType)).toBe(true);
    expect(['home', 'not-found', 'page-product', 'stand'].some(isRecordType)).toBe(false);
  });
});
