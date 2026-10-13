import { parseBuildInputs } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSnapshot } from '../../src/snapshot';
import { openHarness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertSite } from './stack';

// Счётчики мерчанта в снимке на настоящем брокере (design.md блока 11, С11-4 Б): подставной сборщик аналитики отвечает,
// как сервер RPC на Go, — без обёртки Nest.
let harness: ReturnType<typeof openHarness>;
let fakes: FakeProducts;

const PIXELS = [
  { id: '0f0e0d0c-0000-4000-8000-000000000001', pixel_type: 'yandex_metrika', pixel_id: '12345678', is_active: true },
  { id: '0f0e0d0c-0000-4000-8000-000000000002', pixel_type: 'custom', pixel_id: '<script>', is_active: true },
];

beforeAll(async () => {
  fakes = await startFakeProducts();
  harness = openHarness();
});

afterAll(async () => {
  await harness.close();
  await fakes.close();
});

describe('счётчики мерчанта в снимке', () => {
  it('счётчик — сущность counter, адрес сборщика — во входах; «свой код» не прошёл', async () => {
    const site = await insertSite(harness.db);
    fakes.analytics.pixels.set(site.id, PIXELS);
    const inputs = parseBuildInputs((await readSnapshot(harness.deps.snapshot, site.id)).inputs);
    expect(inputs.env.analyticsUrl).toBe('https://analytics.dev.merfy.ru');
    expect(inputs.data.entities.filter((entity) => entity.type === 'counter')).toEqual([
      {
        type: 'counter',
        id: PIXELS[0].id,
        updatedAt: '1970-01-01T00:00:00.000Z',
        data: { kind: 'metrika', number: '12345678' },
      },
    ]);
  });

  it('сборщик аналитики ответил неуспехом — снимок «не получен»', async () => {
    const site = await insertSite(harness.db);
    fakes.analytics.answers.set(site.id, 'fail');
    expect((await readSnapshot(harness.deps.snapshot, site.id)).inputs.data.status).toBe('failed');
  });

  it('сборщик аналитики молчит — снимок «не получен» после тайм-аута', async () => {
    const site = await insertSite(harness.db);
    fakes.analytics.answers.set(site.id, 'silent');
    expect((await readSnapshot(harness.deps.snapshot, site.id)).inputs.data.status).toBe('failed');
  });
});
