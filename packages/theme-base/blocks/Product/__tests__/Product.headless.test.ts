import { normaliseProduct, emptyProductView } from '../Product.headless';
import type { RawProduct } from '../Product.types';

/**
 * The live storefront cart needs each variant *combination* (with its id) to
 * resolve a {Цвет, Размер} selection → variantCombinationId. normaliseProduct
 * must expose that combination array on the view so Product.astro can serialise
 * it into the page (it is the only build-time source of the ids on a live SSG
 * page — window.__MERFY_PRODUCTS__ is never populated).
 */
describe('normaliseProduct — variant combinations for cart', () => {
  const rawWithVariants: RawProduct = {
    id: 'p1',
    slug: 'tshirt',
    name: 'T-Shirt',
    price: 0,
    hasVariants: true,
    variants: [
      { id: 'c-white-s', title: 'Белый / S', price: '2 500 ₽', available: true, options: { Цвет: 'Белый', Размер: 'S' } },
      { id: 'c-black-m', title: 'Чёрный / M', price: '2 700 ₽', available: true, options: { Цвет: 'Чёрный', Размер: 'M' } },
    ],
  };

  it('exposes the variant combinations with their ids on the view', () => {
    const view = normaliseProduct(rawWithVariants);
    expect(view.variants).toHaveLength(2);
    expect(view.variants.map((v) => v.id)).toEqual(['c-white-s', 'c-black-m']);
    expect(view.variants[0].options).toEqual({ Цвет: 'Белый', Размер: 'S' });
  });

  it('falls back to variantCombinations (preview path) when variants is empty', () => {
    const raw: RawProduct = { ...rawWithVariants, variants: [], variantCombinations: rawWithVariants.variants };
    const view = normaliseProduct(raw);
    expect(view.variants.map((v) => v.id)).toEqual(['c-white-s', 'c-black-m']);
  });

  it('is an empty array for a product without variants', () => {
    const view = normaliseProduct({ id: 'p2', name: 'Mug', price: 500 });
    expect(view.variants).toEqual([]);
  });

  it('emptyProductView exposes empty variants', () => {
    expect(emptyProductView().variants).toEqual([]);
  });
});
