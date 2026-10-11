import { fileURLToPath } from 'node:url';
import { buildKey, parseBuildInputs, shellDir } from '@merfy/storefront-build';
import { acceptSection, readSectionFolder, type Door } from '@merfy/storefront-sections';
import { readPointer } from '@merfy/storefront-storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { acceptSectionReleases, releaseFolders } from '../../src/section-releases';
import { readSnapshot } from '../../src/snapshot';
import { FAKE_THEME, TEST_SHELL, extensions, liveFiles, liveHome, logged, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertRevision, insertSite, type SiteFields } from './stack';

// Код магазина на стенде (design.md блока 7, п. 15, 19, 24): секции четырёх авторов проходят приём блока 7, места — в
// ревизии магазина, снимок берёт видимые, сборка кладёт ядро и скрипты, публикация выносит черновик своей секции.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SECTIONS = fileURLToPath(new URL('../../../storefront-sections/fixtures/sections', import.meta.url));
const PLACEMENT = { home: ['platform:cart-badge', 'nova:scarf-colors', 'shop:color-match', 'reviews:list'] };
const RELEASES: [Door, string][] = [
  [{ author: 'theme', theme: 'nova', release: FAKE_THEME.version }, 'theme-scarf-colors'],
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
  const result = await acceptSection(sectionDeps(), door, await readSectionFolder(`${SECTIONS}/${folder}`));
  if (result.status === 'refused')
    throw new Error(`${folder}: ${result.problems.map((item) => item.message).join('; ')}`);
}

// Магазин сохранил свою секцию (дверь своей секции, п. 21): текущая правка, на витрине её ещё нет.
const saveShopSection = (siteId: string): Promise<void> =>
  accept({ author: 'shop', shopId: siteId }, 'shop-color-match');

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
  const platform = releaseFolders(ROOT, TEST_SHELL.version, new Map());
  await acceptSectionReleases({ ...sectionDeps(), log: harness.deps.log }, platform);
  for (const [door, folder] of RELEASES) await accept(door, folder);
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
    const releases = logged(harness.lines, 'section-releases');
    expect(releases.map((line) => [Number(line.accepted) + Number(line.unchanged), line.refused])).toEqual([[1, 0]]);
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { sections: PLACEMENT });
    await saveShopSection(site.id);
    extensions.answer = enabled('reviews', 'geo');
    const all = parseBuildInputs((await readSnapshot(harness.deps.snapshot, site.id)).inputs);
    expect(all.code.pages).toEqual({ home: ['platform:cart-badge', 'nova:scarf-colors', 'reviews:list'] });
    expect(all.code.globals).toEqual(['geo:locate']);
    expect(all.code.sections.map((section) => section.name)).toEqual([
      'geo:locate',
      'nova:scarf-colors',
      'platform:cart-badge',
      'reviews:list',
    ]);
    expect(all.shell).toEqual({ version: TEST_SHELL.version, hash: TEST_SHELL.hash, preload: TEST_SHELL.preload });
    extensions.answer = enabled('geo');
    const without = parseBuildInputs((await readSnapshot(harness.deps.snapshot, site.id)).inputs);
    expect(without.code.pages).toEqual({ home: ['platform:cart-badge', 'nova:scarf-colors'] });
    expect(buildKey(without)).not.toBe(buildKey(all));
  });

  it('публикация: черновик своей секции — на витрину; сборка кладёт ядро и скрипты; главная — с кодом', async () => {
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, { sections: PLACEMENT });
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
    await insertRevision(harness.db, site.id, { sections: { home: 'platform:cart-badge' } });
    await publishAndBuild(site.id);
    expect(logged(harness.lines, 'sections-invalid').at(-1)).toMatchObject({ shopId: site.id });
    expect(logged(harness.lines, 'build-finish').at(-1)).toMatchObject({ shopId: site.id, outcome: 'failed' });
  });
});
