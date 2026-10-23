import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { StandPageLocals } from '@merfy/storefront-build';
import { acceptSection, publishDrafts, readSectionFolder } from '@merfy/storefront-sections';
import { NO_MIGRATIONS, panelForTheme, parsePanel, parseTheme } from '@merfy/tokens';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import novaTheme from '../../../theme-nova/theme.json';
import panelJson from '../../../theme-contract/panel/theme-panel.json';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { portOf, startDrawServer, type DrawDeps } from '../../src/draw';
import { createPreviewRenderers } from '../../src/preview-renderers';
import { createSlots } from '../../src/slots';
import type { PreviewTheme } from '../../src/stand-preview';
import { extensions, liveHome, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertRevision, insertSite, resetBuilder, type SiteFields } from './stack';

// Сквозной шаг общих настроек на стеке (design.md блока 1, раздел 6, шаги 5, 8, 9): ревизия с wrapper экземпляра →
// сборка с классами на <merfy-section> и их CSS; превью одного блока — та же обёртка; GET /sections объявляет общие
// настройки. «Первый экран» — фикстура части 5 (Р1-5-11), магазин сохраняет её как свою.
const HERO = fileURLToPath(new URL('../../../storefront-sections/fixtures/shop/hero', import.meta.url));
const WRAPPER = { scheme: 'scheme-2', padding: { top: 40, bottom: 80 } };

let harness: Harness;
let products: FakeProducts;
let server: Server;
let base: string;

const tokens = parseTheme(novaTheme.tokens);
const fakeStand = (locals: StandPageLocals): Promise<string> =>
  Promise.resolve(`<html><head></head><body>${locals.shop.name}</body></html>`);
const NOVA: PreviewTheme = {
  version: '0.0.3',
  themeTokens: novaTheme.tokens,
  tokens,
  panel: panelForTheme(parsePanel(panelJson, tokens.dictionary), undefined),
  renderStand: fakeStand,
  assets: new Map(),
  migrations: NO_MIGRATIONS,
};

async function serve(): Promise<void> {
  const deps: DrawDeps = {
    store: harness.store,
    snapshot: harness.deps.snapshot,
    themes: harness.deps.themes,
    catalog: harness.catalog,
    renderHash: 'test',
    slots: createSlots(1),
    timeoutMs: 3_000,
    log: harness.deps.log,
    preview: {
      db: harness.db,
      themes: new Map([['nova', NOVA]]),
      pins: harness.catalog,
      previewOf: () => Promise.resolve(NOVA),
      apiUrl: 'https://gateway.dev.merfy.ru/api',
      fonts: () => Promise.resolve(null),
      log: harness.deps.log,
      snapshot: harness.deps.snapshot,
      catalog: harness.catalog,
      renderers: createPreviewRenderers({ limit: 1 }),
    },
  };
  server = await startDrawServer(deps, 0);
  base = `http://127.0.0.1:${portOf(server)}`;
}

// Магазин с «Первым экраном» и правками общих настроек; сборка выложена.
async function builtShop(): Promise<SiteFields> {
  const site = await insertSite(harness.db);
  await acceptSection(
    { db: harness.db, store: harness.store },
    { author: 'shop', shopId: site.id },
    await readSectionFolder(HERO),
  );
  await publishDrafts(harness.db, site.id);
  await insertRevision(harness.db, site.id, {
    sections: { home: [{ id: 'hero-1', section: 'shop:hero', settings: {}, wrapper: WRAPPER }] },
  });
  await acceptIncoming(harness.deps, {
    owner: 'site',
    siteId: site.id,
    type: 'merchant-publish',
    eventAt: new Date().toISOString(),
  });
  const index = harness.queued.findIndex((job) => job.siteId === site.id);
  const [job] = harness.queued.splice(index, 1);
  await runBuildJob(harness.deps, job);
  return site;
}

beforeAll(async () => {
  harness = openHarness();
  await resetBuilder(harness.db);
  products = await startFakeProducts();
  extensions.answer = { success: true, data: [] };
}, 120_000);

afterAll(async () => {
  await products.close();
  await harness.close();
});
afterEach(() => new Promise<void>((resolve) => (server === undefined ? resolve() : server.close(() => resolve()))));

describe('общие настройки секции на стеке (часть 5 блока 1)', () => {
  it('сборка: классы color-scheme-2 pt-10 pb-20 на hero-1 и их CSS в <style id="merfy-sections">', async () => {
    const site = await builtShop();
    const home = await liveHome(harness.store, (site.publicUrl ?? '').split('.')[0]);
    expect(home).toContain('<merfy-section data-section="shop:hero" data-section-id="hero-1"');
    expect(home).toContain('class="color-scheme-2 pt-10 pb-20"');
    expect(home).toMatch(/<style id="merfy-sections">[^<]*\.pt-10[^<]*\.pb-20/);
  });

  it('превью блока: тот же wrapper — те же классы; без wrapper — py-section', async () => {
    const site = await builtShop();
    await serve();
    const withWrapper = await fetch(`${base}/preview/section?shop=${site.id}`, {
      method: 'POST',
      body: JSON.stringify({
        instance: { id: 'hero-1', section: 'shop:hero', settings: {}, wrapper: WRAPPER },
      }),
    });
    expect(((await withWrapper.json()) as { html: string }).html).toContain('class="color-scheme-2 pt-10 pb-20"');
    const plain = await fetch(`${base}/preview/section?shop=${site.id}`, {
      method: 'POST',
      body: JSON.stringify({ instance: { id: 'hero-1', section: 'shop:hero', settings: {} } }),
    });
    expect(((await plain.json()) as { html: string }).html).toContain('class="py-section"');
  });

  it('GET /sections: wrapper у секции и объявления трёх общих настроек', async () => {
    const site = await builtShop();
    await serve();
    const answer: unknown = await (await fetch(`${base}/sections?shop=${site.id}`)).json();
    const sections = (answer as { sections: { name: string; wrapper: string[] }[] }).sections;
    expect(sections.find((section) => section.name === 'shop:hero')?.wrapper).toEqual(['scheme', 'padding']);
    const declared = (answer as { wrapper: { id: string }[] }).wrapper;
    expect(declared.map((field) => field.id)).toEqual(['scheme', 'padding', 'sticky']);
  });
});
