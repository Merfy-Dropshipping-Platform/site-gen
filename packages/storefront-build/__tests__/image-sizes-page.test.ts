import type { Marker } from '@merfy-dropshipping-platform/images';
import { panelForTheme, parsePanel } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import { sha256 } from '../src/canonical';
import type { BuildInputs } from '../src/inputs';
import type { ShopPageLocals } from '../src/locals';
import { renderShopPage, type ShopTheme } from '../src/page';
import type { PageRender } from '../src/sections-render';
import { changedInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Копии картинок в сборке страницы (модуль картинок, шаг 3): srcset ставится до порядка загрузки, поэтому ссылка
// предзагрузки главной картинки в <head> получает imagesrcset и imagesizes. Секцию рисует подставная функция рендера.
const ORIGIN = 'https://minio.dev.merfy.ru';
const PHOTO = `${ORIGIN}/product-images/hero.jpg`;
const MODULE = 'export default "секция";';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const PANEL = panelForTheme(parsePanel(panelJson, novaTokens.dictionary), undefined);
const MARKER: Marker = {
  rulesVersion: 1,
  status: 'ok',
  attempts: 1,
  width: 2400,
  height: 1600,
  variants: [
    { kind: 'm', width: 800, key: 'product-images/hero.jpg.m.webp' },
    { kind: 'd', width: 1600, key: 'product-images/hero.jpg.d.webp' },
  ],
};
const SET = `${PHOTO}.m.webp 800w, ${PHOTO}.d.webp 1600w`;

function shopInputs(images: BuildInputs['images']): BuildInputs {
  return changedInputs((inputs) => {
    inputs.revision = { tokens: {}, settings: {}, pages: [] };
    inputs.code = {
      sections: [{ name: 'shop:hero', kind: 'section', hash: sha256('hero'), render: HASH, script: null }],
      pages: { home: [{ id: 'hero-1', section: 'shop:hero', settings: {} }] },
      globals: [],
    };
    if (images !== undefined) inputs.images = images;
  });
}

const theme = (seen: ShopPageLocals[]): ShopTheme => ({
  tokens: novaTokens,
  panel: PANEL,
  render: (path, locals) => {
    seen.push(locals);
    return fakeRender(path, locals);
  },
});

const page: PageRender = {
  sections: { modules: new Map([[HASH, MODULE]]), render: () => Promise.resolve(`<img src="${PHOTO}" alt="">`) },
  mode: 'live',
};

describe('копии картинок на странице', () => {
  it('есть маркер: у <img> srcset и sizes, src — оригинал, preload в <head> с imagesrcset и imagesizes', async () => {
    const seen: ShopPageLocals[] = [];
    await renderShopPage(shopInputs({ origin: ORIGIN, markers: { [PHOTO]: MARKER } }), '/', theme(seen), page);
    const [locals] = seen;
    expect(locals?.sections.join('')).toContain(
      `src="${PHOTO}" alt="" srcset="${SET}" sizes="(max-width: 767px) 266px, 100vw"`,
    );
    expect(locals?.head.codeHtml).toContain(
      `<link rel="preload" as="image" href="${PHOTO}" imagesrcset="${SET}" imagesizes="(max-width: 767px) 266px, 100vw" fetchpriority="high">`,
    );
  });

  it('нет маркера: страница как раньше — без srcset, preload только с href', async () => {
    const seen: ShopPageLocals[] = [];
    await renderShopPage(shopInputs(undefined), '/', theme(seen), page);
    const [locals] = seen;
    expect(locals?.sections.join('')).not.toContain('srcset');
    expect(locals?.head.codeHtml).toContain(`<link rel="preload" as="image" href="${PHOTO}" fetchpriority="high">`);
  });
});
