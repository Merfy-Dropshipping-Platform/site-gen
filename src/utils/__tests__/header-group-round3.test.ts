/**
 * Третий круг тестировщика, п.2: «На всех страницах блок Шапка отличается, как
 * набором СЕКЦИЙ и параметров, так и внешним видом. Ожидаемый: на всех
 * страницах совпадает и остаётся таким же, как на главной».
 *
 * Прошлый круг чинил только ПАРАМЕТРЫ блока `Header` — и замер это подтверждает:
 * на проде (QA-сайты пяти тем, 2026-09-13) props шапки на девяти страницах уже
 * идентичны главной. А тестировщик пишет про «набор секций» — и он прав:
 * в левой колонке конструктора группа «Шапка» на главной содержит
 * «Промо-баннер» + «Шапка», а на каталоге/товаре/коллекции/профиле — только
 * «Шапка». Замер сидов: у rose промо-баннер лежит на 5 страницах из 11,
 * у flux и bloom — только на главной.
 *
 * Канон: группа «Шапка» (промо-баннер + шапка) на любой странице — ровно та же,
 * что на главной. Страницы чекаута со своим `CheckoutHeader` не трогаются.
 */
import { migrateRevisionData } from '../revision-migrations';

const promo = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'PromoBanner',
  props: { id, text: 'Скидка 10%', link: { text: 'Перейти', href: '/catalog' }, ...extra },
});

const header = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'Header',
  props: {
    id,
    siteTitle: 'Мой магазин',
    logo: 'https://cdn/logo.svg',
    colorScheme: 'scheme-1',
    menuType: 'dropdown',
    padding: { top: 24, bottom: 24 },
    ...extra,
  },
});

const types = (page: any) => (page?.content ?? []).map((b: any) => b.type);
/** Начало страницы без служебного «хвоста» (`ensureChrome` дописывает Footer). */
const head = (page: any, n: number) => types(page).slice(0, n);
const blockOf = (page: any, type: string) =>
  (page?.content ?? []).find((b: any) => b.type === type);

describe('п.2 группа «Шапка» = группа главной', () => {
  it('промо-баннер главной появляется на странице, где его не было', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [promo('PromoBanner-1'), header('Header-home'), { type: 'Hero', props: { id: 'Hero-1' } }] },
        'page-catalog': { content: [header('Header-catalog'), { type: 'Catalog', props: { id: 'Catalog-1' } }] },
      },
    }) as any;
    expect(head(out.pagesData['page-catalog'], 3)).toEqual(['PromoBanner', 'Header', 'Catalog']);
    const copied = blockOf(out.pagesData['page-catalog'], 'PromoBanner');
    expect(copied.props.text).toBe('Скидка 10%');
    // собственный id страницы — Puck ломается на дубликатах
    expect(copied.props.id).not.toBe('PromoBanner-1');
    expect(typeof copied.props.id).toBe('string');
  });

  it('свой промо-баннер страницы получает параметры главной, id сохраняется', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [promo('PromoBanner-1', { text: 'НОВЫЙ ТЕКСТ' }), header('Header-home')] },
        'page-about': { content: [promo('PromoBanner-about', { text: 'старьё' }), header('Header-about'), { type: 'Page', props: { id: 'Page-1' } }] },
      },
    }) as any;
    const b = blockOf(out.pagesData['page-about'], 'PromoBanner');
    expect(b.props.text).toBe('НОВЫЙ ТЕКСТ');
    expect(b.props.id).toBe('PromoBanner-about');
  });

  it('если на главной промо-баннера нет — его нет и на других страницах', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [header('Header-home'), { type: 'Hero', props: { id: 'Hero-1' } }] },
        'page-catalog': { content: [promo('PromoBanner-catalog'), header('Header-catalog'), { type: 'Catalog', props: { id: 'C' } }] },
      },
    }) as any;
    expect(head(out.pagesData['page-catalog'], 2)).toEqual(['Header', 'Catalog']);
    expect(types(out.pagesData['page-catalog'])).not.toContain('PromoBanner');
  });

  it('порядок группы — как на главной (промо над шапкой)', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [promo('PromoBanner-1'), header('Header-home')] },
        'page-product': { content: [header('Header-product'), promo('PromoBanner-product'), { type: 'Product', props: { id: 'P' } }] },
      },
    }) as any;
    expect(head(out.pagesData['page-product'], 3)).toEqual(['PromoBanner', 'Header', 'Product']);
  });

  it('чекаут со своей шапкой не трогается', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [promo('PromoBanner-1'), header('Header-home')] },
        'page-checkout': {
          content: [
            { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-1' } },
            { type: 'CheckoutForm', props: { id: 'CheckoutForm-1' } },
          ],
        },
      },
    }) as any;
    expect(types(out.pagesData['page-checkout'])).not.toContain('PromoBanner');
    expect(types(out.pagesData['page-checkout'])).not.toContain('Header');
    expect(head(out.pagesData['page-checkout'], 2)).toEqual(['CheckoutHeader', 'CheckoutForm']);
  });

  it('идемпотентна: второй прогон ничего не меняет', () => {
    const input = {
      pagesData: {
        home: { content: [promo('PromoBanner-1'), header('Header-home')] },
        'page-catalog': { content: [header('Header-catalog'), { type: 'Catalog', props: { id: 'C' } }] },
      },
    };
    const once = migrateRevisionData(input) as any;
    const twice = migrateRevisionData(once) as any;
    expect(JSON.stringify(twice.pagesData)).toBe(JSON.stringify(once.pagesData));
  });

  it('служебные ключи pagesData переживают проход', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [promo('PromoBanner-1'), header('Header-home')] },
        _vanillaHomeMigrationVersion: 3 as unknown as { content: unknown[] },
      },
    }) as any;
    expect(out.pagesData._vanillaHomeMigrationVersion).toBe(3);
  });
});
