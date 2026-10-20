import { fileURLToPath } from 'node:url';
import { buildKey, parseBuildInputs, shellDir } from '@merfy/storefront-build';
import { acceptSection, publishDrafts, readSectionFolder, type Door } from '@merfy/storefront-sections';
import { readPointer } from '@merfy/storefront-storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { readSnapshot } from '../../src/snapshot';
import { TEST_SHELL, extensions, liveFiles, liveHome, logged, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertRevision, insertSite, type SiteFields } from './stack';

// Код магазина на стенде (design.md блока 7, п. 15, 19, 24): свои секции магазина и секции расширений проходят приём
// блока 7, места — в ревизии магазина, снимок отдаёт видимые, сборка выкладывает ядро и скрипты, публикация выносит
// черновик своей секции. Секций платформы и тем нет (блок 1 «Секций и SDK», пп. 1, 2).
const SECTIONS = fileURLToPath(new URL('../../../storefront-sections/fixtures/sections', import.meta.url));
// Исходники наших секций — «Значок корзины» и «Аналитика»: магазин сохраняет их как свои (пп. 1, 27).
const OUR_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const PLACEMENT = { home: ['shop:cart-badge', 'shop:color-match', 'reviews:list'] };
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

// Наши секции магазин сохранил и опубликовал, как свои (пп. 1, 27).
async function saveOurSections(siteId: string): Promise<void> {
  for (const name of ['cart-badge', 'analytics'])
    await accept({ author: 'shop', shopId: siteId }, `${OUR_SECTIONS}/${name}`);
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
    expect(all.code.pages).toEqual({ home: ['shop:cart-badge', 'reviews:list'] });
    expect(all.code.globals).toEqual(['geo:locate', 'shop:analytics']);
    expect(all.code.sections.map((section) => section.name)).toEqual([
      'geo:locate',
      'reviews:list',
      'shop:analytics',
      'shop:cart-badge',
    ]);
    expect(all.shell).toEqual({ version: TEST_SHELL.version, hash: TEST_SHELL.hash, preload: TEST_SHELL.preload });
    extensions.answer = enabled('geo');
    const without = parseBuildInputs((await readSnapshot(harness.deps.snapshot, site.id)).inputs);
    expect(without.code.pages).toEqual({ home: ['shop:cart-badge'] });
    expect(buildKey(without)).not.toBe(buildKey(all));
  });

  it('публикация: черновик своей секции — на витрину; сборка выкладывает ядро и скрипты; главная — с кодом', async () => {
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
    const files = await liveFiles(harness.store, labelOf(site));
    expect(files.filter((path) => path.startsWith('_merfy/m/'))).toHaveLength(4);
    expect(files.filter((path) => path.startsWith('_merfy/shell/'))).toEqual([`${shellDir(TEST_SHELL.hash)}/shell.js`]);
    const home = await liveHome(harness.store, labelOf(site));
    expect(home).toContain('id="merfy-modules"');
    expect(home).toContain('<merfy-section data-section="shop:color-match">');
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
    await insertRevision(harness.db, site.id, { sections: { home: 'shop:cart-badge' } });
    await publishAndBuild(site.id);
    expect(logged(harness.lines, 'sections-invalid').at(-1)).toMatchObject({ shopId: site.id });
    expect(logged(harness.lines, 'build-finish').at(-1)).toMatchObject({ shopId: site.id, outcome: 'failed' });
  });
});
