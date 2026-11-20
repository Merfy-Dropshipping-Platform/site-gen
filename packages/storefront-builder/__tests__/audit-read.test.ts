// Вопрос проверяющего процесса «вытеснено ли задание новой сборкой» к sites: любой сбой — «нет», аудит идёт как шёл.
import { describe, expect, it, vi } from 'vitest';
import { readSuperseded, supersededUrl } from '../src/audit/read';

const SHOP = '25669e80-6add-4fd5-b39d-b9065d2cc918';
const SITES = 'http://sites-service-dev:3114/';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('readSuperseded', () => {
  it('адрес — sites, магазин и номер сборки', () => {
    expect(supersededUrl(SITES, SHOP, 1795000000000)).toBe(
      `http://sites-service-dev:3114/api/sites/${SHOP}/audit/superseded?build=1795000000000`,
    );
  });

  it('sites ответил superseded — true, и наоборот', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ superseded: true }))
      .mockResolvedValueOnce(json({ superseded: false }));
    expect(await readSuperseded({ fetch, sitesUrl: SITES }, SHOP, 1)).toBe(true);
    expect(await readSuperseded({ fetch, sitesUrl: SITES }, SHOP, 1)).toBe(false);
  });

  it.each([
    ['не 200', () => Promise.resolve(json({ problems: ['x'] }, 500))],
    ['ответ не по форме', () => Promise.resolve(json({ superseded: 'да' }))],
    ['нет связи', () => Promise.reject(new Error('нет связи'))],
  ])('%s — не вытеснено', async (_name, answer) => {
    expect(await readSuperseded({ fetch: vi.fn(answer), sitesUrl: SITES }, SHOP, 1)).toBe(false);
  });
});
