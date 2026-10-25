import {
  PREVIEW_AGENT,
  PREVIEW_SECTIONS_AGENT,
  parseBuildInputs,
  sha256,
  type ShopTheme,
} from '@merfy/storefront-build';
import { WRAPPER_FIELDS, type CurrentSection, type SectionRenderRequest } from '@merfy/storefront-sections';
import { panelForTheme, parsePanel, parseTheme, platformDictionary } from '@merfy/tokens';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import standInputsJson from '../../storefront-build/fixtures/stand-inputs.json';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import novaThemeJson from '../../theme-nova/theme.json';
import { PREVIEW_POLICY_META } from '../src/preview-policy';
import { sectionPreview, shopPreview, shopSections, type ShopPreviewDeps } from '../src/shop-preview';
import type { ShopPageLocals } from '@merfy/storefront-build';

// Превью главной, одного блока и список секций (блок 1 «Секций и SDK») — на подставных зависимостях: без базы, брокера
// и процесса рендера.
const SHOP = '00000000-0000-4000-8000-000000000001';
const MODULE = 'export default 1; // первый экран';
const HASH = sha256(MODULE);
const HEADING = {
  id: 'heading',
  label: 'Заголовок',
  setting: { kind: 'string' as const, default: 'Тёплые шарфы из кашемира' },
};
const HERO: CurrentSection = {
  name: 'shop:hero',
  manifest: { sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [HEADING] },
  render: MODULE,
  renderHash: HASH,
};
const HEADER: CurrentSection = {
  name: 'shop:header',
  manifest: { sdk: 1, name: 'header', kind: 'section', title: 'Шапка', settings: [] },
  render: MODULE,
  renderHash: HASH,
};
const ANALYTICS: CurrentSection = {
  name: 'shop:analytics',
  manifest: { sdk: 1, name: 'analytics', kind: 'global', title: 'Аналитика магазина', settings: [] },
  render: null,
  renderHash: null,
};
const INPUTS = parseBuildInputs({
  ...standInputsJson,
  code: {
    sections: [{ name: 'shop:hero', kind: 'section', hash: sha256('правка'), render: HASH, script: null }],
    pages: { home: [{ id: 'hero-1', section: 'shop:hero', settings: { heading: 'Шарфы к первым холодам' } }] },
    globals: [],
  },
});
const og = (property: string, content: string): string =>
  content === '' ? '' : `<meta property="${property}" content="${content}">`;
const socialTags = (head: ShopPageLocals['head']): string =>
  og('og:type', head.social.type) +
  og('og:title', head.title) +
  og('og:url', head.canonical) +
  og('og:site_name', head.social.siteName) +
  og('og:locale', head.social.locale) +
  `<meta name="twitter:card" content="${head.social.card}">`;
const THEME: ShopTheme = {
  tokens: parseTheme(novaThemeJson.tokens),
  render: (_path, locals) => {
    const { head } = locals;
    // Пустое описание — тега нет: договор SEO (seo.ts), как у настоящей темы.
    const description = head.description === '' ? '' : `<meta name="description" content="${head.description}">`;
    const meta = `${description}<link rel="canonical" href="${head.canonical}">`;
    const tokens = `<style id="merfy-tokens">${head.tokensCss}</style>`;
    const headHtml = `${head.configHtml}<title>${head.title}</title>${meta}${socialTags(head)}${tokens}${head.codeHtml}`;
    const body = `${locals.sections.join('')}`;
    return Promise.resolve(`<html lang="${head.lang}"><head>${headHtml}</head><body>${body}</body></html>`);
  },
};

function depsOf(
  sections: ReadonlyMap<string, CurrentSection> | null = new Map([
    [HERO.name, HERO],
    [ANALYTICS.name, ANALYTICS],
  ]),
) {
  const rendered: [string, SectionRenderRequest][] = [];
  const deps: ShopPreviewDeps = {
    shop: () => Promise.resolve({ shopId: SHOP, dictionary: platformDictionary, inline: (html) => html }),
    stand: () => Promise.resolve({ status: 200, body: 'стенд' }),
    inputs: () => Promise.resolve({ inputs: INPUTS, renders: new Map([[HASH, MODULE]]) }),
    theme: () => Promise.resolve(THEME),
    sections: () => Promise.resolve(sections),
    render: (shopId, request) => {
      rendered.push([shopId, request]);
      const heading = request.settings.heading;
      return Promise.resolve(`<h2 class="flex">${typeof heading === 'string' ? heading : ''}</h2>`);
    },
    fonts: (css) => Promise.resolve(css),
  };
  return { deps, rendered };
}

const blockAnswerSchema = z.object({ html: z.string(), css: z.string() });
const url = (query: string) => new URL(`http://builder/preview?${query}`);
const block = (instance: unknown) => JSON.stringify({ instance });

describe('превью главной', () => {
  it('page=stand — стенд темы, как раньше; другая страница — 404', async () => {
    const { deps } = depsOf();
    expect((await shopPreview(deps, url(`shop=${SHOP}&page=stand`))).body).toBe('стенд');
    expect((await shopPreview(deps, url(`shop=${SHOP}&page=chuzhaya`))).status).toBe(404);
  });

  it('главная: секции из процесса рендера магазина, скрипт превью перед </body>, без списка модулей', async () => {
    const { deps, rendered } = depsOf();
    const answer = await shopPreview(deps, url(`shop=${SHOP}`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('data-section-id="hero-1"');
    expect(answer.body).toContain('Шарфы к первым холодам');
    expect(answer.body).toContain(`<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body>`);
    expect(answer.body).not.toContain('id="merfy-modules"');
    expect(rendered.map(([shopId]) => shopId)).toEqual([SHOP]);
  });

  it('главная: политика превью form-action none — первой в <head>, одна (блок 2, часть 2б)', async () => {
    const answer = await shopPreview(depsOf().deps, url(`shop=${SHOP}`));
    expect(answer.body).toContain(`<head>${PREVIEW_POLICY_META}`);
    expect(answer.body.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
  });

  it('главная: предзагрузки файлов шрифтов /_fonts/ нет — шрифты уже data:-адресами; другие предзагрузки на месте (блок 2, часть 2б)', async () => {
    const { deps } = depsOf();
    const preloads =
      '<link rel="preload" href="/_fonts/onest-cyrillic-wght.68e5e01d6265bd68.woff2" as="font" type="font/woff2" crossorigin>' +
      '<link as="font" crossorigin href="/_fonts/onest-latin-wght.0123456789abcdef.woff2" rel="preload" type="font/woff2">' +
      '<link rel="preload" href="/_merfy/hero.webp" as="image">';
    const fontsTheme: ShopTheme = {
      ...THEME,
      render: async (path, locals) => (await THEME.render(path, locals)).replace('<head>', `<head>${preloads}`),
    };
    const answer = await shopPreview({ ...deps, theme: () => Promise.resolve(fontsTheme) }, url(`shop=${SHOP}`));
    expect(answer.status).toBe(200);
    expect(answer.body).not.toContain('/_fonts/');
    expect(answer.body).toContain('<link rel="preload" href="/_merfy/hero.webp" as="image">');
  });
});

describe('превью одного блока', () => {
  it('{ instance } → { html, css }; значения — правки поверх умолчаний', async () => {
    const { deps, rendered } = depsOf();
    const answer = await sectionPreview(deps, SHOP, block({ id: 'hero-2', section: 'shop:hero', settings: {} }));
    expect(answer.status).toBe(200);
    const parsed = blockAnswerSchema.parse(JSON.parse(answer.body));
    const { html, css } = parsed;
    expect(html).toMatch(/^<merfy-section data-section="shop:hero" data-section-id="hero-2" class="py-section">/);
    expect(html).toContain('Тёплые шарфы из кашемира');
    expect(css).toContain('.flex');
    expect(rendered[0]?.[1].settings).toEqual({ heading: 'Тёплые шарфы из кашемира' });
  });

  it('тело не по форме — 400; секции у магазина нет — 404; расширения не ответили — 502', async () => {
    expect((await sectionPreview(depsOf().deps, SHOP, '{"instance":1}')).status).toBe(400);
    const unknown = block({ id: 'faq-1', section: 'shop:faq', settings: {} });
    expect((await sectionPreview(depsOf().deps, SHOP, unknown)).status).toBe(404);
    const hero = block({ id: 'hero-1', section: 'shop:hero', settings: {} });
    expect((await sectionPreview(depsOf(null).deps, SHOP, hero)).status).toBe(502);
  });
});

describe('список секций магазина', () => {
  it('только секции вида section: имя, название и поля', async () => {
    const answer = await shopSections(depsOf().deps, SHOP);
    expect(JSON.parse(answer.body)).toEqual({
      sections: [
        { name: 'shop:hero', title: 'Первый экран', settings: [HEADING], tokens: {}, wrapper: ['scheme', 'padding'] },
      ],
      wrapper: WRAPPER_FIELDS,
    });
  });
});

describe('блоки секции (часть 3)', () => {
  const FAQ: CurrentSection = {
    name: 'shop:faq',
    manifest: {
      sdk: 1,
      name: 'faq',
      kind: 'section',
      title: 'Вопросы и ответы',
      settings: [HEADING],
      blocks: {
        question: {
          title: 'Вопрос',
          limit: 20,
          settings: [{ id: 'answer', label: 'Ответ', setting: { kind: 'richtext', default: '<p>Ответ</p>' } }],
        },
      },
      defaultBlocks: [
        { type: 'question', settings: {} },
        { type: 'question', settings: { answer: '<p>Два дня</p>' } },
      ],
    },
    render: MODULE,
    renderHash: HASH,
  };

  it('превью одного блока: показанные блоки из запроса, richtext очищен; без ключа blocks — умолчания; режим — превью', async () => {
    const { deps, rendered } = depsOf(new Map([[FAQ.name, FAQ]]));
    const blocks = [
      { id: 'question-a', type: 'question', settings: { answer: '<p onclick="x()">Да</p>' } },
      { id: 'question-b', type: 'question', settings: {}, hidden: true },
    ];
    expect(
      (await sectionPreview(deps, SHOP, block({ id: 'faq-1', section: 'shop:faq', settings: {}, blocks }))).status,
    ).toBe(200);
    expect((await sectionPreview(deps, SHOP, block({ id: 'faq-1', section: 'shop:faq', settings: {} }))).status).toBe(
      200,
    );
    expect(rendered.map(([, request]) => [request.blocks, request.preview])).toEqual([
      [[{ id: 'question-a', type: 'question', settings: { answer: '<p>Да</p>' } }], true],
      [
        [
          { id: 'question-1', type: 'question', settings: { answer: '<p>Ответ</p>' } },
          { id: 'question-2', type: 'question', settings: { answer: '<p>Два дня</p>' } },
        ],
        true,
      ],
    ]);
  });

  it('список секций: у секции с blocks — blocks и defaultBlocks, у остальных ключей нет', async () => {
    const answer = await shopSections(
      depsOf(
        new Map([
          [HERO.name, HERO],
          [FAQ.name, FAQ],
        ]),
      ).deps,
      SHOP,
    );
    expect(JSON.parse(answer.body)).toEqual({
      sections: [
        { name: 'shop:hero', title: 'Первый экран', settings: [HEADING], tokens: {}, wrapper: ['scheme', 'padding'] },
        {
          name: 'shop:faq',
          title: 'Вопросы и ответы',
          settings: [HEADING],
          tokens: {},
          blocks: FAQ.manifest.blocks,
          defaultBlocks: FAQ.manifest.defaultBlocks,
          wrapper: ['scheme', 'padding'],
        },
      ],
      wrapper: WRAPPER_FIELDS,
    });
  });
});

describe('свои страницы, шапка и подвал в превью (часть 4)', () => {
  const MENU_FIELD = { id: 'menu', label: 'Изменить пункты меню', setting: { kind: 'menu' as const, default: 'main' } };
  const HEADER: CurrentSection = {
    name: 'shop:header',
    manifest: {
      sdk: 1,
      name: 'header',
      kind: 'section',
      title: 'Шапка',
      settings: [MENU_FIELD],
      groups: ['header'],
      limit: 1,
      removable: false,
      uses: ['theme', 'shop'],
    },
    render: MODULE,
    renderHash: HASH,
  };
  const PANEL = panelForTheme(parsePanel(panelJson, THEME.tokens.dictionary), undefined);
  const PAGE_INPUTS = parseBuildInputs({
    ...standInputsJson,
    revision: {
      tokens: {},
      pages: [
        { id: 'page-custom-1', slug: '/o-nas', name: 'О нас', seo: { title: '', description: '', keywords: '' } },
      ],
    },
    code: {
      sections: [{ name: 'shop:hero', kind: 'section', hash: sha256('правка'), render: HASH, script: null }],
      pages: { 'page-custom-1': [{ id: 'hero-2', section: 'shop:hero', settings: {} }] },
      globals: [],
    },
  });

  it('page=<id своей страницы> — её секции; неизвестный id — 404', async () => {
    const { deps } = depsOf();
    deps.inputs = () => Promise.resolve({ inputs: PAGE_INPUTS, renders: new Map([[HASH, MODULE]]) });
    const answer = await shopPreview(deps, url(`shop=${SHOP}&page=page-custom-1`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('data-section-id="hero-2"');
    expect((await shopPreview(deps, url(`shop=${SHOP}&page=page-custom-2`))).status).toBe(404);
  });

  it('блок шапки: меню из тела — деревом, настройки темы — правкой из тела поверх панели, данные магазина', async () => {
    const { deps, rendered } = depsOf(new Map([[HEADER.name, HEADER]]));
    deps.theme = () => Promise.resolve({ ...THEME, panel: PANEL });
    const body = JSON.stringify({
      instance: { id: 'header-1', section: 'shop:header', settings: {} },
      menus: [{ id: 'main', title: 'Главное меню', items: [{ label: 'О нас', url: '/o-nas' }] }],
      theme: { 'social-telegram': 'https://t.me/scarves' },
    });
    expect((await sectionPreview(deps, SHOP, body)).status).toBe(200);
    const request = rendered[0]?.[1];
    expect(request?.menus).toEqual({
      menu: { title: 'Главное меню', items: [{ label: 'О нас', url: '/o-nas', items: [] }] },
    });
    expect(request?.theme?.['social-telegram']).toBe('https://t.me/scarves');
    expect(request?.shop?.name).toBe('Стенд Nova');
  });

  it('без меню в теле — пустое дерево; секции без uses theme и shop не получают', async () => {
    const { deps, rendered } = depsOf(
      new Map([
        [HEADER.name, HEADER],
        [HERO.name, HERO],
      ]),
    );
    await sectionPreview(deps, SHOP, block({ id: 'header-1', section: 'shop:header', settings: {} }));
    await sectionPreview(deps, SHOP, block({ id: 'hero-1', section: 'shop:hero', settings: {} }));
    expect(rendered.map(([, request]) => [request.menus, request.theme, request.shop === undefined])).toEqual([
      [{ menu: { title: '', items: [] } }, {}, false],
      [undefined, undefined, true],
    ]);
  });

  it('меню в теле не по форме — 400', async () => {
    const { deps } = depsOf(new Map([[HEADER.name, HEADER]]));
    const body = JSON.stringify({
      instance: { id: 'header-1', section: 'shop:header', settings: {} },
      menus: [{ id: 'Main' }],
    });
    expect((await sectionPreview(deps, SHOP, body)).status).toBe(400);
  });

  it('список секций: groups, limit, removable, uses, newPage — у секций, где объявлены', async () => {
    const answer = await shopSections(
      depsOf(
        new Map([
          [HEADER.name, HEADER],
          [HERO.name, HERO],
        ]),
      ).deps,
      SHOP,
    );
    const list = z.object({ sections: z.array(z.unknown()) }).parse(JSON.parse(answer.body));
    expect(list.sections).toEqual([
      {
        name: 'shop:header',
        title: 'Шапка',
        settings: [MENU_FIELD],
        tokens: {},
        groups: ['header'],
        limit: 1,
        removable: false,
        uses: ['theme', 'shop'],
        wrapper: ['scheme', 'padding'],
      },
      { name: 'shop:hero', title: 'Первый экран', settings: [HEADING], tokens: {}, wrapper: ['scheme', 'padding'] },
    ]);
  });
});

describe('общие настройки секции в превью (часть 5 блока 1)', () => {
  const WRAPPED: CurrentSection = {
    ...HERO,
    manifest: { ...HERO.manifest, wrapper: ['scheme', 'padding', 'sticky'] },
  };

  it('блок: wrapper экземпляра — классы на обёртке в ответе', async () => {
    const { deps } = depsOf(new Map([[WRAPPED.name, WRAPPED]]));
    const body = block({
      id: 'hero-1',
      section: 'shop:hero',
      settings: {},
      wrapper: { scheme: 'scheme-2', padding: { top: 40, bottom: 80 } },
    });
    const answer = await sectionPreview(deps, SHOP, body);
    expect(answer.status).toBe(200);
    expect(blockAnswerSchema.parse(JSON.parse(answer.body)).html).toContain('class="color-scheme-2 pt-10 pb-20"');
  });

  it('блок без wrapper — class="py-section", как раньше', async () => {
    const { deps } = depsOf(new Map([[WRAPPED.name, WRAPPED]]));
    const answer = await sectionPreview(deps, SHOP, block({ id: 'hero-1', section: 'shop:hero', settings: {} }));
    expect(blockAnswerSchema.parse(JSON.parse(answer.body)).html).toContain('class="py-section"');
  });

  it('список секций: wrapper у каждой секции и объявления общих настроек в ответе', async () => {
    const { deps } = depsOf(new Map([[WRAPPED.name, WRAPPED]]));
    const parsed = z
      .object({
        sections: z.array(z.object({ wrapper: z.array(z.string()) }).passthrough()),
        wrapper: z.array(z.object({ id: z.string() }).passthrough()),
      })
      .parse(JSON.parse((await shopSections(deps, SHOP)).body));
    expect(parsed.sections[0]?.wrapper).toEqual(['scheme', 'padding', 'sticky']);
    expect(parsed.wrapper.map((field) => field.id)).toEqual(['scheme', 'padding', 'sticky']);
  });

  it('секция без ключа wrapper в section.json — список по умолчанию из двух', async () => {
    const parsed = z
      .object({ sections: z.array(z.object({ wrapper: z.array(z.string()) }).passthrough()) })
      .parse(JSON.parse((await shopSections(depsOf().deps, SHOP)).body));
    expect(parsed.sections[0]?.wrapper).toEqual(['scheme', 'padding']);
  });
});

describe('превью: страница 404 и страница блока (блок 7 «Секций и SDK», часть 7а)', () => {
  const NOT_FOUND_INPUTS = parseBuildInputs({
    ...standInputsJson,
    code: {
      sections: [{ name: 'shop:hero', kind: 'section', hash: sha256('правка'), render: HASH, script: null }],
      pages: { 'not-found': [{ id: 'hero-404', section: 'shop:hero', settings: { heading: 'Такой страницы нет' } }] },
      globals: [],
    },
  });

  it('page=not-found — страница 404 темой, её секции знают страницу', async () => {
    const { deps, rendered } = depsOf();
    deps.inputs = () => Promise.resolve({ inputs: NOT_FOUND_INPUTS, renders: new Map([[HASH, MODULE]]) });
    const answer = await shopPreview(deps, url(`shop=${SHOP}&page=not-found`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('data-section-id="hero-404"');
    expect(answer.body).toContain('<title>Страница не найдена · Стенд Nova</title>');
    expect(rendered.map(([, request]) => request.page)).toEqual([{ id: 'not-found', path: null }]);
  });

  it('page=not-found без секций — пустая страница темы, не простая 404 платформы', async () => {
    const answer = await shopPreview(depsOf().deps, url(`shop=${SHOP}&page=not-found`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('<title>Страница не найдена · Стенд Nova</title>');
    expect(answer.body).not.toContain('merfy-platform');
  });

  it('один блок: page — id страницы, адрес из ревизии; нет page или неизвестный id — главная', async () => {
    const { deps, rendered } = depsOf();
    const withPage = structuredClone(INPUTS);
    withPage.revision.pages = [
      { id: 'page-custom-1', slug: '/o-nas', name: 'О нас', seo: { title: '', description: '', keywords: '' } },
    ];
    deps.inputs = () => Promise.resolve({ inputs: withPage, renders: new Map([[HASH, MODULE]]) });
    const instance = { id: 'hero-1', section: 'shop:hero', settings: {} };
    for (const page of ['page-custom-1', 'not-found', undefined, 'page-unknown'])
      expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance, page }))).status).toBe(200);
    expect(rendered.map(([, request]) => request.page)).toEqual([
      { id: 'page-custom-1', path: '/o-nas' },
      { id: 'not-found', path: null },
      { id: 'home', path: '/' },
      { id: 'home', path: '/' },
    ]);
  });
});

describe('превью шаблонов записей (блок 8 «Секций и SDK», часть 8б-2)', () => {
  const AT = '2026-10-20T10:00:00.000Z';
  const [P1, P2] = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'];
  const productOf = (id: string, title: string, handle: string) => ({
    type: 'product',
    id,
    updatedAt: AT,
    data: {
      title,
      handle,
      description: 'Тёплый и мягкий',
      price: 190000,
      compareAtPrice: null,
      images: ['https://s3.merfy.ru/p/1.jpg'],
      available: true,
      options: [],
      variants: [],
      collectionIds: [],
      seo: { title: '', description: '' },
    },
  });
  const RECORD_INPUTS = parseBuildInputs({
    ...standInputsJson,
    code: {
      sections: [{ name: 'shop:hero', kind: 'section', hash: sha256('правка'), render: HASH, script: null }],
      pages: { product: [{ id: 'hero-p', section: 'shop:hero', settings: { heading: 'Карточка товара' } }] },
      globals: [],
    },
    data: { status: 'received', entities: [productOf(P1, 'Шарф', 'sharf'), productOf(P2, 'Плед', 'pled')] },
  });
  const recordDeps = () => {
    const made = depsOf();
    made.deps.inputs = () => Promise.resolve({ inputs: RECORD_INPUTS, renders: new Map([[HASH, MODULE]]) });
    return made;
  };

  it('page=product&record=<id> — шаблон «Товар» с этим товаром: запись у секций, адрес — основной', async () => {
    const { deps, rendered } = recordDeps();
    const answer = await shopPreview(deps, url(`shop=${SHOP}&page=product&record=${P2}`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('data-section-id="hero-p"');
    expect(answer.body).toContain('<link rel="canonical" href="https://nova-stand.example/product/pled">');
    expect(rendered[0]?.[1].page).toMatchObject({ id: 'product', path: '/product/pled', record: { id: P2 } });
  });

  it('без record, пустой или неизвестный — первый товар; record — адрес ссылки; товаров нет — пример', async () => {
    const { deps, rendered } = recordDeps();
    for (const query of ['', '&record=', '&record=missing', '&record=/product/pled'])
      expect((await shopPreview(deps, url(`shop=${SHOP}&page=product${query}`))).status).toBe(200);
    expect(rendered.map(([, request]) => request.page?.path)).toEqual([
      '/product/sharf',
      '/product/sharf',
      '/product/sharf',
      '/product/pled',
    ]);
    const example = await shopPreview(depsOf().deps, url(`shop=${SHOP}&page=product`));
    expect(example.status).toBe(200);
    expect(example.body).toContain('<title>Пример товара</title>');
  });

  it('page=policy без секций и без политик — текст примера от платформы', async () => {
    const answer = await shopPreview(depsOf().deps, url(`shop=${SHOP}&page=policy`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('data-merfy-policy');
    expect(answer.body).toContain('<title>Политика конфиденциальности</title>');
  });

  it('один блок на шаблоне: page и record из тела — запись страницы; record не строкой — 400', async () => {
    const { deps, rendered } = recordDeps();
    const instance = { id: 'hero-p', section: 'shop:hero', settings: {} };
    for (const record of [P2, undefined])
      expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance, page: 'product', record }))).status).toBe(
        200,
      );
    expect(rendered.map(([, request]) => request.page?.path)).toEqual(['/product/pled', '/product/sharf']);
    const wrong = JSON.stringify({ instance, page: 'product', record: 7 });
    expect((await sectionPreview(deps, SHOP, wrong)).status).toBe(400);
  });
});

describe('поля с записями в превью одного блока (блок 8 «Секций и SDK», часть 8г)', () => {
  const PLED = '00000000-0000-4000-8000-000000000102';
  const CARD: CurrentSection = {
    name: 'shop:product-card',
    manifest: {
      sdk: 1,
      name: 'product-card',
      kind: 'section',
      title: 'Карточка товара',
      settings: [HEADING, { id: 'product', label: 'Выбор товара', setting: { kind: 'product', default: null } }],
    },
    render: MODULE,
    renderHash: HASH,
  };
  const PLED_INPUTS = parseBuildInputs({
    ...standInputsJson,
    data: {
      status: 'received',
      entities: [
        {
          type: 'product',
          id: PLED,
          updatedAt: '2026-10-20T10:00:00.000Z',
          data: {
            title: 'Плед',
            handle: 'pled',
            description: 'Тёплый и мягкий',
            price: 350000,
            compareAtPrice: null,
            images: ['https://s3.merfy.ru/p/2.jpg'],
            available: true,
            options: [],
            variants: [],
            collectionIds: [],
            seo: { title: '', description: '' },
          },
        },
      ],
    },
  });

  it('с page в теле — запись поля в запросе рендера; без page и uses — записей нет, поле null', async () => {
    const { deps, rendered } = depsOf(new Map([[CARD.name, CARD]]));
    deps.inputs = () => Promise.resolve({ inputs: PLED_INPUTS, renders: new Map([[HASH, MODULE]]) });
    const instance = { id: 'card-1', section: 'shop:product-card', settings: { product: PLED } };
    expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance, page: 'home' }))).status).toBe(200);
    expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance }))).status).toBe(200);
    // Типизированный хелпер: expect.objectContaining возвращает any, значения ожидания — те же.
    const recordLike = (fields: Record<string, unknown>): unknown => expect.objectContaining(fields);
    const expected: unknown[] = [
      { product: recordLike({ id: PLED, title: 'Плед', url: '/product/pled' }) },
      { product: null },
    ];
    expect(rendered.map(([, request]) => request.records)).toEqual(expected);
  });
});

describe('каталог и список страницы в превью (блок 11 «Секций и SDK», часть 11а-2)', () => {
  const AT = '2026-10-20T10:00:00.000Z';
  const productOf = (n: number) => ({
    type: 'product',
    id: `00000000-0000-4000-8000-00000000010${n}`,
    updatedAt: AT,
    data: {
      title: `Шарф ${n}`,
      handle: `sharf-${n}`,
      description: '',
      price: 190000,
      compareAtPrice: null,
      images: [],
      available: true,
      options: [],
      variants: [],
      collectionIds: [],
      seo: { title: '', description: '' },
    },
  });
  const PER_PAGE = {
    id: 'per-page',
    label: 'Товаров на странице',
    setting: { kind: 'range' as const, default: 24, min: 2, max: 24, step: 1 },
  };
  const GRID: CurrentSection = {
    name: 'shop:grid',
    manifest: { sdk: 1, name: 'grid', kind: 'section', title: 'Каталог', settings: [HEADING, PER_PAGE] },
    render: MODULE,
    renderHash: HASH,
  };
  const LIST_INPUTS = parseBuildInputs({
    ...standInputsJson,
    code: {
      sections: [{ name: 'shop:grid', kind: 'section', hash: sha256('правка'), render: HASH, script: null }],
      pages: {},
      globals: [],
    },
    data: { status: 'received', entities: [1, 2, 3].map(productOf) },
  });
  const listDeps = () => {
    const made = depsOf(new Map([[GRID.name, GRID]]));
    made.deps.inputs = () => Promise.resolve({ inputs: LIST_INPUTS, renders: new Map([[HASH, MODULE]]) });
    return made;
  };
  const instance = { id: 'grid-1', section: 'shop:grid', settings: { 'per-page': 2 } };

  it('page=catalog — страница каталога и с пустым списком', async () => {
    const answer = await shopPreview(listDeps().deps, url(`shop=${SHOP}&page=catalog`));
    expect(answer.status).toBe(200);
    expect(answer.body).toContain('<link rel="canonical" href="https://nova-stand.example/catalog">');
  });

  it('блок на каталоге — page.list по настройке блока; list из тела — номер страницы', async () => {
    const { deps, rendered } = listDeps();
    for (const list of [undefined, 'page=2'])
      expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance, page: 'catalog', list }))).status).toBe(200);
    expect(rendered.map(([, request]) => request.page?.list)).toMatchObject([
      { page: 1, pages: 2, perPage: 2, url: '/catalog' },
      { page: 2, pages: 2, items: [{ title: 'Шарф 3' }] },
    ]);
  });

  it('выбранное в теле и клиент product — карточки по ответу сервиса', async () => {
    const { deps, rendered } = listDeps();
    const calls: unknown[][] = [];
    const reply = (pattern: unknown) =>
      pattern === 'product.findAll'
        ? { success: true, data: [{ id: productOf(3).id }], total: 1 }
        : { success: true, data: { groups: [], priceRange: { min: 0, max: 0 } } };
    deps.products = {
      call: (...args) => {
        calls.push(args);
        return Promise.resolve(reply(args[1]));
      },
      timeoutMs: 1_000,
      log: () => undefined,
    };
    const body = JSON.stringify({ instance, page: 'catalog', list: 'sort=price_asc' });
    expect((await sectionPreview(deps, SHOP, body)).status).toBe(200);
    expect(calls.map((call) => call[1])).toEqual(['product.findAll', 'product.getFilters']);
    expect(rendered[0]?.[1].page?.list).toMatchObject({ total: 1, items: [{ id: productOf(3).id }] });
  });

  it('секция без per-page на главной — без page.list; list не строкой или длиннее 2048 — 400', async () => {
    const { deps, rendered } = depsOf(
      new Map([
        [HERO.name, HERO],
        [GRID.name, GRID],
      ]),
    );
    deps.inputs = () => Promise.resolve({ inputs: LIST_INPUTS, renders: new Map([[HASH, MODULE]]) });
    const hero = { id: 'hero-1', section: 'shop:hero', settings: {} };
    expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance: hero, page: 'home' }))).status).toBe(200);
    expect(rendered[0]?.[1].page?.list).toBeUndefined();
    for (const list of [7, 'q='.padEnd(2049, 'а')])
      expect((await sectionPreview(deps, SHOP, JSON.stringify({ instance, page: 'catalog', list }))).status).toBe(400);
  });
});

describe('themeSettings секции в списке /sections (блок 10 «Секций и SDK», часть 10б)', () => {
  it('объявлен в section.json — в ответе как есть; нет — ключа нет', async () => {
    const withKey: CurrentSection = { ...HEADER, manifest: { ...HEADER.manifest, themeSettings: ['wishlist-enabled'] } };
    const answer = await shopSections(
      depsOf(
        new Map([
          [withKey.name, withKey],
          [HERO.name, HERO],
        ]),
      ).deps,
      SHOP,
    );
    const parsed = z
      .object({ sections: z.array(z.object({ name: z.string() }).passthrough()) })
      .parse(JSON.parse(answer.body));
    expect(parsed.sections.map((item) => item.themeSettings)).toEqual([['wishlist-enabled'], undefined]);
  });
});

// Превью особых страниц блока 10 (часть 10а, Р10а-16, Р10а-19): страницы корзины, избранного, входа и кабинета — из
// секций, есть всегда; оформление и «Спасибо за заказ» — страницы сборки с локалами блоков (в превью — все четыре).
describe('превью особых страниц блока 10', () => {
  const SPECIAL_INPUTS = parseBuildInputs({
    ...standInputsJson,
    code: {
      sections: [{ name: 'shop:hero', kind: 'section', hash: sha256('правка'), render: HASH, script: null }],
      pages: {
        home: [{ id: 'hero-1', section: 'shop:hero', settings: { heading: 'Шарфы к первым холодам' } }],
        'page-cart': [{ id: 'hero-cart', section: 'shop:hero', settings: { heading: 'Корзина' } }],
      },
      globals: [],
    },
    revision: {
      ...standInputsJson.revision,
      checkout: {
        blocks: [
          { type: 'CheckoutHeader', props: { siteTitle: 'Магазин стены' } },
          { type: 'CheckoutLayout', props: { summaryPosition: 'left' } },
        ],
      },
    },
  });
  // Тема печатает локалы оформления в конец тела: у страниц из секций ключа checkout нет.
  const CHECKOUT_THEME: ShopTheme = {
    ...THEME,
    render: (path, locals) =>
      THEME.render(path, locals).then((html) =>
        html.replace('</body>', `<merfy-checkout>${JSON.stringify(locals.checkout ?? null)}</merfy-checkout></body>`),
      ),
  };
  const specialDeps = () => {
    const { deps, rendered } = depsOf();
    deps.inputs = () => Promise.resolve({ inputs: SPECIAL_INPUTS, renders: new Map([[HASH, MODULE]]) });
    deps.theme = () => Promise.resolve(CHECKOUT_THEME);
    return { deps, rendered };
  };

  it('страницы из секций — все в превью, даже без экземпляров; секция — со своей страницей', async () => {
    const paths: Record<string, string> = {
      'page-cart': '/cart',
      'page-wishlist': '/wishlist',
      'page-profile': '/account/profile',
      'page-orders': '/account/orders',
      'page-login': '/login',
    };
    for (const [id, path] of Object.entries(paths)) {
      const answer = await shopPreview(specialDeps().deps, url(`shop=${SHOP}&page=${id}`));
      expect(answer.status, id).toBe(200);
      expect(answer.body, id).toContain(`<link rel="canonical" href="https://nova-stand.example${path}">`);
    }
    const { deps, rendered } = specialDeps();
    const cart = await shopPreview(deps, url(`shop=${SHOP}&page=page-cart`));
    expect(cart.body).toContain('data-section-id="hero-cart"');
    expect(rendered.map(([, request]) => request.page)).toEqual([{ id: 'page-cart', path: '/cart' }]);
  });

  it('page=page-checkout — locals блоков оформления (в превью — все); page=page-checkout-result — результат', async () => {
    const checkout = await shopPreview(specialDeps().deps, url(`shop=${SHOP}&page=page-checkout`));
    expect(checkout.status).toBe(200);
    expect(checkout.body).toContain('<link rel="canonical" href="https://nova-stand.example/checkout">');
    expect(checkout.body).toContain('"siteTitle":"Магазин стены"');
    expect(checkout.body).toContain('"summaryPosition":"left"');
    const result = await shopPreview(specialDeps().deps, url(`shop=${SHOP}&page=page-checkout-result`));
    expect(result.status).toBe(200);
    expect(result.body).toContain('"result":true');
  });

  it('другой id — по-прежнему 404 с подсказкой об особых страницах', async () => {
    const answer = await shopPreview(specialDeps().deps, url(`shop=${SHOP}&page=page-unknown`));
    expect(answer.status).toBe(404);
    expect(answer.body).toContain('page-cart');
  });
});
