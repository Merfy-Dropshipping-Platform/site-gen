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
    expect((await shopPreview(deps, url(`shop=${SHOP}&page=catalog`))).status).toBe(404);
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
