import { describe, expect, it } from 'vitest';
import type { ShopPageLocals } from '../src/locals';
import { checkPageRow } from '../src/manifest';
import { policyTextHtml } from '../src/policy-text';
import { renderShopPage, type ShopTheme } from '../src/page';
import { RECORD_FIELDS, RECORD_TYPES, money } from '../src/records';
import { routeDuplicates, routeOf, shopRoutes, templateShown } from '../src/routes';
import type { SectionRenderRequest } from '../src/sections-render';
import { errorOf } from './support';
import {
  A1,
  AT,
  B1,
  C1,
  LATER,
  P1,
  P2,
  P3,
  SITE_KEY,
  article,
  blog,
  collection,
  placed,
  policy,
  product,
  recordInputs,
  recordPage,
} from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// Страницы записей (блок 8 «Секций и SDK», часть 8б): страница на каждую запись с показанным шаблоном, запись — секциям,
// строка манифеста — по записи.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const ALL = [
  product(P1, {}, LATER),
  collection(C1),
  blog(B1),
  article(A1),
  policy('privacy', 'Мы бережём данные покупателей'),
];
const TEMPLATES = {
  product: [placed('product-1')],
  collection: [placed('collection-1')],
  blog: [placed('blog-1')],
  article: [placed('article-1')],
  policy: [placed('policy-1')],
};

describe('страницы записей в списке страниц', () => {
  it('шаблон с видимой секцией — страница на каждую запись: id шаблона, адрес, файл, сущность', () => {
    const routes = shopRoutes(recordInputs(ALL, TEMPLATES));
    expect(routes.map((route) => [route.id, route.path, route.file, route.entity])).toEqual([
      ['home', '/', 'index.html', 'site'],
      ['product', '/product/sharf', 'product/sharf/index.html', 'product'],
      ['collection', '/collections/kashemir', 'collections/kashemir/index.html', 'collection'],
      ['blog', '/blogs/novosti', 'blogs/novosti/index.html', 'blog'],
      ['article', '/blogs/novosti/linen', 'blogs/novosti/linen/index.html', 'publication'],
      ['policy', '/legal/privacy', 'legal/privacy/index.html', 'policy'],
    ]);
    expect(routes[1]?.record?.id).toBe(P1);
  });

  it('шаблон без секций или только со скрытыми — страниц его записей нет; политика — и с пустым шаблоном', () => {
    const inputs = recordInputs(ALL, { product: [placed('product-1', true)] });
    expect(shopRoutes(inputs).map((route) => route.path)).toEqual(['/', '/legal/privacy']);
    expect(RECORD_TYPES.map((type) => templateShown(inputs, type))).toEqual([false, false, false, false, true]);
    expect(errorOf(() => routeOf('/product/sharf', inputs))).toMatchObject({ code: 'page-unknown' });
  });

  it('список страниц — один раз на входы; адрес по id — не страница; 404 — по своему адресу', () => {
    const inputs = recordInputs(ALL, TEMPLATES);
    expect(shopRoutes(inputs)).toBe(shopRoutes(inputs));
    expect(routeOf('/product/sharf', inputs).record?.id).toBe(P1);
    expect(errorOf(() => routeOf(`/product/${P1}`, inputs))).toMatchObject({ code: 'page-unknown' });
    expect(routeOf('/404', inputs).id).toBe('not-found');
    expect(routeOf('/', inputs).id).toBe('home');
  });
});

describe('запись страницы — секциям и в строке манифеста', () => {
  it('секция страницы товара получает page.record с публичными полями; на главной записи нет', async () => {
    const requests: SectionRenderRequest[] = [];
    const inputs = recordInputs(ALL, { ...TEMPLATES, home: [placed('home-1')] });
    await renderShopPage(inputs, '/product/sharf', theme, recordPage(requests));
    await renderShopPage(inputs, '/', theme, recordPage(requests));
    const [onProduct, onHome] = requests.map((request) => request.page);
    expect(onProduct).toMatchObject({
      id: 'product',
      path: '/product/sharf',
      record: { id: P1, title: 'Шарф', url: '/product/sharf', price: money(190000), available: true },
    });
    expect(Object.keys(onProduct?.record ?? {}).sort()).toEqual([...RECORD_FIELDS.product].sort());
    expect(onHome).toEqual({ id: 'home', path: '/' });
  });

  it('строка товара: сущность — товар, зависимости — товар, его коллекция и сайт, адрес по id — в aliases', async () => {
    const inputs = recordInputs(ALL, TEMPLATES);
    const { row, file } = await renderShopPage(inputs, '/product/sharf', theme, recordPage());
    expect(row).toMatchObject({
      path: '/product/sharf',
      file: 'product/sharf/index.html',
      entity: { type: 'product', id: P1 },
      deps: [`product:${P1}`, `collection:${C1}`, SITE_KEY],
      aliases: [`/product/${P1}`],
      dataUpdatedAt: LATER,
    });
    expect(file.path).toBe('product/sharf/index.html');
    const home = await renderShopPage(inputs, '/', theme, recordPage());
    expect(home.row).not.toHaveProperty('aliases');
    expect(home.row.deps).toEqual([SITE_KEY]);
  });

  it('статья и политика: сущности publication и policy, адреса по id нет', async () => {
    const inputs = recordInputs(ALL, TEMPLATES);
    const articleRow = (await renderShopPage(inputs, '/blogs/novosti/linen', theme, recordPage())).row;
    expect(articleRow).toMatchObject({
      entity: { type: 'publication', id: A1 },
      deps: [`publication:${A1}`, `blog:${B1}`, SITE_KEY],
    });
    expect(articleRow).not.toHaveProperty('aliases');
    const policyRow = (await renderShopPage(inputs, '/legal/privacy', theme, recordPage())).row;
    expect(policyRow).toMatchObject({ entity: { type: 'policy', id: 'privacy' }, deps: ['policy:privacy', SITE_KEY] });
  });

  it('aliases в строке страницы — адреса от корня; строка без aliases проходит как раньше', () => {
    const row = {
      path: '/product/sharf',
      file: 'product/sharf/index.html',
      hash: `sha256:${'a'.repeat(64)}`,
      entity: { type: 'product', id: P1 },
      deps: [`product:${P1}`],
      dataUpdatedAt: AT,
    };
    expect(checkPageRow({ ...row, aliases: [`/product/${P1}`] })).toMatchObject({ aliases: [`/product/${P1}`] });
    expect(checkPageRow(row)).not.toHaveProperty('aliases');
    expect(errorOf(() => checkPageRow({ ...row, aliases: ['product/sharf'] }))).toMatchObject({
      code: 'manifest-invalid',
    });
  });
});

describe('политика без секций шаблона — текст от платформы (В8-1 А)', () => {
  const PRIVACY = { type: 'privacy', title: 'Политика конфиденциальности', url: '/legal/privacy' };

  async function policyLocals(pages: Parameters<typeof recordInputs>[1]): Promise<ShopPageLocals | undefined> {
    const seen: ShopPageLocals[] = [];
    const capture: ShopTheme = {
      tokens: novaTokens,
      render: (path, locals) => {
        seen.push(locals);
        return fakeRender(path, locals);
      },
    };
    const inputs = recordInputs([policy('privacy', 'Мы бережём данные\n\nПишите нам')], pages);
    await renderShopPage(inputs, '/legal/privacy', capture, recordPage());
    return seen[0];
  }

  it('в <main> — заголовок и текст политики от платформы; шапка — секции магазина', async () => {
    const locals = await policyLocals({ header: [placed('header-1')], policy: [placed('policy-1', true)] });
    expect(locals?.header).toHaveLength(1);
    expect(locals?.sections).toEqual([
      policyTextHtml({ ...PRIVACY, html: '<p>Мы бережём данные</p><p>Пишите нам</p>' }),
    ]);
  });

  it('в шаблоне «Политика» видимая секция — страница из секций, текста платформы нет', async () => {
    const locals = await policyLocals({ policy: [placed('policy-1')] });
    expect(locals?.sections).toHaveLength(1);
    expect(locals?.sections.join('')).not.toContain('data-merfy-policy');
  });

  it('разметка: заголовок экранирован, стили — на переменных токенов', () => {
    const html = policyTextHtml({ ...PRIVACY, title: 'A & <B>', html: '<p>t</p>' });
    expect(html.startsWith('<div data-merfy-policy style="')).toBe(true);
    expect(html).toContain('>A &amp; &lt;B&gt;</h1>');
    expect(html).toContain('max-width:var(--width-page)');
    expect(html).toContain('<p>t</p></div></div>');
  });
});

describe('совпавшие адреса записей', () => {
  it('адрес по handle занят — запись по id и строка; заняты оба — страницы нет; неверный handle — не совпадение', () => {
    const moved = recordInputs([product(P1), product(P2), product(P3, { handle: 'a b' })], TEMPLATES);
    expect(routeDuplicates(moved)).toEqual([
      { type: 'product', id: P2, path: '/product/sharf', page: `/product/${P2}` },
    ]);
    const lost = recordInputs([product(P1), product(P2, { handle: P3 }), product(P3)], TEMPLATES);
    expect(routeDuplicates(lost)).toEqual([{ type: 'product', id: P3, path: '/product/sharf', page: null }]);
    expect(routeDuplicates(recordInputs(ALL, TEMPLATES))).toEqual([]);
  });
});
