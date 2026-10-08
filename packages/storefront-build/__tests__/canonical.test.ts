import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../theme-contract/conformance/inventory-artifact';
import { canonicalJson, hashOf, hashSchema, sha256 } from '../src/canonical';

// Значения для сверки с оригиналом: вложенные объекты, массивы с объектами, null, undefined, кириллица, числа.
const SAMPLES: unknown[] = [
  { b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } },
  [{ id: 'b' }, { id: 'a' }, null, 'текст'],
  { name: 'Стенд Nova', price: 2300, empty: {}, list: [], skip: undefined },
  'строка',
  42,
  null,
];

describe('canonicalJson', () => {
  it('ключи объектов — по алфавиту на любой глубине', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('порядок массива сохраняется, объекты внутри — с ключами по алфавиту', () => {
    expect(canonicalJson([3, { z: 1, y: 2 }, 1])).toBe('[3,{"y":2,"z":1},1]');
  });

  it('поля undefined выбрасываются, null остаётся', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it.each(SAMPLES.map((sample) => [sample]))('совпадает с canonicalStringify инвентаря: %j', (sample) => {
    expect(canonicalJson(sample)).toBe(canonicalStringify(sample));
  });
});

describe('sha256 и hashOf', () => {
  it('формат sha256:<64 знака hex>, известные значения', () => {
    expect(sha256('')).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('байты и та же строка дают один хэш', () => {
    expect(sha256(Buffer.from('Стенд Nova', 'utf8'))).toBe(sha256('Стенд Nova'));
  });

  it('порядок ключей на хэш не влияет, значение — влияет', () => {
    expect(hashOf({ a: 1, b: [1, 2] })).toBe(hashOf({ b: [1, 2], a: 1 }));
    expect(hashOf({ a: 1, b: [1, 2] })).not.toBe(hashOf({ a: 1, b: [2, 1] }));
  });
});

describe('hashSchema', () => {
  it('принимает хэш из sha256', () => {
    expect(hashSchema.safeParse(sha256('abc')).success).toBe(true);
  });

  it.each(['sha256:abc', `sha256:${'A'.repeat(64)}`, `md5:${'a'.repeat(64)}`])('отклоняет «%s»', (value) => {
    expect(hashSchema.safeParse(value).success).toBe(false);
  });
});
