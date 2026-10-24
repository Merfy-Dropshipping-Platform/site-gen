import { fileURLToPath } from 'node:url';
import { buildKey, parseBuildInputs } from '@merfy/storefront-build';
import { acceptSection, publishDrafts, readSectionFolder, type Door } from '@merfy/storefront-sections';
import { readPointer } from '@merfy/storefront-storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { readSnapshot } from '../../src/snapshot';
import { TEST_SHELL, extensions, liveFiles, liveHome, logged, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertRevision, insertSite, type SiteFields } from './stack';

// Код магазина на стенде (design.md блока 7, п. 15, 19, 24): свои секции магазина и секции расширений проходят
// проверку при сохранении, места — в ревизии магазина, снимок отдаёт видимые, сборка выкладывает страницы с бандлом
// страницы (блок 5 «Секций и SDK», часть 5б), публикация выносит черновик своей секции. Секций платформы и тем нет
// (блок 1 «Секций и SDK», пп. 1, 2).
const SECTIONS = fileURLToPath(new URL('../../../storefront-sections/fixtures/sections', import.meta.url));
// Исходник нашей секции — «Значок корзины»: магазин сохраняет её как свою (пп. 1, 27).
const OUR_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const instance = (id: string, section: string, settings: Record<string, string> = {}) => ({ id, section, settings });
const PLACEMENT = {
  home: [
    instance('cart-badge-1', 'shop:cart-badge'),
    instance('color-match-1', 'shop:color-match'),
    instance('list-1', 'reviews:list'),
  ],
};
const RELEASES: [Door, string][] = [
  [{ author: 'extension', extension: 'reviews', release: '1.4.0' }, 'reviews-list'],
  [{ author: 'extension', extension: 'geo', release: '1.0.0' }, 'geo-locate'],
];
const VERSIONS: Record<string, string> = { reviews: '1.4.0', geo: '1.0.0' };

let harness: Harness;
let products: FakeProducts;

// Ответ extensions.enabledForShop: эти расширения у магазина включены.
const enabled = (...ids: string[]) => ({ success: true, data: ids.map((id) => ({ id, version: VERSIONS[id] })) });
const sectionDeps = () => ({ db: harness.db, store: harness.store });
const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];

async function accept(door: Door, folder: string): Promise<void> {
  const result = await acceptSection(sectionDeps(), door, await readSectionFolder(folder));
  if (result.status === 'refused')
    throw new Error(`${folder}: ${result.problems.map((item) => item.message).join('; ')}`);
}

// Нашу секцию магазин сохранил и опубликовал, как свою (пп. 1, 27).
async function saveOurSections(siteId: string): Promise<void> {
  await accept({ author: 'shop', shopId: siteId }, `${OUR_SECTIONS}/cart-badge`);
  await publishDrafts(harness.db, siteId);
}

// Магазин сохранил свою секцию (п. 21): текущая правка, на витрине её ещё нет.
const saveShopSection = (siteId: string): Promise<void> =>
  accept({ author: 'shop', shopId: siteId }, `${SECTIONS}/shop-color-match`);

async function publishAndBuild(siteId: string): Promise<void> {
  await acceptIncoming(harness.deps, {
    owner: 'site',
    siteId,
    type: 'merchant-publish',
    eventAt: new Date().toISOString(),
  });
  const index = harness.queued.findIndex((job) => job.siteId === siteId);
  const [job] = harness.queued.splice(index, 1);
  await runBuildJob(harness.deps, job);
}

beforeAll(async () => {
  harness = openHarness();
  products = await startFakeProducts();
  for (const [door, folder] of RELEASES) await accept(door, `${SECTIONS}/${folder}`);
}, 120_000);

afterAll(async () => {
  await products.close();
  await harness.close();
});

beforeEach(() => {
  extensions.answer = enabled();
});

describe('код магазина', () => {
  it('видимые секции на своих местах: черновик своей не виден; выключили расширение — его секций нет и ключ другой', async () => {
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { sections: PLACEMENT });
    await saveOurSections(site.id);
    await saveShopSection(site.id);
    extensions.answer = enabled('reviews', 'geo');
    const all = parseBuildInputs((await readSnapshot(harness.deps.snapshot, site.id)).inputs);
    expect(all.code.pages).toEqual({
      home: [
        { id: 'cart-badge-1', section: 'shop:cart-badge', settings: {} },
        { id: 'list-1', section: 'reviews:list', settings: {} },
      ],
    });
    expect(all.code.globals).toEqual(['geo:locate']);
    expect(all.code.sections.map((section) => section.name)).toEqual(['geo:locate', 'reviews:list', 'shop:cart-badge']);
    expect(all.shell).toEqual({ version: TEST_SHELL.version, hash: TEST_SHELL.hash, parts: TEST_SHELL.parts });
    extensions.answer = enabled('geo');
    const without = parseBuildInputs((await readSnapshot(harness.deps.snapshot, site.id)).inputs);
    expect(without.code.pages).toEqual({ home: [expect.objectContaining({ id: 'cart-badge-1' })] });
    expect(buildKey(without)).not.toBe(buildKey(all));
  });

  it('публикация: черновик своей секции — на витрину; бандл страницы — в HTML главной; модули секций — по их uses', async () => {
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { sections: PLACEMENT });
    await saveOurSections(site.id);
    await saveShopSection(site.id);
    extensions.answer = enabled('reviews');
    await publishAndBuild(site.id);
    expect(logged(harness.lines, 'sections-published').at(-1)).toMatchObject({
      shopId: site.id,
      sections: 'shop:color-match',
    });
    // Ядро стенда меньше 4096 Б: бандл встроен в HTML главной, файлов _merfy/ в сборке нет.
    const files = await liveFiles(harness.store, labelOf(site));
    expect(files.filter((path) => path.startsWith('_merfy/'))).toEqual([]);
    const home = await liveHome(harness.store, labelOf(site));
    expect(home.split('merfyStarted')).toHaveLength(2);
    expect(home).not.toContain('id="merfy-modules"');
    expect(home).toContain('<merfy-section data-section="shop:cart-badge" data-section-id="cart-badge-1"');
    expect(home).toContain('data-merfy-input');
    // Часть 5в блока 5: модули секции в ctx — по её script_meta.uses. «Значок корзины» и «Отзывы» объявили
    // uses: ["cart"] — у обоих в бандле только cart; модуль «Отзывов» нового вида — пропусков нет.
    expect(home.split('uses:["cart"]')).toHaveLength(3);
    expect(logged(harness.lines, 'section-script-skipped').filter((line) => line.shopId === site.id)).toEqual([]);
  });

  it('extensions не ответил — снимок не получен: сборка failed, строка extensions-failed, живой сайт не тронут', async () => {
    const site = await insertSite(harness.db);
    extensions.answer = new Error('extensions молчит');
    await publishAndBuild(site.id);
    expect(logged(harness.lines, 'extensions-failed').at(-1)).toMatchObject({
      shopId: site.id,
      error: 'extensions молчит',
    });
    expect(logged(harness.lines, 'build-finish').at(-1)).toMatchObject({ shopId: site.id, outcome: 'failed' });
    expect(await readPointer(harness.store, labelOf(site))).toBeNull();
  });

  it('места не той формы — строка sections-invalid, сборки нет', async () => {
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { sections: { home: ['shop:cart-badge'] } });
    await publishAndBuild(site.id);
    expect(logged(harness.lines, 'sections-invalid').at(-1)).toMatchObject({ shopId: site.id });
    expect(logged(harness.lines, 'build-finish').at(-1)).toMatchObject({ shopId: site.id, outcome: 'failed' });
  });
});
