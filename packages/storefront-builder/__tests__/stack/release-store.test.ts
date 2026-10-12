import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activeReleases,
  activeShopOf,
  bootstrapRelease,
  createRelease,
  releaseShops,
  releasedVersion,
  recordThemeSwitch,
  setRelease,
  setShop,
  type NewRelease,
} from '../../src/release/store';
import { planWaves } from '../../src/release/waves';
import { insertSite, openPool, resetBuilder } from './stack';

const db = openPool();
const THEME: NewRelease = {
  kind: 'theme',
  subject: 'nova',
  fromVersion: '0.1.2',
  toVersion: '0.2.0',
  toHash: `sha256:${'2'.repeat(64)}`,
  contour: 'dev',
  startedBy: 'тест',
  status: 'testing',
};

beforeEach(async () => {
  await resetBuilder(db);
});

afterAll(async () => {
  await db.end();
});

describe('журнал выпуска (design.md блока 10)', () => {
  it('выпуск и его магазины — одной записью, волны по номеру выпуска', async () => {
    const ids = ['a', 'b', 'c', 'd', 'test'];
    const release = await createRelease(db, THEME, (id) => planWaves(ids, 'test', id));
    const shops = await releaseShops(db, release.id);
    expect(shops).toHaveLength(5);
    expect(shops[0]).toMatchObject({ siteId: 'test', wave: 0, status: 'waiting' });
    expect(shops.map((shop) => shop.siteId)).toEqual(planWaves(ids, 'test', release.id).map((shop) => shop.siteId));
  });

  it('второй активный выпуск на контуре — release-conflict; на другом контуре — можно', async () => {
    await createRelease(db, THEME, () => []);
    await expect(createRelease(db, THEME, () => [])).rejects.toMatchObject({ code: 'release-conflict' });
    await expect(createRelease(db, { ...THEME, contour: 'prod' }, () => [])).resolves.toMatchObject({
      contour: 'prod',
    });
    expect(await activeReleases(db, 'dev')).toHaveLength(1);
  });

  it('переходы условные: из чужого состояния — false', async () => {
    const release = await createRelease(db, THEME, () => [{ siteId: 'a', wave: 0, position: 0 }]);
    const key = { releaseId: release.id, siteId: 'a' };
    expect(await setShop(db, key, ['waiting'], { status: 'before' })).toBe(true);
    expect(await setShop(db, key, ['waiting'], { status: 'building' })).toBe(false);
    expect(
      await setShop(db, key, ['before'], { status: 'building', buildBefore: 7, passportBefore: { errors: [] } }),
    ).toBe(true);
    expect(await activeShopOf(db, 'a', ['building'])).toMatchObject({ buildBefore: 7, passportBefore: { errors: [] } });
    expect(await setRelease(db, release.id, ['waves'], { status: 'finished' })).toBe(false);
  });

  it('выпущенная версия — последний finished; «нулевой» выпуск — один раз', async () => {
    expect(await releasedVersion(db, 'nova', 'dev')).toBeNull();
    expect(await bootstrapRelease(db, 'nova', { version: '0.1.2', contentHash: THEME.toHash }, 'dev')).toBe(true);
    expect(await bootstrapRelease(db, 'nova', { version: '0.1.3', contentHash: THEME.toHash }, 'dev')).toBe(false);
    expect(await releasedVersion(db, 'nova', 'dev')).toBe('0.1.2');
    const release = await createRelease(db, THEME, () => []);
    await setRelease(db, release.id, ['testing'], { status: 'finished' });
    expect(await releasedVersion(db, 'nova', 'dev')).toBe('0.2.0');
  });

  it('переключение версии — строка в site_theme_migrations', async () => {
    const shop = await insertSite(db);
    await recordThemeSwitch(db, {
      siteId: shop.id,
      themeId: 'nova',
      from: '0.1.2',
      to: '0.2.0',
      report: { release: 1 },
    });
    const { rows } = await db.query(
      'SELECT from_version, to_version, report FROM site_theme_migrations WHERE site_id = $1',
      [shop.id],
    );
    expect(rows).toEqual([{ from_version: '0.1.2', to_version: '0.2.0', report: { release: 1 } }]);
  });
});
