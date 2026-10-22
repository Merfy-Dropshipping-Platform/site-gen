import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderShopPage, type ShopTheme } from '../../src/page';
import type { PageRender, SectionRenderRequest } from '../../src/sections-render';
import { startRenderer, type Renderer } from '../../src/renderer';
import { buildRendererBundle } from '../../src/theme-build';
import { standInputs } from '../support';
import { RENDERS, codeInputs } from '../support-code';
import { novaTokens } from '../support-theme';

// Код секций на настоящем рисовальщике nova (блок 7): ShopHead печатает код после токенов, главная — секции в <main>.
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-test/', import.meta.url));
const HEAD_ORDER = [
  'id="merfy-config"',
  'id="merfy-tokens"',
  'id="merfy-sections"',
  'id="merfy-modules"',
  'type="importmap"',
  'rel="modulepreload"',
  '<script type="module"',
];

const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');

describe('код секций на рисовальщике nova', () => {
  let renderer: Renderer;
  let theme: ShopTheme;

  beforeAll(async () => {
    const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
    renderer = await startRenderer(bundle.serverEntry);
    theme = { tokens: novaTokens, render: renderer.render };
  });

  afterAll(async () => {
    await renderer.close();
  });

  // Подставной рендер секций: имя секции и класс из словаря.
  const renderSectionStub = (request: SectionRenderRequest): Promise<string> =>
    Promise.resolve(`<p class="flex">${request.section}</p>`);
  const pageOf = (mode: PageRender['mode']): PageRender => ({
    sections: { modules: RENDERS, render: renderSectionStub },
    mode,
  });

  it('<head>: конфиг, токены, стили секций, список модулей, import map, подсказки, ядро; секции — в <main> после имени', async () => {
    const html = text((await renderShopPage(codeInputs(), '/', theme, pageOf('live'))).file.content);
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const at = HEAD_ORDER.map((marker) => head.indexOf(marker));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
    const names = [...main.matchAll(/<merfy-section data-section="([^"]+)" data-section-id="([^"]+)"/g)].map(
      ([, name]) => name,
    );
    expect(names).toEqual(['shop:cart-badge', 'shop:hero', 'reviews:list', 'reviews:list']);
    expect(main).toContain('<p class="flex">shop:hero</p>');
    expect(main.indexOf('<h1>')).toBeLessThan(main.indexOf('<merfy-section'));
  });

  it('магазин без кода — ни стилей секций, ни ядра, ни <merfy-section>', async () => {
    const html = text((await renderShopPage(standInputs, '/', theme)).file.content);
    expect(html).not.toContain('merfy-sections');
    expect(html).not.toContain('importmap');
    expect(html).not.toContain('<merfy-section');
  });
});
