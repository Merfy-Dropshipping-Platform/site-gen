import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readPointer } from '@merfy/storefront-storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { portOf, startDrawServer } from '../../src/draw';
import { liveManifest } from '../../src/live';
import { ensureRendererArchive } from '../../src/renderer-archive';
import { createSlots } from '../../src/slots';
import { archiveLoader, createThemeCatalog, recordedVersions } from '../../src/theme-catalog';
import { FAKE_THEME, RENDER_HASH, liveHome, openHarness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertSite, resetBuilder, type SiteFields } from './stack';

// Магазин закреплён на «прошлой» версии 0.0.9: её архив — настоящая серверная сборка nova, записанная под этим номером.
// Магазин без закрепления: сборка закрепит его выпущенной версией (на стенде — FAKE_THEME 0.0.1).
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OLD = { version: '0.0.9', contentHash: `sha256:${'9'.repeat(64)}` };
const base = openHarness();
const catalog = createThemeCatalog({
  current: base.deps.themes,
  previews: new Map(),
  index: (themeId) => recordedVersions(base.store, themeId),
  load: archiveLoader(ROOT, base.store, tmpdir(), base.deps.log),
  released: () => Promise.resolve(FAKE_THEME.version),
  log: base.deps.log,
});
const harness = openHarness({ catalog, snapshot: { ...base.deps.snapshot, pins: catalog } });
let products: FakeProducts;

const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];

// Событие правки → задание в очереди теста → сборка (как build-job.test.ts).
async function buildNow(siteId: string): Promise<void> {
  await acceptIncoming(harness.deps, {
    owner: 'site',
    siteId,
    type: 'shop-name-change',
    eventAt: new Date().toISOString(),
  });
  const index = harness.queued.findIndex((job) => job.siteId === siteId);
  if (index < 0) throw new Error(`задание сборки магазина ${siteId} не поставлено`);
  const [job] = harness.queued.splice(index, 1);
  await runBuildJob(harness.deps, job);
}

async function pinnedOf(siteId: string): Promise<unknown> {
  const { rows } = await harness.db.query('SELECT theme_version FROM site WHERE id = $1', [siteId]);
  return rows[0];
}

beforeAll(async () => {
  products = await startFakeProducts();
  await resetBuilder(harness.db);
  const archiveDeps = { store: harness.store, log: harness.deps.log, clock: harness.deps.clock };
  await ensureRendererArchive(archiveDeps, ROOT, 'nova', OLD);
});

afterAll(async () => {
  await products.close();
  await catalog.close();
  await harness.close();
  await base.close();
});

describe('магазин рисуется версией своего закрепления (design.md блока 10, П10-1 Б)', () => {
  it('закреплён на 0.0.9 — собран рисовальщиком из архива, в манифесте и конфиге страницы 0.0.9', async () => {
    const shop = await insertSite(harness.db, { name: 'Вязаный дом' });
    await harness.db.query("UPDATE site SET theme_version = '0.0.9' WHERE id = $1", [shop.id]);
    await buildNow(shop.id);
    expect((await liveManifest(harness.store, labelOf(shop)))?.theme.version).toBe('0.0.9');
    expect(await liveHome(harness.store, labelOf(shop))).toContain('"version":"0.0.9"');
  });

  it('без закрепления — сборка закрепляет выпущенную версию', async () => {
    const shop = await insertSite(harness.db, { name: 'Шарфы Ани' });
    await buildNow(shop.id);
    expect(await pinnedOf(shop.id)).toEqual({ theme_version: FAKE_THEME.version });
  });

  it('закрепление на версии, которой у темы нет, — переписано выпущенной', async () => {
    const shop = await insertSite(harness.db, { name: 'Узелок' });
    await harness.db.query("UPDATE site SET theme_version = '7.7.7' WHERE id = $1", [shop.id]);
    await buildNow(shop.id);
    expect(await pinnedOf(shop.id)).toEqual({ theme_version: FAKE_THEME.version });
  });

  it('дорисовка — версией живой сборки: nova@0.0.9 — 200, nova@0.0.1 — 409', async () => {
    const shop = await insertSite(harness.db, { name: 'Клубок' });
    await harness.db.query("UPDATE site SET theme_version = '0.0.9' WHERE id = $1", [shop.id]);
    await buildNow(shop.id);
    const build = String((await readPointer(harness.store, labelOf(shop)))?.build ?? 0);
    const deps = {
      store: harness.store,
      snapshot: harness.deps.snapshot,
      themes: harness.deps.themes,
      catalog,
      renderHash: RENDER_HASH,
      slots: createSlots(1),
      timeoutMs: 10_000,
      log: harness.deps.log,
    };
    const server: Server = await startDrawServer(deps, 0);
    const drawAt = (theme: string): Promise<Response> => {
      const query = new URLSearchParams({ shop: shop.id, build, path: '/', render: RENDER_HASH, theme });
      return fetch(`http://127.0.0.1:${portOf(server)}/draw?${query.toString()}`);
    };
    try {
      const fresh = await drawAt('nova@0.0.9');
      expect(fresh.status).toBe(200);
      expect(await fresh.text()).toContain('"version":"0.0.9"');
      expect((await drawAt('nova@0.0.1')).status).toBe(409);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Страница стенда в сборке (STOREFRONT_STAND_PAGE, «Б», 11.10): стенд берётся у рисовальщика той же версии, что и сама
  // сборка, — у прошлой версии из архива тоже; без настройки стенда в сборке нет.
  it('со страницей стенда прошлая версия из архива отдаёт стенд своего рисовальщика', async () => {
    const loadStanded = archiveLoader(ROOT, base.store, tmpdir(), base.deps.log, { standPage: true });
    const loadPlain = archiveLoader(ROOT, base.store, tmpdir(), base.deps.log);
    const standed = await loadStanded('nova', OLD.version);
    const plain = await loadPlain('nova', OLD.version);
    try {
      expect(standed.theme.build.stand?.panel.groups.length).toBeGreaterThan(0);
      expect(plain.theme.build.stand).toBeUndefined();
    } finally {
      await Promise.all([standed.close(), plain.close()]);
    }
  });
});
