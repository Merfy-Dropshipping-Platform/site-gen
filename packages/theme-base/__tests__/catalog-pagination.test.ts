import { paginateProducts, getPageNumbers, totalPages } from '../blocks/Catalog/pagination';

describe('paginateProducts', () => {
  it('returns single page when products.length <= pageSize', () => {
    const products = [{ id: '1' }, { id: '2' }];
    expect(paginateProducts(products, 1, 4).length).toBe(2);
    expect(paginateProducts(products, 2, 4).length).toBe(0); // empty page
  });

  it('slices correctly for page 1, 2, 3 with pageSize=2', () => {
    const products = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }];
    expect(paginateProducts(products, 1, 2).map((p) => p.id)).toEqual(['1', '2']);
    expect(paginateProducts(products, 2, 2).map((p) => p.id)).toEqual(['3', '4']);
    expect(paginateProducts(products, 3, 2).map((p) => p.id)).toEqual(['5']);
  });

  it('clamps page to 1 if invalid', () => {
    const products = [{ id: '1' }];
    expect(paginateProducts(products, 0, 4).length).toBe(1);
    expect(paginateProducts(products, -5, 4).length).toBe(1);
  });
});

describe('totalPages', () => {
  it('computes ceiling division', () => {
    expect(totalPages(0, 4)).toBe(0);
    expect(totalPages(4, 4)).toBe(1);
    expect(totalPages(5, 4)).toBe(2);
    expect(totalPages(8, 4)).toBe(2);
    expect(totalPages(9, 4)).toBe(3);
  });
});

describe('getPageNumbers', () => {
  it('returns all pages when total <= 7', () => {
    expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('uses ellipsis with current at start', () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
    expect(getPageNumbers(2, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
  });

  it('uses ellipsis with current in middle', () => {
    expect(getPageNumbers(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  });

  it('uses ellipsis with current near end', () => {
    expect(getPageNumbers(9, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
    expect(getPageNumbers(10, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
  });
});
