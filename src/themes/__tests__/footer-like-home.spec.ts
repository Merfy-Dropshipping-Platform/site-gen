import { extractPageBlocks } from '../page-blocks';
import { seedContentPagesFromTheme } from '../content-page-seed';

// Пункт 3б: «О нас», «Доставка», «Контакты» досеиваются из пакета темы вместе с
// подвалом темы по умолчанию. Превью конструктора рисовало этот подвал, а панель
// и витрина — подвал главной. Под выключателем PARITY_FOOTER подвал досеянной
// страницы берётся с главной на обоих путях: lazy-seed превью/витрины
// (extractPageBlocks) и сид для конструктора (seedContentPagesFromTheme).

type Block = { type: string; props: Record<string, unknown> };

const SITE = 'site-3b';
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;
const CONTENT_PAGES = ['page-about', 'page-delivery', 'page-contacts'] as const;

const HOME_FOOTER = {
  id: 'footer-home',
  colorScheme: '1',
  siteTitle: 'Мой магазин',
  newsletter: { enabled: true, heading: 'Подпишитесь', description: 'Новости' },
};

// Контент-страниц в ревизии нет: они досеиваются из пакета темы.
const revision = () => ({
  pagesData: {
    home: {
      content: [
        { type: 'Header', props: { id: 'Header-1', siteTitle: 'Мой магазин' } },
        { type: 'Footer', props: { ...HOME_FOOTER } },
      ],
    },
  },
});

const withoutId = (props: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'id'));
const footerIn = (blocks: Block[] | null | undefined) =>
  blocks?.find((b) => b.type === 'Footer')?.props;

async function renderedFooter(theme: string, page: string) {
  return footerIn(await extractPageBlocks(revision(), page, null, theme, SITE));
}

describe.each(THEMES)('подвал досеянных страниц = подвал главной, тема %s', (theme) => {
  const savedEnv = process.env.PARITY_FOOTER;
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.PARITY_FOOTER;
    else process.env.PARITY_FOOTER = savedEnv;
  });

  it.each(CONTENT_PAGES)('%s: превью/витрина берут подвал главной при включённом выключателе', async (page) => {
    process.env.PARITY_FOOTER = SITE;
    const pageFooter = await renderedFooter(theme, page);
    const homeFooter = await renderedFooter(theme, 'home');
    expect(pageFooter).toBeDefined();
    expect(withoutId(pageFooter!)).toEqual(withoutId(homeFooter!));
  });

  it('выключатель выключен → подвал из пакета темы, как раньше', async () => {
    process.env.PARITY_FOOTER = 'off';
    const pageFooter = await renderedFooter(theme, 'page-about');
    const homeFooter = await renderedFooter(theme, 'home');
    expect(withoutId(pageFooter!)).not.toEqual(withoutId(homeFooter!));
  });

  it('сид для конструктора: подвал главной с собственным id страницы', async () => {
    const seeded = await seedContentPagesFromTheme(revision(), theme, { unifyFooter: true });
    const pd = seeded.pagesData as Record<string, { content: Block[] }>;
    for (const page of CONTENT_PAGES) {
      const footer = footerIn(pd[page]?.content);
      expect(footer && withoutId(footer)).toEqual(withoutId(HOME_FOOTER));
      expect(footer?.id).not.toBe(HOME_FOOTER.id);
    }
  });

  it('сид для конструктора без опции → подвал темы, как раньше', async () => {
    const seeded = await seedContentPagesFromTheme(revision(), theme);
    const pd = seeded.pagesData as Record<string, { content: Block[] }>;
    const footer = footerIn(pd['page-about']?.content);
    expect(footer && withoutId(footer)).not.toEqual(withoutId(HOME_FOOTER));
  });
});
