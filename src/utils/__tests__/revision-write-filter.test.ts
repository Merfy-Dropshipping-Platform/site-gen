/**
 * B17 — «обычное сохранение замораживает страницы, которых мерчант не касался».
 *
 * Сервер отдаёт ревизию ДОСЕЯННОЙ (migrateRevisionData на чтении), конструктор
 * шлёт полученное обратно целиком, createRevision пишет дословно — и страница,
 * которой в ревизии не было, оказывается в ней навсегда. С этого момента
 * `extractPageBlocks` (page-blocks.ts) больше не берёт её из пакета темы, и
 * правки theme.json до неё не доходят.
 *
 * Сторож: сервер сам решает, что из присланного — правка мерчанта, а что —
 * его же собственный сид, и сид в ревизию не пишет.
 */
import { filterSeededPagesOnWrite } from '../revision-write-filter';
import { migrateRevisionData } from '../revision-migrations';

const homeHeader = {
  type: 'Header',
  props: { id: 'Header-home', logo: '/logo.svg', siteTitle: 'ROSE', menu: ['Каталог'] },
};
const homeFooter = { type: 'Footer', props: { id: 'Footer-home', text: 'подвал мерчанта' } };

/** Сохранённая ревизия: только домашняя страница, аккаунтных страниц НЕТ. */
function storedRevision(): Record<string, unknown> {
  return {
    manifestVersion: '2.0',
    currentPageId: 'home',
    pages: [
      { id: 'home', name: 'Главная', slug: '/', role: 'system' },
      { id: 'page-about', name: 'О нас', slug: '/about', role: 'system' },
      { id: 'page-delivery', name: 'Доставка', slug: '/delivery', role: 'system' },
    ],
    pagesData: {
      home: {
        content: [homeHeader, { type: 'Hero', props: { id: 'Hero-1', heading: 'Привет' } }, homeFooter],
        root: { props: {} },
        zones: {},
      },
    },
  };
}

/** Ровно то, что уходит клиенту из getRevision. */
function served(stored: Record<string, unknown>) {
  return migrateRevisionData(stored, 'rose');
}

describe('B17: сервер не пишет в ревизию собственный сид', () => {
  it('сохранение без единой правки не добавляет ни одной страницы', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));

    const before = Object.keys((stored.pagesData ?? {}) as object);
    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');
    const after = Object.keys((res.data.pagesData ?? {}) as Record<string, unknown>);

    expect(after.sort()).toEqual(before.sort());
    expect(res.dropped.length).toBeGreaterThanOrEqual(4);
    expect(res.dropped).toEqual(
      expect.arrayContaining(['page-login', 'page-orders', 'page-profile', 'page-wishlist']),
    );
  });

  it('правка мерчанта на досеянной странице сохраняется', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));
    const login = incoming.pagesData['page-login'];
    const section = login.content.find((b: any) => b.type === 'LoginSection');
    section.props.heading = 'Вход в мой магазин';

    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    expect(res.dropped).not.toContain('page-login');
    const saved: any = (res.data.pagesData as any)['page-login'];
    expect(saved.content.find((b: any) => b.type === 'LoginSection').props.heading).toBe(
      'Вход в мой магазин',
    );
  });

  it('страницы мерчанта не теряются и не откатываются к сиду', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));
    incoming.pagesData.home.content[1].props.heading = 'Новый заголовок';

    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');
    const home: any = (res.data.pagesData as any).home;

    expect(res.dropped).not.toContain('home');
    expect(home.content[1].props.heading).toBe('Новый заголовок');
  });

  it('перезапись шапки не превращает досеянную страницу в правку мерчанта', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));
    // конструктор раскатывает шапку главной по всем страницам (syncSharedSections)
    for (const pid of Object.keys(incoming.pagesData)) {
      const page = incoming.pagesData[pid];
      if (!Array.isArray(page?.content)) continue;
      for (const b of page.content) {
        if (b.type === 'Header') {
          b.props.logo = '';
          b.props.siteTitle = 'Мой сайт';
        }
      }
    }
    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');
    expect(res.dropped).toEqual(
      expect.arrayContaining(['page-login', 'page-orders', 'page-profile', 'page-wishlist']),
    );
  });

  it('пустая контент-страница из клиентского сида в ревизию не попадает', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));
    // ровно то, что кладёт конструкторский seedContentPages (pupaMigrate.ts:413)
    incoming.pagesData['page-delivery'] = {
      content: [
        { ...homeHeader, props: { ...homeHeader.props, id: 'Header-page-delivery-1' } },
        {
          type: 'Page',
          props: { id: 'Page-page-delivery-1', pageId: '', heading: '', content: '',
                   headingSize: 'medium', colorScheme: 'scheme-1', padding: { top: 80, bottom: 80 } },
        },
        { ...homeFooter, props: { ...homeFooter.props, id: 'Footer-page-delivery-1' } },
      ],
      root: { props: { meta: { title: 'Доставка' } } },
      zones: {},
    };

    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    expect(res.dropped).toContain('page-delivery');
    expect((res.data.pagesData as any)['page-delivery']).toBeUndefined();
  });

  it('уже замороженная ревизия размораживается первой же записью', async () => {
    const stored = storedRevision();
    // магазин, у которого прошлое сохранение уже вморозило аккаунтные страницы
    const frozen = served(stored) as any;
    const storedFrozen = {
      ...stored,
      pagesData: JSON.parse(JSON.stringify(frozen.pagesData)),
    };
    const incoming = JSON.parse(JSON.stringify(served(storedFrozen)));

    const res = await filterSeededPagesOnWrite(incoming, storedFrozen, 'rose');

    expect(res.unfrozen).toEqual(
      expect.arrayContaining(['page-login', 'page-orders', 'page-profile', 'page-wishlist']),
    );
    for (const pid of ['page-login', 'page-orders', 'page-profile', 'page-wishlist']) {
      expect((res.data.pagesData as any)[pid]).toBeUndefined();
    }
  });

  it('страница, созданная мерчантом, не выбрасывается', async () => {
    const stored = storedRevision();
    const custom = {
      content: [
        homeHeader,
        { type: 'Page', props: { id: 'Page-custom', heading: 'Гарантия', content: '<p>Год</p>' } },
        homeFooter,
      ],
      root: { props: {} },
      zones: {},
    };
    (stored.pagesData as any)['page-custom-1'] = custom;
    const incoming = JSON.parse(JSON.stringify(served(stored)));

    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    expect(res.dropped).not.toContain('page-custom-1');
    expect(res.unfrozen).not.toContain('page-custom-1');
    expect((res.data.pagesData as any)['page-custom-1']).toBeDefined();
  });

  it('правка внутри досеянной страницы каталога сохраняется', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));
    const catalog = incoming.pagesData['page-catalog'];
    const body = catalog.content.find((b: any) => !['Header', 'PromoBanner', 'Footer'].includes(b.type));
    body.props.__merchantTouch = 'да';

    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    expect(res.dropped).not.toContain('page-catalog');
    expect((res.data.pagesData as any)['page-catalog']).toBeDefined();
  });

  it('идемпотентность: повторный прогон ничего больше не убирает', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(served(stored)));
    const once = await filterSeededPagesOnWrite(incoming, stored, 'rose');
    const twice = await filterSeededPagesOnWrite(
      JSON.parse(JSON.stringify(once.data)),
      stored,
      'rose',
    );
    expect(twice.dropped).toEqual([]);
    expect(JSON.stringify(twice.data)).toBe(JSON.stringify(once.data));
  });
});

/**
 * Проверка того, ради чего всё затевалось: после обычного сохранения правки
 * пакета темы продолжают доходить до страницы, которую мерчант не трогал.
 */
describe('B17: связь страницы с пакетом темы переживает сохранение', () => {
  const { seedContentPagesFromTheme } = require('../../themes/content-page-seed');
  const { extractPageBlocks } = require('../../themes/page-blocks');

  async function servedWithContentPages(stored: Record<string, unknown>) {
    return seedContentPagesFromTheme(migrateRevisionData(stored, 'rose'), 'rose');
  }

  it('контент-страницы из пакета темы в ревизию не пишутся', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(await servedWithContentPages(stored)));
    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    expect(res.dropped).toEqual(
      expect.arrayContaining(['page-about', 'page-delivery', 'page-contacts']),
    );
  });

  it('после сохранения текст «Доставки» по-прежнему берётся из пакета темы', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(await servedWithContentPages(stored)));
    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    const blocks = await extractPageBlocks(
      res.data as Record<string, unknown>,
      'page-delivery',
      null,
      'rose',
      'site-1',
    );
    const pageBlock = (blocks ?? []).find((b: any) => b.type === 'Page');
    expect(pageBlock).toBeDefined();
    const text = String((pageBlock as any).props.content ?? '');
    // в packages/theme-rose/pages/delivery.json — 214 символов разметки
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('доставляем');
  });

  it('если бы страница вмёрзла, текст темы до неё не дошёл бы', async () => {
    const stored = storedRevision();
    const incoming = JSON.parse(JSON.stringify(await servedWithContentPages(stored)));
    // имитируем поведение ДО починки: сохраняем всё, что прислал клиент
    const frozen = { ...incoming, pagesData: { ...incoming.pagesData } };
    (frozen.pagesData as any)['page-delivery'] = {
      content: [{ type: 'Page', props: { id: 'Page-1', heading: 'Доставка', content: '' } }],
      root: { props: {} },
      zones: {},
    };
    const blocks = await extractPageBlocks(frozen, 'page-delivery', null, 'rose', 'site-1');
    const pageBlock = (blocks ?? []).find((b: any) => b.type === 'Page');
    expect(String((pageBlock as any).props.content ?? '')).toBe('');
  });
});

/**
 * Критерий владельца: «обычное сохранение — и в ревизии меняется РОВНО одна
 * страница». Проверяем полный круг: сервер читает ревизию (досев + канон
 * шапки), мерчант правит одну секцию на главной, конструктор раскатывает
 * шапку по всем страницам и шлёт карту целиком, сервер записывает.
 */
describe('B17: обычное сохранение меняет ровно одну страницу', () => {
  const { seedContentPagesFromTheme } = require('../../themes/content-page-seed');
  const { unifyHeaderWithHome } = require('../revision-migrations');

  it('после правки главной в ревизии меняется только home', async () => {
    const stored = storedRevision();
    let servedNow: any = migrateRevisionData(JSON.parse(JSON.stringify(stored)), 'rose');
    servedNow = await seedContentPagesFromTheme(servedNow, 'rose');

    const incoming: any = JSON.parse(JSON.stringify(servedNow));
    const hero = incoming.pagesData.home.content.find(
      (b: any) => !['Header', 'PromoBanner', 'Footer'].includes(b.type),
    );
    hero.props.heading = 'Правка мерчанта';
    // конструктор раскатывает шапку главной по всем страницам
    incoming.pagesData = unifyHeaderWithHome(incoming.pagesData);

    const res = await filterSeededPagesOnWrite(incoming, stored, 'rose');

    const storedPages = stored.pagesData as Record<string, unknown>;
    const nextPages = res.data.pagesData as Record<string, unknown>;
    const changed = Object.keys(nextPages).filter(
      (k) => JSON.stringify(storedPages[k]) !== JSON.stringify(nextPages[k]),
    );
    expect(changed).toEqual(['home']);
    expect(Object.keys(nextPages).sort()).toEqual(Object.keys(storedPages).sort());
  });

  it('конструктор при этом по-прежнему видит все страницы темы', async () => {
    const stored = storedRevision();
    let servedNow: any = migrateRevisionData(JSON.parse(JSON.stringify(stored)), 'rose');
    servedNow = await seedContentPagesFromTheme(servedNow, 'rose');
    // 11 досеянных сервером + 3 контент-страницы + сама главная
    expect(Object.keys(servedNow.pagesData).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(servedNow.pagesData)).toEqual(
      expect.arrayContaining(['page-login', 'page-orders', 'page-profile', 'page-wishlist',
                              'page-about', 'page-delivery', 'page-contacts']),
    );
  });
});
