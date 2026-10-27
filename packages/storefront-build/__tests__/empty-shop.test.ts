import { describe, expect, it } from 'vitest';
import { connectCommand, EMPTY_SHOP_TEXT, MCP_URL, MCP_URL_DEV, mcpUrlOf } from '../src/empty-shop';
import { renderShopPage, type ShopTheme } from '../src/page';
import type { PageRender, SectionRenderRequest } from '../src/sections-render';
import { ASSETS, RENDERS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Заглушка «работайте через MCP» на странице без единой секции (empty-shop.ts) и её отсутствие, как только секция есть.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');
const MARK = 'data-merfy-empty-shop';

const render = (request: SectionRenderRequest): Promise<string> => Promise.resolve(`<h2>${request.section}</h2>`);
const page = (mode: PageRender['mode']): PageRender => ({ sections: { modules: RENDERS, render }, mode, code: ASSETS });

const emptyShop = (change?: (inputs: ReturnType<typeof codeInputs>) => void): ReturnType<typeof codeInputs> =>
  codeInputs((inputs) => {
    inputs.code = { sections: [], pages: {}, globals: [] };
    change?.(inputs);
  });

describe('заглушка пустого магазина', () => {
  it('нет ни одной секции — в <main> заглушка с командой подключения, адрес прода', async () => {
    const html = text((await renderShopPage(emptyShop(), '/', theme)).file.content);
    expect(html).toContain(MARK);
    expect(html).toContain(EMPTY_SHOP_TEXT.heading);
    expect(html).toContain(connectCommand(MCP_URL));
    expect(html).toContain('Собери главную для магазина шарфов');
    expect(html).not.toContain('<merfy-section');
  });

  it('то же в превью конструктора и в рендере по запросу', async () => {
    for (const mode of ['preview', 'live'] as const) {
      const html = text((await renderShopPage(emptyShop(), '/', theme, page(mode))).file.content);
      expect(html).toContain(MARK);
    }
  });

  it('адрес магазина или API в *.dev.merfy.ru — команда с адресом dev MCP', async () => {
    const byShop = emptyShop((inputs) => (inputs.site.publicUrl = 'https://4e589f747e5c.dev.merfy.ru'));
    const byApi = emptyShop((inputs) => (inputs.env.apiUrl = 'https://gateway.dev.merfy.ru/api'));
    for (const inputs of [byShop, byApi]) {
      expect(mcpUrlOf(inputs)).toBe(MCP_URL_DEV);
      const html = text((await renderShopPage(inputs, '/', theme)).file.content);
      expect(html).toContain(connectCommand(MCP_URL_DEV));
      expect(html).not.toContain(connectCommand(MCP_URL));
    }
    expect(mcpUrlOf(emptyShop((inputs) => (inputs.site.publicUrl = 'https://shop.merfy.ru')))).toBe(MCP_URL);
    expect(mcpUrlOf(emptyShop((inputs) => (inputs.site.publicUrl = 'https://notdev.merfy.ru')))).toBe(MCP_URL);
  });

  it('есть хоть одна секция на странице — заглушки нет', async () => {
    const html = text((await renderShopPage(codeInputs(), '/', theme, page('live'))).file.content);
    expect(html).toContain('data-section-id="hero-1"');
    expect(html).not.toContain(MARK);
  });

  it('есть секция только в шапке (пустая страница) — заглушки нет: пусто не везде', async () => {
    const withHeader = codeInputs((inputs) => {
      const [hero] = inputs.code.pages.home ?? [];
      inputs.code = { ...inputs.code, pages: { header: hero ? [{ ...hero, id: 'header-1' }] : [] } };
    });
    // fakeRender шапку не печатает — тема с шапкой перед <body>-содержимым, как ShopPage.astro.
    const withHeaderTheme: ShopTheme = {
      tokens: novaTokens,
      render: async (path, locals) => (await fakeRender(path, locals)).replace('<h1>', `${locals.header.join('')}<h1>`),
    };
    const html = text((await renderShopPage(withHeader, '/', withHeaderTheme, page('live'))).file.content);
    expect(html).toContain('data-section-id="header-1"');
    expect(html).not.toContain(MARK);
  });

  it('заглушка не зависит от входов, кроме адресов: те же входы — те же байты', async () => {
    const [first, second] = await Promise.all([
      renderShopPage(emptyShop(), '/', theme),
      renderShopPage(structuredClone(emptyShop()), '/', theme),
    ]);
    expect(second).toEqual(first);
  });
});
