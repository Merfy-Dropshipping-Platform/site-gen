import { panelForTheme, parsePanel } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import { sha256 } from '../src/canonical';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import type { ShopPageLocals } from '../src/locals';
import { renderShopPage, type ShopTheme } from '../src/page';
import { pageListsOf } from '../src/routes';
import type { PageRender, SectionRenderRequest } from '../src/sections-render';
import { changedInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Группа overlay «Поверх страницы» и секции с ролью в сборке (блок 12 «Секций и SDK», 12.2, 12.4, «Решил сам» пп. 6, 7,
// 14; часть 12а): экземпляры overlay — один раз на каждой странице после подвала, data-role на обёртке, ошибка рендера
// секции с ролью — ошибка сборки.
const MODULE = 'export default "секция";';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const PANEL = panelForTheme(parsePanel(panelJson, novaTokens.dictionary), undefined);
const PAGE = { id: 'page-custom-1', slug: '/o-nas', name: 'О нас', seo: { title: '', description: '', keywords: '' } };
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
    inputs.revision = { tokens: {}, settings: {}, pages: [PAGE] };
    inputs.code = {
      sections: [
        section('shop:footer'),
        section('shop:hero'),
        section('shop:cart-drawer', { role: 'cart-drawer' }),
        section('shop:cookie-banner', { role: 'cookie-banner' }),
      ],
      pages: {
        home: [instance('hero-1', 'shop:hero')],
        footer: [instance('footer-1', 'shop:footer')],
        overlay: [instance('drawer-1', 'shop:cart-drawer'), instance('banner-1', 'shop:cookie-banner')],
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

const namesOf = (html: readonly string[]): (string | undefined)[] =>
  html.map((item) => /data-section="([^"]+)"/.exec(item)?.[1]);

describe('группа overlay', () => {
  it('списки страницы: шапка, свой список, подвал, overlay', () => {
    expect(pageListsOf('home')).toEqual(['header', 'home', 'footer', 'overlay']);
  });

  it('главная и своя страница: overlay — после подвала, по порядку списка; в <main> его нет', async () => {
    for (const [path, own] of [
      ['/', ['shop:hero']],
      ['/o-nas', []],
    ] as const) {
      const seen: ShopPageLocals[] = [];
      const requests: SectionRenderRequest[] = [];
      await renderShopPage(shopInputs(), path, themeOf(seen), pageOf(requests));
      expect(requests.map((request) => request.section)).toEqual([...own, 'shop:footer', 'shop:cart-drawer', 'shop:cookie-banner']);
      expect(namesOf(seen[0]?.sections ?? [])).toEqual([...own]);
      expect(namesOf(seen[0]?.footer ?? [])).toEqual(['shop:footer', 'shop:cart-drawer', 'shop:cookie-banner']);
    }
  });

  it('обёртка секции с ролью — data-role; у секции без роли атрибута нет', async () => {
    const seen: ShopPageLocals[] = [];
    await renderShopPage(shopInputs(), '/', themeOf(seen), pageOf([]));
    const [footer = '', drawer = '', banner = ''] = seen[0]?.footer ?? [];
    expect(drawer).toContain('data-section="shop:cart-drawer" data-section-id="drawer-1" data-role="cart-drawer"');
    expect(banner).toContain('data-role="cookie-banner"');
    expect(footer).not.toContain('data-role');
    expect(seen[0]?.head.codeHtml).toContain('id="merfy-sections"');
  });

  it('ошибка рендера секции с ролью — render-failed, сборку не выкладываем; обычная секция — пропущена', async () => {
    await expect(renderShopPage(shopInputs(), '/', themeOf([]), pageOf([], 'shop:cart-drawer'))).rejects.toMatchObject({
      code: 'render-failed',
    });
    const seen: ShopPageLocals[] = [];
    await renderShopPage(shopInputs(), '/', themeOf(seen), pageOf([], 'shop:hero'));
    expect(seen[0]?.sections.join('')).toBe('');
  });

  it('входы: role — из списка платформы; другая — inputs-invalid; страница с id overlay — занят', () => {
    expect(parseBuildInputs(shopInputs()).code.sections[2]).toMatchObject({ role: 'cart-drawer' });
    const wrongRole = changedInputs((inputs) => {
      inputs.code.sections = [section('shop:cart-drawer', { role: 'minicart' }) as never];
    });
    expect(() => parseBuildInputs(wrongRole)).toThrow(expect.objectContaining({ code: 'inputs-invalid' }));
    const reserved = changedInputs((inputs) => {
      inputs.revision = { tokens: {}, settings: {}, pages: [{ ...PAGE, id: 'overlay' }] };
    });
    expect(() => parseBuildInputs(reserved)).toThrow(expect.objectContaining({ code: 'inputs-invalid' }));
  });
});
