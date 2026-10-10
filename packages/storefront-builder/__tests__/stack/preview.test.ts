import type { Server } from 'node:http';
import type { StandPageLocals } from '@merfy/storefront-build';
import { panelForTheme, parsePanel, parseTheme } from '@merfy/tokens';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import panelJson from '../../../theme-contract/panel/theme-panel.json';
import novaTheme from '../../../theme-nova/theme.json';
import { portOf, startDrawServer, type DrawDeps } from '../../src/draw';
import { createSlots } from '../../src/slots';
import type { PreviewTheme } from '../../src/stand-preview';
import { RENDER_HASH, logged, openHarness, type Harness } from './builder';
import { insertRevision, insertSite, resetBuilder } from './stack';

// Превью конструктора на стенде (design.md блока 8, П8-1 А): стенд по текущей ревизии магазина — заново на каждый
// запрос, одним HTML; правки токенов из конструктора — { css, attributes }. Рисовальщик — подставной, как у сборки.
let harness: Harness;
let server: Server;
let base: string;

const tokens = parseTheme(novaTheme.tokens);
const fakeStand = (locals: StandPageLocals): Promise<string> =>
  Promise.resolve(
    [
      `<html data-card-style="${locals.attributes['data-card-style']}"><head>`,
      '<link rel="stylesheet" href="/_astro/stand.css">',
      `<style id="merfy-tokens">${locals.head.tokensCss}</style></head>`,
      `<body><h1>${locals.shop.name}</h1><p data-cart="${String(locals.settings['cart-type'])}"></p>`,
      `${locals.problems.map((problem) => `<li>${problem}</li>`).join('')}</body></html>`,
    ].join(''),
  );
const NOVA: PreviewTheme = {
  version: '0.0.3',
  themeTokens: novaTheme.tokens,
  tokens,
  panel: panelForTheme(parsePanel(panelJson, tokens.dictionary), undefined),
  renderStand: fakeStand,
  assets: new Map([['/_astro/stand.css', new TextEncoder().encode('h1{color:red}')]]),
};
const GREEN = { schemes: { 'scheme-1': { primary: '#16a34a' } }, root: { 'choice-card-style': 'card' } };

beforeAll(async () => {
  harness = openHarness();
  await resetBuilder(harness.db);
});
afterAll(() => harness.close());
afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function serve(preview: boolean): Promise<void> {
  const deps: DrawDeps = {
    store: harness.store,
    snapshot: harness.deps.snapshot,
    themes: harness.deps.themes,
    renderHash: RENDER_HASH,
    slots: createSlots(1),
    timeoutMs: 3_000,
    log: harness.deps.log,
    preview: preview
      ? {
          db: harness.db,
          themes: new Map([['nova', NOVA]]),
          apiUrl: 'https://gateway.dev.merfy.ru/api',
          log: harness.deps.log,
        }
      : undefined,
  };
  server = await startDrawServer(deps, 0);
  base = `http://127.0.0.1:${portOf(server)}`;
}

const postTokens = (shop: string, body: string): Promise<Response> =>
  fetch(`${base}/preview/tokens?shop=${shop}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });

describe('стенд в превью: GET /preview', () => {
  it('правки токенов и настроек текущей ревизии — на стенде; CSS темы внутри страницы; no-store', async () => {
    await serve(true);
    const site = await insertSite(harness.db, { name: 'Пледы' });
    await insertRevision(harness.db, site.id, { tokens: GREEN, settings: { 'cart-type': 'page' } });
    const response = await fetch(`${base}/preview?shop=${site.id}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('<style>h1{color:red}</style>');
    expect(html).toContain('--primary: #16a34a;');
    expect(html).toContain('data-card-style="card"');
    expect(html).toContain('<h1>Пледы</h1><p data-cart="page">');
  });

  it('новая ревизия видна сразу: данные — заново на каждый запрос', async () => {
    await serve(true);
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { settings: { 'cart-type': 'page' } });
    expect(await (await fetch(`${base}/preview?shop=${site.id}`)).text()).toContain('data-cart="page"');
    await insertRevision(harness.db, site.id, { settings: {} });
    expect(await (await fetch(`${base}/preview?shop=${site.id}`)).text()).toContain('data-cart="drawer"');
  });

  it('правки, что не подошли теме, — на стенде и в журнале; стенд нарисован', async () => {
    await serve(true);
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { settings: { 'cart-type': 'modal' } });
    const html = await (await fetch(`${base}/preview?shop=${site.id}`)).text();
    expect(html).toContain('<li>settings.cart-type: нужно drawer или page</li>');
    expect(logged(harness.lines, 'preview-problems').at(-1)).toMatchObject({ shopId: site.id });
  });

  it('не тот id — 400; магазина нет — 404; тема нынешняя — 404; POST — 405; без превью — 404', async () => {
    await serve(true);
    const old = await insertSite(harness.db, { themeId: 'rose' });
    expect((await fetch(`${base}/preview?shop=nope`)).status).toBe(400);
    expect((await fetch(`${base}/preview?shop=00000000-0000-4000-8000-00000000000f`)).status).toBe(404);
    expect(await (await fetch(`${base}/preview?shop=${old.id}`)).text()).toBe('тема магазина — не новой архитектуры');
    expect((await fetch(`${base}/preview?shop=${old.id}`, { method: 'POST' })).status).toBe(405);
    server.close();
    await serve(false);
    expect((await fetch(`${base}/preview?shop=${old.id}`)).status).toBe(404);
  });
});

describe('схема панели для конструктора: GET /theme-panel', () => {
  it('новая тема — секций нет, схема панели и токены темы; нынешняя — 404', async () => {
    await serve(true);
    const response = await fetch(`${base}/theme-panel?theme=nova`);
    const answer: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(answer).toMatchObject({
      components: {},
      categories: {},
      themePanel: { theme: { id: 'nova', version: '0.0.3', tokens: novaTheme.tokens }, panel: { v: 1 } },
    });
    expect(JSON.stringify(answer)).toContain('"id":"cookie-banner-position"');
    expect((await fetch(`${base}/theme-panel?theme=rose`)).status).toBe(404);
    expect((await fetch(`${base}/theme-panel`)).status).toBe(404);
  });
});

describe('правки токенов из конструктора: POST /preview/tokens', () => {
  it('правки → { css, attributes } темы магазина', async () => {
    await serve(true);
    const site = await insertSite(harness.db);
    const response = await postTokens(site.id, JSON.stringify({ tokens: GREEN }));
    const answer: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(answer).toMatchObject({ attributes: { 'data-card-style': 'card', 'data-card-align': 'left' } });
    expect(JSON.stringify(answer)).toContain('--primary: #16a34a;');
  });

  it('правка не подошла — 400 со списком; не JSON — 400; GET — 405', async () => {
    await serve(true);
    const site = await insertSite(harness.db);
    const bad = await postTokens(site.id, JSON.stringify({ tokens: { root: { 'choice-card-style': 'grid' } } }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ problems: ['root.choice-card-style: нужно standard или card'] });
    const notJson = await postTokens(site.id, '{');
    expect(await notJson.json()).toEqual({ problems: ['нужно тело JSON { tokens }'] });
    expect((await fetch(`${base}/preview/tokens?shop=${site.id}`)).status).toBe(405);
  });
});
