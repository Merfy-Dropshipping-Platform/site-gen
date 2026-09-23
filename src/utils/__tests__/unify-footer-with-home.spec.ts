import { migrateRevisionData, unifyFooterWithHome } from '../revision-migrations';

// Пункт 3б сближения «витрина = конструктор»: подвал на всех страницах —
// подвал главной (как шапка в `unifyHeaderWithHome`). Замер 23.09: превью «О
// нас», «Доставки», «Контактов» рисовало подвал темы, а витрина и панель
// конструктора — подвал главной.

type Block = { type: string; props: Record<string, unknown> };
type Pages = Record<string, { content: Block[] } | number>;

const HOME_FOOTER = {
  id: 'footer-home',
  colorScheme: '1',
  siteTitle: 'Мой магазин',
  newsletter: { enabled: true, heading: 'Подпишитесь' },
};

const pages = (): Pages => ({
  home: {
    content: [
      { type: 'Header', props: { id: 'Header-1', siteTitle: 'Мой магазин' } },
      { type: 'Footer', props: { ...HOME_FOOTER } },
    ],
  },
  // досеяна из пакета темы: подвал темы по умолчанию
  'page-about': {
    content: [
      { type: 'MainText', props: { id: 'MainText-about' } },
      { type: 'Footer', props: { id: 'Footer-about', colorScheme: 'scheme-3' } },
    ],
  },
  // сохранённая старая копия подвала главной
  'page-cart': {
    content: [{ type: 'Footer', props: { id: 'Footer-1', colorScheme: '2', siteTitle: 'Старое' } }],
  },
  // страница без подвала
  'page-login': { content: [{ type: 'Login', props: { id: 'Login-1' } }] },
  // служебный ключ, не страница
  _vanillaHomeMigrationVersion: 3,
});

const footerOf = (data: Record<string, unknown>, page: string) =>
  ((data[page] as { content: Block[] }).content.find((b) => b.type === 'Footer') ?? null)?.props;

const withoutId = (props: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'id'));

describe('unifyFooterWithHome', () => {
  it('подвал страницы получает настройки главной и сохраняет свой id', () => {
    const out = unifyFooterWithHome(pages());
    expect(footerOf(out, 'page-about')).toEqual({ ...HOME_FOOTER, id: 'Footer-about' });
    expect(footerOf(out, 'page-cart')).toEqual({ ...HOME_FOOTER, id: 'Footer-1' });
  });

  it('остальные блоки и страницы без подвала не меняются', () => {
    const input = pages();
    const out = unifyFooterWithHome(input);
    expect((out['page-about'] as { content: Block[] }).content[0]).toEqual({ type: 'MainText', props: { id: 'MainText-about' } });
    expect(out['page-login']).toBe(input['page-login']);
    expect(out.home).toBe(input.home);
    expect(out._vanillaHomeMigrationVersion).toBe(3);
  });

  it('повторный прогон ничего не меняет (идемпотентна)', () => {
    const once = unifyFooterWithHome(pages());
    expect(unifyFooterWithHome(once)).toBe(once);
  });

  it('вырожденный подвал главной (только id) не раскатывается', () => {
    const input = pages();
    (input.home as { content: Block[] }).content[1] = { type: 'Footer', props: { id: 'footer-home' } };
    expect(unifyFooterWithHome(input)).toBe(input);
  });

  it('без главной — ничего не делает', () => {
    const rest = Object.fromEntries(Object.entries(pages()).filter(([page]) => page !== 'home'));
    expect(unifyFooterWithHome(rest)).toEqual(rest);
  });
});

describe('migrateRevisionData({ unifyFooter })', () => {
  const revision = () => ({ pagesData: pages() });

  it('включено → подвалы страниц = подвал главной на чтении', () => {
    const data = migrateRevisionData(revision(), 'bloom', null, { unifyFooter: true });
    const pd = data.pagesData as Record<string, unknown>;
    expect(withoutId(footerOf(pd, 'page-about')!)).toEqual(withoutId(footerOf(pd, 'home')!));
    expect(footerOf(pd, 'page-about')!.id).toBe('Footer-about');
  });

  it('по умолчанию (выключатель выкл.) → подвалы страниц как были', () => {
    const data = migrateRevisionData(revision(), 'bloom', null);
    const pd = data.pagesData as Record<string, unknown>;
    expect(footerOf(pd, 'page-about')).toEqual({ id: 'Footer-about', colorScheme: 'scheme-3' });
  });
});
