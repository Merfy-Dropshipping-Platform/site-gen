import { extractPageBlocks } from '../page-blocks';
import { getPageResolver } from '../page-resolver-instance';

jest.mock('../theme-manifest-loader', () => ({
  getThemeManifest: jest.fn().mockReturnValue(null),
  googleFontHead: jest.fn().mockReturnValue(''),
}));
jest.mock('../page-resolver-instance', () => ({
  getPageResolver: jest.fn(),
}));

/**
 * Пункт 13, второй путь попадания шапки на страницу: страницы, которых НЕТ в
 * `pagesData` (у vanilla/satin/bloom это page-about / page-contacts /
 * page-delivery), досеиваются на лету из `packages/theme-<t>/pages/<id>.json`
 * через `PageResolver.resolvePage`. Миграция ревизии до них не дотягивается —
 * она работает только с тем, что уже лежит в `pagesData`. Значит унификация
 * обязана повториться и здесь, иначе превью конструктора показывает на «О нас»
 * шапку из файла темы (дефолтное название, дефолтное меню, чужая цветовая
 * схема), а на главной — шапку мерчанта. Замерено на QA-сайтах: vanilla давала
 * 5 разных шапок на 8 страницах, satin и bloom — по 4.
 *
 * Инвариант проверяем ровно так, как его формулирует тестировщик: прогоняем
 * обе страницы через ОДИН И ТОТ ЖЕ `extractPageBlocks` и сравниваем итоговые
 * props шапки (адаптеры props при этом отрабатывают одинаково с обеих сторон).
 */
describe('extractPageBlocks — шапка досеянной страницы = шапка главной', () => {
  const homeHeader = {
    type: 'Header',
    props: {
      id: 'Header-home',
      siteTitle: 'Мой магазин',
      logo: 'https://cdn/logo.svg',
      colorScheme: 'scheme-1',
      navigationLinks: [{ label: 'Каталог', href: '/catalog' }],
    },
  };

  const seededAbout = {
    content: [
      // Сид темы: чужая схема, дефолтное название, своё меню.
      {
        type: 'Header',
        props: {
          id: 'Header-about',
          siteTitle: 'Satin',
          colorScheme: 'scheme-2',
          navigationLinks: [{ label: 'Магазин', href: '/catalog' }],
        },
      },
      { type: 'Page', props: { id: 'Page-about' } },
    ],
  };

  function mockResolver() {
    (getPageResolver as jest.Mock).mockReturnValue({
      normalizeRevision: (d: unknown) => d,
      resolvePage: jest.fn().mockResolvedValue({ content: seededAbout }),
    });
  }

  async function headerOf(data: Record<string, unknown>, page: string) {
    const blocks = await extractPageBlocks(data, page, null, 'satin', 'site-1');
    const header = blocks!.find((b) => b.type === 'Header')!;
    const { id, ...rest } = header.props as Record<string, unknown>;
    return { id, rest };
  }

  beforeEach(mockResolver);

  it('шапка «О нас» совпадает с шапкой главной, свой id сохранён', async () => {
    const data = {
      pagesData: { home: { content: [homeHeader] } },
    } as Record<string, unknown>;

    const home = await headerOf(data, 'home');
    const about = await headerOf(data, 'page-about');

    expect(about.rest).toEqual(home.rest);
    expect(about.id).toBe('Header-about');
    expect(home.id).toBe('Header-home');
  });

  it('не трогает остальные блоки досеянной страницы', async () => {
    const data = {
      pagesData: { home: { content: [homeHeader] } },
    } as Record<string, unknown>;
    const blocks = await extractPageBlocks(data, 'page-about', null, 'satin', 'site-1');
    expect(blocks!.map((b) => b.type)).toEqual(['Header', 'Page']);
  });

  it('оставляет сид как есть, если шапка главной вырождена', async () => {
    const data = {
      pagesData: { home: { content: [{ type: 'Header', props: { id: 'Header-1' } }] } },
    } as Record<string, unknown>;
    const about = await headerOf(data, 'page-about');
    expect(about.rest.siteTitle).toBe('Satin');
  });
});
