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

function shopInputs(withHeader = false): BuildInputs {
  return changedInputs((inputs) => {
    inputs.revision = { tokens: {}, settings: {}, pages: [PAGE] };
    inputs.code = {
      sections: [
        ...(withHeader ? [section('shop:header')] : []),
        section('shop:footer'),
        section('shop:hero'),
        section('shop:cart-drawer', { role: 'cart-drawer' }),
        section('shop:cookie-banner', { role: 'cookie-banner' }),
      ],
      pages: {
        ...(withHeader ? { header: [instance('header-1', 'shop:header')] } : {}),
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

  it('ориентиры (семантика 18.11): шапка — в <header>, подвал — в <footer>, окна — после него и вне ориентира', async () => {
    const seen: ShopPageLocals[] = [];
    await renderShopPage(shopInputs(true), '/', themeOf(seen), pageOf([]));
    const [locals] = seen;
    expect(locals?.header).toHaveLength(1);
    expect(locals?.header[0]).toMatch(/^<header><merfy-section data-section="shop:header"[\s\S]*<\/merfy-section><\/header>$/);
    expect(locals?.footer[0]).toMatch(/^<footer><merfy-section data-section="shop:footer"[\s\S]*<\/merfy-section><\/footer>$/);
    expect(namesOf(locals?.footer.slice(1) ?? [])).toEqual(['shop:cart-drawer', 'shop:cookie-banner']);
    expect(locals?.footer.slice(1).some((html) => html.includes('<footer'))).toBe(false);
    // Шапки нет — пустого <header> тоже нет.
    const without: ShopPageLocals[] = [];
    await renderShopPage(shopInputs(), '/', themeOf(without), pageOf([]));
    expect(without[0]?.header).toEqual([]);
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

  it('окно — секция без роли в overlay (01.11): один раз на каждой странице после подвала, data-overlay и hidden; классы шаблона — в CSS', async () => {
    const inputs = changedInputs((draft) => {
      const base = shopInputs();
      draft.revision = base.revision;
      draft.code = {
        ...base.code,
        sections: [...base.code.sections, section('shop:promo', { overlay: true })],
        pages: { ...base.code.pages, overlay: [...(base.code.pages.overlay ?? []), instance('promo-1', 'shop:promo')] },
      };
    });
    const page = (requests: SectionRenderRequest[]): PageRender => ({
      ...pageOf(requests),
      sections: {
        modules: new Map([[HASH, MODULE]]),
        render: (request) => {
          requests.push(request);
          const html = request.section === 'shop:promo' ? '<div class="flex items-center">Скидка</div>' : '<p></p>';
          return Promise.resolve(html);
        },
      },
    });
    for (const path of ['/', '/o-nas']) {
      const seen: ShopPageLocals[] = [];
      const requests: SectionRenderRequest[] = [];
      await renderShopPage(inputs, path, themeOf(seen), page(requests));
      expect(requests.filter((request) => request.section === 'shop:promo')).toHaveLength(1);
      const footer = seen[0]?.footer ?? [];
      expect(namesOf(footer).at(-1)).toBe('shop:promo');
      expect(footer.at(-1)).toContain('data-section="shop:promo" data-section-id="promo-1" data-overlay hidden');
      expect(footer.slice(0, -1).join('')).not.toContain('data-overlay');
      expect(namesOf(seen[0]?.sections ?? [])).not.toContain('shop:promo');
      expect(seen[0]?.head.codeHtml).toContain('.items-center');
    }
    expect(parseBuildInputs(inputs).code.sections.at(-1)).toMatchObject({ overlay: true });
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
