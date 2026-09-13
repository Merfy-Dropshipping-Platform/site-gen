import { migrateRevisionData } from '../revision-migrations';

/**
 * Пункт 13 тестировщика: «На всех страницах блок Шапка отличается — как набором
 * секций и параметров, так и внешним видом. Ожидаемый: на всех страницах блок
 * Шапка совпадает и остаётся таким же, как например на главной».
 *
 * Канон: шапка главной — единственный источник правды. Любая другая страница
 * получает ТЕ ЖЕ props (кроме собственного `id` — Puck ломается на дубликатах).
 * `CheckoutHeader` — ДРУГОЙ компонент (чекаут по Figma 1:13563), не трогаем.
 */

const homeHeader = (extra: Record<string, unknown> = {}) => ({
  type: 'Header',
  props: {
    id: 'Header-home',
    siteTitle: 'Мой магазин',
    logo: 'https://cdn/logo.svg',
    logoPosition: 'center-left',
    colorScheme: 'scheme-1',
    menuColorScheme: 'scheme-1',
    menuType: 'dropdown',
    stickiness: 'scroll-up',
    padding: { top: 24, bottom: 24 },
    navigationLinks: [{ label: 'Каталог', href: '/catalog' }],
    actionButtons: { showSearch: true, showCart: true, showProfile: true },
    ...extra,
  },
});

const headerProps = (page: any) =>
  page.content.find((b: any) => b.type === 'Header')?.props;

describe('унификация шапки: главная — эталон', () => {
  it('переносит props шапки главной на все остальные страницы', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader(), { type: 'Hero', props: { id: 'Hero-1' } }] },
        'page-about': {
          content: [
            // Вырожденная шапка из сида (rose/vanilla pages/about.json).
            { type: 'Header', props: { id: 'Header-about' } },
            { type: 'Page', props: { id: 'Page-about' } },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };

    const { id: _homeId, ...homeRest } = headerProps(out.pagesData.home);
    const about = headerProps(out.pagesData['page-about']);
    const { id: aboutId, ...aboutRest } = about;
    expect(aboutRest).toEqual(homeRest);
    // Собственный id страницы сохранён — иначе Puck падает на дубликатах.
    expect(aboutId).toBe('Header-about');
  });

  it('удаляет параметры, которых нет на главной (состав не расширяется)', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader()] },
        'page-catalog': {
          content: [
            {
              type: 'Header',
              props: {
                id: 'Header-catalog',
                siteTitle: 'Мой магазин',
                // Параметра `activeLinkIndicator` на главной НЕТ → выкидываем.
                activeLinkIndicator: 'underline',
              },
            },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(headerProps(out.pagesData['page-catalog'])).not.toHaveProperty(
      'activeLinkIndicator',
    );
  });

  it('не трогает CheckoutHeader — это другой компонент', () => {
    const checkout = {
      type: 'CheckoutHeader',
      props: { id: 'CheckoutHeader-1', logoMode: 'text', siteTitle: 'Мой магазин' },
    };
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader()] },
        'page-checkout': { content: [checkout, { type: 'CheckoutForm', props: {} }] },
      },
    }) as { pagesData: Record<string, any> };
    const block = out.pagesData['page-checkout'].content[0];
    expect(block.type).toBe('CheckoutHeader');
    expect(block.props).toEqual(checkout.props);
  });

  it('идемпотентна — повторный прогон ничего не меняет', () => {
    const input = {
      pagesData: {
        home: { content: [homeHeader()] },
        'page-about': {
          content: [
            { type: 'Header', props: { id: 'Header-about' } },
            { type: 'Page', props: { id: 'Page-about' } },
          ],
        },
      },
    };
    const once = migrateRevisionData(input);
    const twice = migrateRevisionData(JSON.parse(JSON.stringify(once)));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('НЕ раскатывает вырожденную шапку главной (защита от потери брендинга)', () => {
    // Прод-случай (demo rose 71f9b323…): на главной осталась `Header{id}` —
    // артефакт дрейфа syncSharedSections. Раскатать её = стереть логотип и
    // название магазина на всех остальных страницах.
    const rich = {
      type: 'Header',
      props: { id: 'Header-catalog', siteTitle: 'ROSE', logo: 'https://cdn/logo.svg' },
    };
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [{ type: 'Header', props: { id: 'Header-1' } }] },
        'page-catalog': { content: [rich] },
      },
    }) as { pagesData: Record<string, any> };
    expect(headerProps(out.pagesData['page-catalog'])).toEqual(rich.props);
  });

  it('no-op, если на главной шапки нет вовсе', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [{ type: 'Hero', props: { id: 'Hero-1' } }] },
        'page-about': {
          content: [{ type: 'Header', props: { id: 'Header-about', siteTitle: 'X' } }],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(headerProps(out.pagesData['page-about'])).toEqual({
      id: 'Header-about',
      siteTitle: 'X',
    });
  });

  it('переживает служебные не-страничные ключи pagesData', () => {
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader()] },
        _vanillaHomeMigrationVersion: 11,
        'page-about': {
          content: [{ type: 'Header', props: { id: 'Header-about' } }],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(out.pagesData._vanillaHomeMigrationVersion).toBe(11);
    expect(headerProps(out.pagesData['page-about']).siteTitle).toBe('Мой магазин');
  });
});
