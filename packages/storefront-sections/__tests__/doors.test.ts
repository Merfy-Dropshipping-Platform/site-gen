import { describe, expect, it } from 'vitest';
import { SHOP_PREFIX, doorFields, doorSchema } from '../src/doors';

const SHOP = '00000000-0000-4000-8000-0000000000aa';

describe('способы сохранения секций', () => {
  it('своя секция магазина — префикс shop, владелец — магазин, без выпуска', () => {
    expect(doorFields(doorSchema.parse({ author: 'shop', shopId: SHOP }))).toEqual({
      author: 'shop',
      prefix: SHOP_PREFIX,
      owner: SHOP,
      release: null,
    });
    expect(SHOP_PREFIX).toBe('shop');
  });

  it('расширение — префикс и владелец — id расширения, выпуск — его версия', () => {
    expect(doorFields(doorSchema.parse({ author: 'extension', extension: 'loyalty', release: '1.0.0' }))).toEqual({
      author: 'extension',
      prefix: 'loyalty',
      owner: 'loyalty',
      release: '1.0.0',
    });
  });

  it('способа сохранения для платформы и темы нет', () => {
    expect(doorSchema.safeParse({ author: 'platform', release: '0.2.0' }).success).toBe(false);
    expect(doorSchema.safeParse({ author: 'theme', theme: 'nova', release: '0.3.1' }).success).toBe(false);
  });

  it('расширение не назовётся merfy, shop или platform', () => {
    for (const extension of ['merfy', 'shop', 'platform'])
      expect(doorSchema.safeParse({ author: 'extension', extension, release: '1.0.0' }).success).toBe(false);
  });

  it('выпуск расширения — только semver', () => {
    expect(doorSchema.safeParse({ author: 'extension', extension: 'loyalty', release: '1.0' }).success).toBe(false);
  });
});
