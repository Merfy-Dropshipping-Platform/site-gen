import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateRevisionData } from '../revision-migrations';
import { CART_UNIFIED_THEMES } from '../../themes/page-registry';
import { resolveCartDrawerGlobals } from '../../themes/cart-drawer-contract';

/**
 * Баг-репорт 12: «На странице Корзина отсутствует секция "Промежуточный итог"».
 *
 * Замер «до» (прод, пять QA-сайтов по теме): `page-cart` = [Header, CartSection,
 * Footer] у всех пяти. В дереве конструктора одна строка «Корзина», строки
 * «Промежуточный итог» нет, хотя блок `theme-base/blocks/CartSummary` жив, стоит
 * в сидах всех пяти тем и адресуется конструктором по имени.
 *
 * Причина: `migrateCartPage` схлопывала CartBody/CartSummary/CartTotals/
 * CartCheckoutButton в один CartSection на КАЖДОМ чтении ревизии — что бы ни
 * положил сид. Здесь закреплён восстановленный контракт: корзина = ДВЕ секции.
 *
 * ⚠️ Предыдущая редакция этого файла закрепляла ровно обратное («CartSection is
 * canonical»), и при этом второй describe требовал сплит-сидов. Оба блока были
 * зелёными, а система — сломанной: миграция стирала то, что сеяли сиды.
 */
const types = (page: { content?: Array<{ type?: string }> }) =>
  (page.content ?? []).map((b) => b.type);

describe('migrateCartPage — корзина = «Корзина» + «Промежуточный итог»', () => {
  it('сеет [Header, CartBody, CartSummary, Footer], когда page-cart нет', () => {
    const result = migrateRevisionData({ pagesData: {} }) as {
      pagesData: Record<string, any>;
    };
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'Footer',
    ]);
  });

  it('берёт Header/Footer с главной, если они там есть', () => {
    const homeHeader = { type: 'Header', props: { id: 'Header-home', siteTitle: 'My Shop' } };
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const result = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader, { type: 'Hero', props: {} }, homeFooter] },
      },
    }) as { pagesData: Record<string, any> };
    const content = result.pagesData['page-cart'].content;
    expect(content[0]).toBe(homeHeader);
    expect(content[content.length - 1]).toBe(homeFooter);
  });

  it('монолит CartSection → разворачивается в пару, схема мерчанта переносится', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            {
              type: 'CartSection',
              props: { id: 'mono', colorScheme: 'scheme-4', padding: { top: 40, bottom: 120 } },
            },
            { type: 'Footer', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    const content = result.pagesData['page-cart'].content;
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'Footer',
    ]);
    const body = content[1].props;
    const summary = content[2].props;
    expect(body.colorScheme).toBe('scheme-4');
    expect(summary.colorScheme).toBe('scheme-4');
    // Верх монолита остаётся у тела, низ уходит на сводку — высота страницы не прыгает.
    expect(body.padding.top).toBe(40);
    expect(summary.padding.bottom).toBe(120);
  });

  it('легаси-081: CartTotals/CartCheckoutButton убираются (это под-узлы сводки)', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartBody', props: { id: 'cb', colorScheme: 'scheme-2' } },
            { type: 'CartSummary', props: { id: 'cs' } },
            { type: 'CartTotals', props: { id: 'ct' } },
            { type: 'CartCheckoutButton', props: { id: 'ccb' } },
            { type: 'Footer', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'Footer',
    ]);
    // id мерчантских блоков переживают разворот (превью адресует секции по ним).
    expect(result.pagesData['page-cart'].content[1].props.id).toBe('cb');
    expect(result.pagesData['page-cart'].content[2].props.id).toBe('cs');
  });

  it('кросс-селл мерчанта рядом с корзиной не сносится', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartSection', props: { id: 'mono' } },
            { type: 'PopularProducts', props: { heading: 'Возможно вам понравится' } },
            { type: 'Footer', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'PopularProducts',
      'Footer',
    ]);
  });

  it('секция мерчантаперед корзиной остаётся перед ней', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Collections', props: {} },
            { type: 'CartSection', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'Collections',
      'CartBody',
      'CartSummary',
      'Footer',
    ]);
  });

  it('идемпотентна: второй прогон ничего не меняет', () => {
    const first = migrateRevisionData({ pagesData: {} });
    const second = migrateRevisionData(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('готовая пара + chrome = no-op (ссылочное равенство pagesData)', () => {
    const data = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartBody', props: { id: 'cb' } },
            { type: 'CartSummary', props: { id: 'cs' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(data) as { pagesData: Record<string, any> };
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'Footer',
    ]);
  });

  it('page-cart без блоков корзины → пара встаёт перед Footer', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(types(result.pagesData['page-cart'])).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'Footer',
    ]);
  });

  it('дописывает Footer, если его не было', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [{ type: 'Header', props: {} }],
          root: { props: {} },
          zones: {},
        },
      },
    }) as { pagesData: Record<string, any> };
    const t = types(result.pagesData['page-cart']);
    expect(t).toEqual(['Header', 'CartBody', 'CartSummary', 'Footer']);
  });

  it('нет pagesData — нечего мигрировать', () => {
    const result = migrateRevisionData({}) as { pagesData?: Record<string, any> };
    expect(result.pagesData).toBeUndefined();
  });

  it('прочие страницы не трогаются', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-catalog': { content: [{ type: 'Catalog', props: {} }], root: { props: {} }, zones: {} },
      },
    }) as { pagesData: Record<string, any> };
    expect(result.pagesData['page-catalog']).toBeDefined();
    expect(result.pagesData['page-cart']).toBeDefined();
  });
});

/**
 * Сплит держится не только ради дерева конструктора: дровер корзины берёт свою
 * цветовую схему из `page-cart` → CartBody, иначе CartSummary
 * (`resolveCartDrawerGlobals`). Пока страница схлопывалась в CartSection, этот
 * ридер НИЧЕГО не находил, и дровер молча оставался на дефолте темы.
 */
describe('дровер корзины получает схему после миграции', () => {
  it('схема монолита доезжает до дровера через развёрнутый CartBody', () => {
    const migrated = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [{ type: 'CartSection', props: { colorScheme: 'scheme-3' } }],
        },
      },
    });
    expect(resolveCartDrawerGlobals(migrated).__MERFY_CART_DRAWER_SCHEME__).toBe('scheme-3');
  });
});

/**
 * Гейт `CART_UNIFIED_THEMES` + сиды тем: /cart рендерится Puck-блоками, а сид
 * уже собран из сплит-пары. «Итоговая цена»/«Кнопка оформления» — под-узлы
 * CartSummary, отдельными блоками страницы их быть не должно.
 */
describe('унификация корзины: гейт и сиды тем', () => {
  it('CART_UNIFIED_THEMES содержит все пять тем', () => {
    expect([...CART_UNIFIED_THEMES].sort()).toEqual(
      ['bloom', 'flux', 'rose', 'satin', 'vanilla'].sort(),
    );
  });

  it.each([...CART_UNIFIED_THEMES])('сид cart.json темы %s = сплит-пара', (theme) => {
    const file = join(__dirname, '..', '..', '..', 'packages', `theme-${theme}`, 'pages', 'cart.json');
    const page = JSON.parse(readFileSync(file, 'utf-8')) as {
      content?: Array<{ type?: string }>;
    };
    const t = types(page);
    expect(t).toEqual(expect.arrayContaining(['CartBody', 'CartSummary']));
    expect(t).not.toContain('CartSection');
    expect(t).not.toContain('CartTotals');
    expect(t).not.toContain('CartCheckoutButton');
    // Сид обязан пережить миграцию без изменений — иначе мерчант увидит не то,
    // что задумала тема (ровно эта расстыковка и была багом 12).
    const migrated = migrateRevisionData({ pagesData: { 'page-cart': page } }) as {
      pagesData: Record<string, any>;
    };
    expect(types(migrated.pagesData['page-cart'])).toEqual(t);
  });
});
