import { describe, expect, it } from 'vitest';
import type { DoorFields } from '../src/doors';
import { readManifest, type SectionManifest } from '../src/format';
import { OVERLAY_RETIRED_TEXT, overlayRetiredProblems } from '../src/overlay-retired';
import { PROBLEM_CODES } from '../src/problems';
import { PROBLEM_INFO } from '../src/problem-info';
import type { RowsQuery } from '../src/registry';

// Три блока (03.11): новая секция без роли не объявляет группу overlay, принятая раньше работает как работала.
const manifestOf = (extra: Record<string, unknown>): SectionManifest => {
  const result = readManifest({
    'section.json': JSON.stringify({ sdk: 1, name: 'window', kind: 'section', title: 'Окно', ...extra }),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.value;
};
const SHOP: DoorFields = { author: 'shop', prefix: 'shop', owner: 'shop-1', release: null };

type Call = { sql: string; params: unknown[] };
// Реестр в памяти: известны только перечисленные имена; запрос смотрит те же поля, что настоящий (автор, владелец, имя).
const registryWith = (known: string[]): { db: RowsQuery; calls: Call[] } => {
  const calls: Call[] = [];
  const db: RowsQuery = {
    query: (sql, params) => {
      calls.push({ sql, params });
      const name = params[2];
      return Promise.resolve({ rows: typeof name === 'string' && known.includes(name) ? [{ found: 1 }] : [] });
    },
  };
  return { db, calls };
};

describe('overlayRetiredProblems: новая секция без роли не объявляет overlay', () => {
  it('новая секция с groups: ["overlay"] — отказ overlay-retired с текстом, как теперь сделать', async () => {
    const { db, calls } = registryWith([]);
    const problems = await overlayRetiredProblems(db, SHOP, manifestOf({ groups: ['overlay'] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'overlay-retired', file: 'section.json', message: OVERLAY_RETIRED_TEXT });
    expect(OVERLAY_RETIRED_TEXT).toContain('ctx.behavior("dialog")');
    expect(OVERLAY_RETIRED_TEXT).toContain('footer');
    expect(calls[0]?.params).toEqual(['shop', 'shop-1', 'shop:window']);
  });

  it('секция, принятая с overlay раньше, — без отказа: новая правка группу сохраняет', async () => {
    const { db } = registryWith(['shop:window']);
    expect(await overlayRetiredProblems(db, SHOP, manifestOf({ groups: ['overlay'] }))).toEqual([]);
  });

  it('другая секция с тем же overlay не считается: имя берётся с префиксом двери', async () => {
    const { db } = registryWith(['reviews:window']);
    const codes = (await overlayRetiredProblems(db, SHOP, manifestOf({ groups: ['overlay'] }))).map((item) => item.code);
    expect(codes).toEqual(['overlay-retired']);
    const door: DoorFields = { author: 'extension', prefix: 'reviews', owner: 'reviews', release: '1.0.0' };
    expect(await overlayRetiredProblems(db, door, manifestOf({ groups: ['overlay'] }))).toEqual([]);
  });

  it('секция с ролью, секция страницы, шапки и подвала — не затронуты, реестр не опрашивается', async () => {
    const { db, calls } = registryWith([]);
    for (const extra of [
      { role: 'cart-drawer' },
      { role: 'cookie-banner', groups: ['overlay'] },
      { groups: ['page'] },
      { groups: ['header'] },
      { groups: ['footer'] },
      {},
    ])
      expect(await overlayRetiredProblems(db, SHOP, manifestOf(extra))).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('код есть в списке кодов и в справочнике отказов; справочник отсылает к документации', () => {
    expect(PROBLEM_CODES).toContain('overlay-retired');
    const info = PROBLEM_INFO['overlay-retired'];
    expect(info.fix).toContain('ctx.behavior');
    expect(info.doc).toContain('script.md#поведения-из-скрипта-секции');
    expect(PROBLEM_INFO['overlay-place'].doc).toContain('script.md#поведения-из-скрипта-секции');
  });
});
