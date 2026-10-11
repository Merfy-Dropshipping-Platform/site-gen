import { describe, expect, it } from 'vitest';
import { doorFields, doorSchema } from '../src/doors';

const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';

describe('двери приёма', () => {
  it.each([
    [
      { author: 'platform', release: '0.1.0' },
      { author: 'platform', prefix: 'platform', owner: 'platform', release: '0.1.0' },
    ],
    [
      { author: 'theme', theme: 'nova', release: '0.0.4' },
      { author: 'theme', prefix: 'nova', owner: 'nova', release: '0.0.4' },
    ],
    [
      { author: 'shop', shopId: SHOP },
      { author: 'shop', prefix: 'shop', owner: SHOP, release: null },
    ],
    [
      { author: 'extension', extension: 'reviews', release: '1.4.0' },
      { author: 'extension', prefix: 'reviews', owner: 'reviews', release: '1.4.0' },
    ],
  ])('дверь %o — приставка, владелец, выпуск', (door, fields) => {
    expect(doorFields(doorSchema.parse(door))).toEqual(fields);
  });

  it.each([
    ['тема назвалась platform', { author: 'theme', theme: 'platform', release: '1.0.0' }],
    ['расширение назвалось shop', { author: 'extension', extension: 'shop', release: '1.0.0' }],
    ['id с двойным дефисом', { author: 'extension', extension: 're--views', release: '1.0.0' }],
    ['магазин не uuid', { author: 'shop', shopId: 'shop-1' }],
    ['выпуск не semver', { author: 'theme', theme: 'nova', release: 'latest' }],
    ['у своей секции выпуска нет', { author: 'shop', shopId: SHOP, release: '1.0.0' }],
  ])('дверь не пускает: %s', (_, door) => {
    expect(doorSchema.safeParse(door).success).toBe(false);
  });
});
