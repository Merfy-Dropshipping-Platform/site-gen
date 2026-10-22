import { panelForTheme, parsePanel } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import { buildStorefront } from '../src/build';
import { sha256 } from '../src/canonical';
import { NO_ASSETS } from '../src/code';
import type { BuildInputs } from '../src/inputs';
import type { ShopPageLocals } from '../src/locals';
import { renderShopPage, type ShopTheme } from '../src/page';
import { shopRoutes } from '../src/routes';
import type { PageRender, SectionRenderRequest } from '../src/sections-render';
import { changedInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Шапка, страница и подвал; свои страницы (блок 1 «Секций и SDK», часть 4, Р1-4-7, Р1-4-8).
const MODULE = 'export default "секция";';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const PANEL = panelForTheme(parsePanel(panelJson, novaTokens.dictionary), undefined);
const PAGE = {
  id: 'page-custom-1',
  slug: '/o-nas',
  name: 'О нас',
  seo: { title: '', description: 'Про нас', keywords: '' },
};
const section = (name: string, extra: object = {}) => ({
  name,
  kind: 'section' as const,
  hash: sha256(name),
  render: HASH,
  script: null,
  ...extra,
});
const instance = (id: string, name: string) => ({ id, section: name, settings: {} });

function shopInputs(): BuildInputs {
  return changedInputs((inputs) => {
    inputs.revision = { tokens: {}, settings: { 'social-telegram': 'https://t.me/scarves' }, pages: [PAGE] };
    inputs.code = {
      sections: [
        section('shop:header', { removable: false, uses: ['theme'] }),
        section('shop:footer', { uses: ['shop'] }),
        section('shop:hero'),
        section('shop:page'),
      ],
      pages: {
        header: [instance('header-1', 'shop:header')],
        home: [instance('hero-1', 'shop:hero')],
        [PAGE.id]: [instance('page-1', 'shop:page')],
        footer: [instance('footer-1', 'shop:footer')],
      },
      globals: [],
    };
  });
}

function themeOf(seen: ShopPageLocals[]): ShopTheme {
  return {
    tokens: novaTokens,
    panel: PANEL,
    render: (path, locals) => {
      seen.push(locals);
      return fakeRender(path, locals);
    },
  };
}

function pageOf(requests: SectionRenderRequest[], failing = ''): PageRender {
  const render = (request: SectionRenderRequest): Promise<string> => {
    requests.push(request);
    if (request.section === failing) return Promise.reject(Object.assign(new Error('сломалась'), { stage: 'render' }));
    return Promise.resolve(`<p>${request.section}</p>`);
  };
  return { sections: { modules: new Map([[HASH, MODULE]]), render }, mode: 'live' };
}

describe('страница: шапка, свой список, подвал', () => {
  it('главная: шапка и подвал — отдельно от секций страницы; рендер — по порядку списков, код секций — всех трёх', async () => {
    const seen: ShopPageLocals[] = [];
    const requests: SectionRenderRequest[] = [];
    await renderShopPage(shopInputs(), '/', themeOf(seen), pageOf(requests));
    expect(requests.map((request) => request.section)).toEqual(['shop:header', 'shop:hero', 'shop:footer']);
    const [locals] = seen;
    expect([locals?.header.length, locals?.sections.length, locals?.footer.length]).toEqual([1, 1, 1]);
    expect(locals?.header[0]).toContain('data-section="shop:header"');
    expect(locals?.footer[0]).toContain('data-section="shop:footer"');
    expect(locals?.head.codeHtml).toContain('id="merfy-sections"');
  });

  it('theme — настройки панели с правкой мерчанта, shop — данные магазина; только по uses', async () => {
    const requests: SectionRenderRequest[] = [];
    await renderShopPage(shopInputs(), '/', themeOf([]), pageOf(requests));
    const [header, hero, footer] = requests;
    expect(header?.theme?.['social-telegram']).toBe('https://t.me/scarves');
    expect(header?.shop).toBeUndefined();
    expect(footer?.shop?.name).toBe('Стенд Nova');
    expect(footer?.theme).toBeUndefined();
    expect([hero?.theme, hero?.shop]).toEqual([undefined, undefined]);
  });

  it('своя страница: адрес и файл из ревизии, SEO страницы; её секции — между шапкой и подвалом', async () => {
    const seen: ShopPageLocals[] = [];
    const requests: SectionRenderRequest[] = [];
    const page = await renderShopPage(shopInputs(), '/o-nas', themeOf(seen), pageOf(requests));
    expect(page.row).toMatchObject({ path: '/o-nas', file: 'o-nas/index.html' });
    expect(requests.map((request) => request.section)).toEqual(['shop:header', 'shop:page', 'shop:footer']);
    expect(seen[0]?.head).toMatchObject({
      title: 'О нас',
      description: 'Про нас',
      canonical: 'https://nova-stand.example/o-nas',
    });
  });

  it('маршруты: главная и свои страницы; адреса нет — page-unknown', async () => {
    expect(shopRoutes(shopInputs()).map((route) => [route.id, route.path, route.file])).toEqual([
      ['home', '/', 'index.html'],
      ['page-custom-1', '/o-nas', 'o-nas/index.html'],
    ]);
    await expect(renderShopPage(shopInputs(), '/dostavka', themeOf([]))).rejects.toMatchObject({
      code: 'page-unknown',
    });
  });

  it('скрытая шапка не рендерится; упала шапка с removable: false — render-failed; упал подвал — его нет', async () => {
    const hidden = shopInputs();
    hidden.code.pages.header = [{ ...instance('header-1', 'shop:header'), hidden: true }];
    const requests: SectionRenderRequest[] = [];
    await renderShopPage(hidden, '/', themeOf([]), pageOf(requests));
    expect(requests.map((request) => request.section)).toEqual(['shop:hero', 'shop:footer']);
    await expect(renderShopPage(shopInputs(), '/', themeOf([]), pageOf([], 'shop:header'))).rejects.toMatchObject({
      code: 'render-failed',
    });
    const seen: ShopPageLocals[] = [];
    await renderShopPage(shopInputs(), '/', themeOf(seen), pageOf([], 'shop:footer'));
    expect(seen[0]?.footer.join('')).toBe('');
  });

  it('разделение списков: списки разной длины расходятся по своим группам', async () => {
    const inputs = shopInputs();
    inputs.code.pages.home = [instance('hero-1', 'shop:hero'), instance('page-1', 'shop:page')];
    const seen: ShopPageLocals[] = [];
    await renderShopPage(inputs, '/', themeOf(seen), pageOf([]));
    expect(seen[0]?.header.map((html) => html)).toHaveLength(1);
    expect(seen[0]?.sections).toHaveLength(2);
    expect(seen[0]?.footer).toHaveLength(1);
    expect(seen[0]?.header[0]).toContain('shop:header');
    expect(seen[0]?.footer[0]).toContain('shop:footer');
  });

  it('сборка: файлы и строки манифеста главной и своей страницы', async () => {
    const theme = { ...themeOf([]), clientFiles: [] };
    const assets = { ...NO_ASSETS, renders: new Map([[HASH, MODULE]]) };
    const render = (request: SectionRenderRequest) => Promise.resolve(`<p>${request.section}</p>`);
    const build = await buildStorefront(shopInputs(), { platformCommit: 'c'.repeat(40) }, theme, assets, render);
    expect(build.manifest.pages.map((page) => [page.path, page.file])).toEqual([
      ['/', 'index.html'],
      ['/o-nas', 'o-nas/index.html'],
    ]);
  });
});
