import { sectionManifestSchema, type CurrentSection } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { EXTENSION_PLACES_ROUTE, extensionPlaces, placesOf } from '../src/extension-places';
import type { VisibleSection } from '../src/section-extension';

// Места по умолчанию секций расширений (блок 12 «Секций и SDK», часть 12д, Р12д-12): GET /sections/places?shop= —
// секции включённых расширений с autoPlace и секции с местом блоков этой точки. Расширение — test-ext.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
type Parts = NonNullable<CurrentSection['scriptMeta']>['parts'];

function sectionOf(name: string, manifest: Record<string, unknown>, parts?: Parts): [string, VisibleSection] {
  const short = name.slice(name.indexOf(':') + 1);
  const section: VisibleSection = {
    name,
    manifest: sectionManifestSchema.parse({ sdk: 1, kind: 'section', title: short, ...manifest, name: short }),
    render: 'export default () => ""',
    renderHash: `sha256:${short}`,
    ...(parts === undefined ? {} : { scriptMeta: { uses: [], parts, classes: [] } }),
  };
  return [name, section];
}

const VISIBLE = new Map([
  sectionOf('shop:hero', {}),
  sectionOf('shop:product', {}, ['cart', 'purchase']),
  sectionOf('shop:own-form', { autoPlace: 'product' }),
  sectionOf('test-ext:reviews', { autoPlace: 'product' }, ['ext']),
  sectionOf('test-ext:badge', {}),
]);

describe('placesOf', () => {
  it('секции расширений с autoPlace и секции с местом блоков; секции магазина с autoPlace — нет', () => {
    expect(placesOf(VISIBLE)).toEqual([{ section: 'test-ext:reviews', autoPlace: 'product', hosts: ['shop:product'] }]);
  });

  it('места блоков нет ни у одной секции — hosts пустой', () => {
    const without = new Map([...VISIBLE].filter(([name]) => name !== 'shop:product'));
    expect(placesOf(without)).toEqual([{ section: 'test-ext:reviews', autoPlace: 'product', hosts: [] }]);
  });
});

describe(`GET ${EXTENSION_PLACES_ROUTE}`, () => {
  const depsOf = (sections: ReadonlyMap<string, VisibleSection> | null) => ({
    shop: (raw: string | null) =>
      Promise.resolve(raw === SHOP ? { shopId: SHOP } : { status: 404, body: 'магазина нет' }),
    sections: () => Promise.resolve(sections),
  });

  it('200 — места; магазина нет — ответ поиска магазина; расширения не ответили — 502', async () => {
    const ok = await extensionPlaces(depsOf(VISIBLE), SHOP);
    expect([ok.status, JSON.parse(String(ok.body))]).toEqual([200, { places: placesOf(VISIBLE) }]);
    expect((await extensionPlaces(depsOf(VISIBLE), 'other')).status).toBe(404);
    expect((await extensionPlaces(depsOf(null), SHOP)).status).toBe(502);
  });
});
