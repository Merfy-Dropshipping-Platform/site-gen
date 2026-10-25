import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { ShopPageLocals, StandPageLocals } from '@merfy/storefront-build';
import { NO_MIGRATIONS, panelForTheme, parsePanel, parseTheme } from '@merfy/tokens';
import { acceptSection, readSectionFolder, type Door } from '@merfy/storefront-sections';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import panelJson from '../../../theme-contract/panel/theme-panel.json';
import novaTheme from '../../../theme-nova/theme.json';
import { portOf, startDrawServer, type DrawDeps } from '../../src/draw';
import { createPreviewRenderers } from '../../src/preview-renderers';
import { createSlots } from '../../src/slots';
import type { PreviewTheme } from '../../src/stand-preview';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { liveHome, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertRevision, insertSite, resetBuilder } from './stack';

// Правка текста в превью на стенде (блок 1 «Секций и SDK», часть 6, шаг 8 карточки 6-3): магазин на nova с «Страницей»
// в ревизии; в сборке служебных атрибутов правки нет, в превью — путь и подпись, а после их удаления HTML секции равен
// сборке. Стенд превью — как в preview.test.ts; рисовальщик выводит секции страницы, как fakeRender сборки.
const PAGE = fileURLToPath(new URL('../../../storefront-sections/fixtures/shop/page', import.meta.url));

let harness: Harness;
let products: FakeProducts;
let server: Server;
let base: string;

const tokens = parseTheme(novaTheme.tokens);
// Стенд превью передаёт локалы вида страницы (ShopPageLocals, с секциями), тип входа PreviewTheme — StandPageLocals:
// объединение пропускает и то и другое, секции читаются только у локалов страницы.
const renderStand = (locals: StandPageLocals | ShopPageLocals): Promise<string> =>
  Promise.resolve(
    `<!doctype html><html><head><meta charset="utf-8"></head><body><main>${
      'sections' in locals ? locals.sections.join('') : ''
    }</main></body></html>`,
  );
const NOVA: PreviewTheme = {
  version: '0.0.3',
  themeTokens: novaTheme.tokens,
  tokens,
  panel: panelForTheme(parsePanel(panelJson, tokens.dictionary), undefined),
  renderStand,
  assets: new Map(),
  migrations: NO_MIGRATIONS,
};

beforeAll(async () => {
  harness = openHarness();
  products = await startFakeProducts();
  await resetBuilder(harness.db);
}, 120_000);

afterAll(async () => {
  await products.close();
  await harness.close();
});
afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function serve(): Promise<void> {
  const deps: DrawDeps = {
    store: harness.store,
    snapshot: harness.deps.snapshot,
    themes: harness.deps.themes,
    catalog: harness.catalog,
    renderHash: harness.deps.snapshot.platform.renderHash,
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

async function accept(door: Door, folder: string): Promise<void> {
  const result = await acceptSection({ db: harness.db, store: harness.store }, door, await readSectionFolder(folder));
  if (result.status === 'refused')
    throw new Error(`${folder}: ${result.problems.map((item) => item.message).join('; ')}`);
}

// HTML секции «Страницы» целиком: от открывающей обёртки до закрывающей.
const sectionHtml = (html: string): string => {
  const start = html.indexOf('<merfy-section data-section="shop:page"');
  const end = html.indexOf('</merfy-section>', start);
  return start === -1 || end === -1 ? '' : html.slice(start, end + '</merfy-section>'.length);
};

// Служебные атрибуты превью (правка текста и метки блоков) — вычеркнуть.
const strip = (html: string): string => html.replace(/ data-merfy-(edit|edit-html|placeholder|block)="[^"]*"/g, '');

describe('правка текста в превью: атрибуты только в превью', () => {
  it('сборка без атрибутов; превью — путь и подпись; без атрибутов HTML секции равен сборке', async () => {
    await serve();
    const site = await insertSite(harness.db);
    await harness.db.query('INSERT INTO storefront_shop (site_id) VALUES ($1)', [site.id]);
    await accept({ author: 'shop', shopId: site.id }, PAGE);
    await insertRevision(harness.db, site.id, {
      sections: {
        home: [{ id: 'page-1', section: 'shop:page', settings: { heading: 'О нас', text: '<p>Мы шьём пледы</p>' } }],
      },
    });
    await acceptIncoming(harness.deps, {
      owner: 'site',
      siteId: site.id,
      type: 'merchant-publish',
      eventAt: new Date().toISOString(),
    });
    const [job] = harness.queued.splice(
      harness.queued.findIndex((item) => item.siteId === site.id),
      1,
    );
    await runBuildJob(harness.deps, job);

    const label = (site.publicUrl ?? '').split('.')[0];
    const build = await liveHome(harness.store, label);
    expect(sectionHtml(build)).toContain('data-section-id="page-1"');
    expect(build).not.toMatch(/data-merfy-(edit|edit-html|placeholder)=/);

    const preview = await (await fetch(`${base}/preview?page=home&shop=${site.id}`)).text();
    expect(sectionHtml(preview)).toContain('data-section-id="page-1"');
    expect(sectionHtml(preview)).toContain('data-merfy-edit="heading"');
    expect(sectionHtml(preview)).toContain('data-merfy-edit-html="text"');
    expect(sectionHtml(preview)).toContain('data-merfy-placeholder="Заголовок"');
    expect(strip(sectionHtml(preview))).toBe(sectionHtml(build));
  }, 120_000);
});
