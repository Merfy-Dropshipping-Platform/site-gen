/**
 * B17 — тело контент-страниц («О нас», «Доставка», «Контакты») досеивает
 * СЕРВЕР из пакета темы.
 *
 * Эти гарантии раньше держал конструктор (`seedContentPages` в pupaMigrate),
 * но его сид был пустым блоком «Страница» и вмерзал в ревизию при первом же
 * сохранении. Теперь источник один — `packages/theme-<t>/pages/<id>.json`,
 * и проверять его надо здесь.
 */
import { seedContentPagesFromTheme, CONTENT_PAGE_IDS } from '../content-page-seed';

const homeHeader = {
  type: 'Header',
  props: { id: 'Header-home', siteTitle: 'ROSE', logo: '/logo.svg', menu: ['Каталог'] },
};

function revision(pagesData: Record<string, unknown> = {}) {
  return {
    manifestVersion: '2.0',
    currentPageId: 'home',
    pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }],
    pagesData: {
      home: {
        content: [homeHeader, { type: 'Hero', props: { id: 'Hero-1' } }, { type: 'Footer', props: { id: 'Footer-home' } }],
        root: { props: {} },
        zones: {},
      },
      ...pagesData,
    },
  } as Record<string, unknown>;
}

const themes = ['rose', 'vanilla', 'bloom', 'satin', 'flux'];

describe('досев контент-страниц из пакета темы', () => {
  it.each(themes)('%s: все три страницы получают тело из пакета темы', async (theme) => {
    const out: any = await seedContentPagesFromTheme(revision(), theme);
    for (const id of CONTENT_PAGE_IDS) {
      expect(Array.isArray(out.pagesData[id]?.content)).toBe(true);
      expect(out.pagesData[id].content.length).toBeGreaterThan(0);
    }
  });

  it('текст «Доставки» приходит непустым (иначе секция «Страница» пустая)', async () => {
    const out: any = await seedContentPagesFromTheme(revision(), 'rose');
    const page = out.pagesData['page-delivery'].content.find((b: any) => b.type === 'Page');
    expect(page).toBeDefined();
    expect(String(page.props.content ?? '').length).toBeGreaterThan(100);
  });

  it('шапка досеянной страницы = шапка главной, но со СВОИМ id', async () => {
    const out: any = await seedContentPagesFromTheme(revision(), 'rose');
    const seeded = out.pagesData['page-about'].content.find((b: any) => b.type === 'Header');
    expect(seeded).toBeDefined();
    // Puck ломается на дубликатах id — id главной тащить нельзя.
    expect(seeded.props.id).not.toBe(homeHeader.props.id);
    const { id: _a, ...rest } = seeded.props;
    const { id: _b, ...homeRest } = homeHeader.props;
    expect(rest).toEqual(homeRest);
  });

  it('страницу, которая уже есть в ревизии, не трогает', async () => {
    const mine = {
      content: [{ type: 'Page', props: { id: 'P', heading: 'Моя доставка', content: '<p>Мой текст</p>' } }],
      root: { props: {} },
      zones: {},
    };
    const out: any = await seedContentPagesFromTheme(revision({ 'page-delivery': mine }), 'rose');
    expect(out.pagesData['page-delivery']).toEqual(mine);
  });

  it('идемпотентность: повторный прогон даёт тот же результат', async () => {
    const once: any = await seedContentPagesFromTheme(revision(), 'rose');
    const twice: any = await seedContentPagesFromTheme(once, 'rose');
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('без темы ревизия возвращается как есть', async () => {
    const input = revision();
    const out = await seedContentPagesFromTheme(input, null);
    expect(out).toBe(input);
  });
});
