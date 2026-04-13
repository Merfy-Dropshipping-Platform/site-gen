/**
 * Tests for product-related React components.
 *
 * These test the React "editor" versions of the dual-render components.
 * The Astro versions share the same visual contract but are tested via
 * integration/build validation rather than unit tests.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Components under test
import { ProductCard, formatMoney } from '../react/ProductCard';
import { ProductGrid } from '../react/ProductGrid';
import { FeaturedCollection } from '../react/FeaturedCollection';
import { CollectionList } from '../react/CollectionList';
import { ProductDetail } from '../react/ProductDetail';

// Types
import type { Product, Collection } from '../../../../../../packages/storefront/types';

// ----- Test fixtures -----

const mockProduct: Product = {
  id: 'prod-1',
  handle: 'test-product',
  title: 'Test Product',
  description: 'A great product for testing',
  price: 599000, // 5990.00 RUB in kopecks
  compareAtPrice: 799000, // 7990.00 RUB
  images: [
    { url: '/images/product-1.jpg', alt: 'Product front' },
    { url: '/images/product-2.jpg', alt: 'Product back' },
  ],
  variants: [
    {
      id: 'var-1',
      title: 'S',
      price: 599000,
      available: true,
      options: { size: 'S' },
    },
    {
      id: 'var-2',
      title: 'M',
      price: 599000,
      available: true,
      options: { size: 'M' },
    },
    {
      id: 'var-3',
      title: 'L',
      price: 599000,
      available: false,
      options: { size: 'L' },
    },
  ],
  tags: ['new', 'sale'],
  vendor: 'Test Vendor',
};

const mockProductNoOldPrice: Product = {
  ...mockProduct,
  id: 'prod-2',
  handle: 'no-old-price',
  title: 'No Old Price Product',
  compareAtPrice: undefined,
};

const mockProductNoImages: Product = {
  ...mockProduct,
  id: 'prod-3',
  handle: 'no-images',
  title: 'No Images Product',
  images: [],
};

const mockProducts: Product[] = [
  mockProduct,
  { ...mockProduct, id: 'prod-4', handle: 'product-4', title: 'Product Four' },
  { ...mockProduct, id: 'prod-5', handle: 'product-5', title: 'Product Five' },
  { ...mockProduct, id: 'prod-6', handle: 'product-6', title: 'Product Six' },
];

const mockCollection: Collection = {
  id: 'col-1',
  handle: 'summer-collection',
  title: 'Summer Collection',
  description: 'Hot items for summer',
  image: { url: '/images/collection-summer.jpg', alt: 'Summer' },
  productCount: 24,
};

const mockCollections: Collection[] = [
  mockCollection,
  {
    id: 'col-2',
    handle: 'winter-collection',
    title: 'Winter Collection',
    description: 'Warm clothes',
    image: { url: '/images/collection-winter.jpg', alt: 'Winter' },
    productCount: 18,
  },
  {
    id: 'col-3',
    handle: 'accessories',
    title: 'Accessories',
    image: { url: '/images/collection-accessories.jpg', alt: 'Accessories' },
    productCount: 42,
  },
];

// ----- Mock hooks -----

const mockAddItem = vi.fn();
const mockUseCart = vi.fn(() => ({
  items: [],
  count: 0,
  total: 0,
  addItem: mockAddItem,
  removeItem: vi.fn(),
  updateQuantity: vi.fn(),
  clear: vi.fn(),
  syncToServer: vi.fn(),
}));

const mockUseProducts = vi.fn(() => ({
  data: mockProducts,
  total: mockProducts.length,
  isLoading: false,
  isError: false,
  error: null,
  filters: {},
  setFilter: vi.fn(),
  clearFilters: vi.fn(),
  page: 1,
  setPage: vi.fn(),
  hasNextPage: false,
}));

vi.mock('../../../../../../packages/storefront/hooks/useCart', () => ({
  useCart: () => mockUseCart(),
}));

vi.mock('../../../../../../packages/storefront/hooks/useProducts', () => ({
  useProducts: (opts: any) => mockUseProducts(opts),
}));

// ----- formatMoney tests -----

describe('formatMoney', () => {
  it('formats kopecks to rubles correctly', () => {
    const result = formatMoney(599000);
    // Should contain "5" and "990" somewhere (locale formatting may vary)
    expect(result).toContain('5');
    expect(result).toContain('990');
  });

  it('formats zero kopecks', () => {
    const result = formatMoney(0);
    expect(result).toContain('0');
  });

  it('formats small amounts', () => {
    const result = formatMoney(100); // 1 ruble
    expect(result).toContain('1');
  });

  it('accepts custom currency', () => {
    const result = formatMoney(100000, 'USD');
    expect(result).toContain('1');
    // Should not contain ruble sign
    expect(result).not.toContain('\u20BD');
  });
});

// ----- ProductCard tests -----

describe('ProductCard', () => {
  it('renders product title', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('Test Product')).toBeTruthy();
  });

  it('renders formatted price', () => {
    render(<ProductCard product={mockProduct} />);
    // Price 599000 kopecks = 5 990 RUB
    const priceElements = screen.getAllByText(/5.*990/);
    expect(priceElements.length).toBeGreaterThan(0);
  });

  it('renders old price with strikethrough when compareAtPrice exists', () => {
    const { container } = render(<ProductCard product={mockProduct} />);
    // Should have a line-through element for old price
    const strikethroughEl = container.querySelector('.line-through');
    expect(strikethroughEl).toBeTruthy();
  });

  it('does not render old price when compareAtPrice is undefined', () => {
    const { container } = render(<ProductCard product={mockProductNoOldPrice} />);
    const strikethroughEl = container.querySelector('.line-through');
    expect(strikethroughEl).toBeFalsy();
  });

  it('renders product image when available', () => {
    render(<ProductCard product={mockProduct} />);
    const img = screen.getByAltText('Product front');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/images/product-1.jpg');
  });

  it('renders placeholder when no images', () => {
    const { container } = render(<ProductCard product={mockProductNoImages} />);
    // Should show placeholder SVG instead of img
    const img = container.querySelector('img');
    expect(img).toBeFalsy();
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('wraps card in an anchor link to product page', () => {
    const { container } = render(<ProductCard product={mockProduct} />);
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/product/test-product');
  });

  it('has hover effect classes', () => {
    const { container } = render(<ProductCard product={mockProduct} />);
    // The outer card or image should have group-hover classes
    const groupEl = container.querySelector('.group');
    expect(groupEl).toBeTruthy();
  });
});

// ----- ProductGrid tests -----

describe('ProductGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProducts.mockReturnValue({
      data: mockProducts,
      total: mockProducts.length,
      isLoading: false,
      isError: false,
      error: null,
      filters: {},
      setFilter: vi.fn(),
      clearFilters: vi.fn(),
      page: 1,
      setPage: vi.fn(),
      hasNextPage: false,
    });
  });

  it('renders a grid of product cards', () => {
    render(<ProductGrid />);
    expect(screen.getByText('Test Product')).toBeTruthy();
    expect(screen.getByText('Product Four')).toBeTruthy();
    expect(screen.getByText('Product Five')).toBeTruthy();
    expect(screen.getByText('Product Six')).toBeTruthy();
  });

  it('calls useProducts with collectionId when provided', () => {
    render(<ProductGrid collectionId="col-summer" />);
    expect(mockUseProducts).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: 'col-summer' }),
    );
  });

  it('shows loading state', () => {
    mockUseProducts.mockReturnValue({
      data: [],
      total: 0,
      isLoading: true,
      isError: false,
      error: null,
      filters: {},
      setFilter: vi.fn(),
      clearFilters: vi.fn(),
      page: 1,
      setPage: vi.fn(),
      hasNextPage: false,
    });
    const { container } = render(<ProductGrid />);
    // Should show skeleton/loading placeholders
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state', () => {
    mockUseProducts.mockReturnValue({
      data: [],
      total: 0,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      filters: {},
      setFilter: vi.fn(),
      clearFilters: vi.fn(),
      page: 1,
      setPage: vi.fn(),
      hasNextPage: false,
    });
    render(<ProductGrid />);
    expect(screen.getByText(/ошибк/i)).toBeTruthy();
  });

  it('shows empty state when no products', () => {
    mockUseProducts.mockReturnValue({
      data: [],
      total: 0,
      isLoading: false,
      isError: false,
      error: null,
      filters: {},
      setFilter: vi.fn(),
      clearFilters: vi.fn(),
      page: 1,
      setPage: vi.fn(),
      hasNextPage: false,
    });
    render(<ProductGrid />);
    expect(screen.getByText(/товар/i)).toBeTruthy();
  });

  it('renders with responsive grid classes', () => {
    const { container } = render(<ProductGrid />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
  });

  it('passes columns prop to grid style', () => {
    const { container } = render(<ProductGrid columns={3} />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
  });
});

// ----- FeaturedCollection tests -----

describe('FeaturedCollection', () => {
  it('renders collection title', () => {
    render(
      <FeaturedCollection
        collection={mockCollection}
        products={mockProducts.slice(0, 3)}
      />,
    );
    expect(screen.getByText('Summer Collection')).toBeTruthy();
  });

  it('renders products in the collection', () => {
    render(
      <FeaturedCollection
        collection={mockCollection}
        products={mockProducts.slice(0, 3)}
      />,
    );
    expect(screen.getByText('Test Product')).toBeTruthy();
    expect(screen.getByText('Product Four')).toBeTruthy();
    expect(screen.getByText('Product Five')).toBeTruthy();
  });

  it('renders collection description when provided', () => {
    render(
      <FeaturedCollection
        collection={mockCollection}
        products={mockProducts.slice(0, 2)}
      />,
    );
    expect(screen.getByText('Hot items for summer')).toBeTruthy();
  });

  it('renders empty state when no products', () => {
    render(
      <FeaturedCollection collection={mockCollection} products={[]} />,
    );
    expect(screen.getByText(/товар/i)).toBeTruthy();
  });
});

// ----- CollectionList tests -----

describe('CollectionList', () => {
  it('renders list of collections', () => {
    render(<CollectionList collections={mockCollections} />);
    expect(screen.getByText('Summer Collection')).toBeTruthy();
    expect(screen.getByText('Winter Collection')).toBeTruthy();
    expect(screen.getByText('Accessories')).toBeTruthy();
  });

  it('renders collection images', () => {
    render(<CollectionList collections={mockCollections} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBe(3);
  });

  it('renders title when provided', () => {
    render(
      <CollectionList collections={mockCollections} title="Our Collections" />,
    );
    expect(screen.getByText('Our Collections')).toBeTruthy();
  });

  it('handles empty collections array', () => {
    const { container } = render(<CollectionList collections={[]} />);
    expect(container.textContent).not.toContain('undefined');
  });

  it('uses responsive grid layout', () => {
    const { container } = render(<CollectionList collections={mockCollections} />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
  });
});

// ----- ProductDetail tests -----

describe('ProductDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders product title', () => {
    render(<ProductDetail product={mockProduct} />);
    expect(screen.getByText('Test Product')).toBeTruthy();
  });

  it('renders product description', () => {
    render(<ProductDetail product={mockProduct} />);
    expect(screen.getByText('A great product for testing')).toBeTruthy();
  });

  it('renders formatted price', () => {
    render(<ProductDetail product={mockProduct} />);
    const priceElements = screen.getAllByText(/5.*990/);
    expect(priceElements.length).toBeGreaterThan(0);
  });

  it('renders old price with strikethrough', () => {
    const { container } = render(<ProductDetail product={mockProduct} />);
    const strikethrough = container.querySelector('.line-through');
    expect(strikethrough).toBeTruthy();
  });

  it('renders main product image', () => {
    render(<ProductDetail product={mockProduct} />);
    // Main image + thumbnail both have same alt, use getAllByAltText
    const imgs = screen.getAllByAltText('Product front');
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    expect(imgs[0].getAttribute('src')).toBe('/images/product-1.jpg');
  });

  it('renders image thumbnails gallery', () => {
    render(<ProductDetail product={mockProduct} />);
    const images = screen.getAllByRole('img');
    // Main image + 2 thumbnails
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it('renders variant selector buttons', () => {
    render(<ProductDetail product={mockProduct} />);
    expect(screen.getByText('S')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
  });

  it('marks unavailable variants as disabled', () => {
    render(<ProductDetail product={mockProduct} />);
    const lButton = screen.getByText('L');
    // L variant is unavailable, button should be disabled or styled differently
    expect(
      lButton.closest('button')?.disabled ||
        lButton.closest('button')?.classList.contains('opacity-50'),
    ).toBeTruthy();
  });

  it('renders quantity controls with +/- buttons', () => {
    render(<ProductDetail product={mockProduct} />);
    const minusBtn = screen.getByText('-');
    const plusBtn = screen.getByText('+');
    expect(minusBtn).toBeTruthy();
    expect(plusBtn).toBeTruthy();
  });

  it('increments quantity on + click', () => {
    render(<ProductDetail product={mockProduct} />);
    const plusBtn = screen.getByText('+');
    const quantityDisplay = screen.getByText('1');
    expect(quantityDisplay).toBeTruthy();

    fireEvent.click(plusBtn);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('does not decrement below 1', () => {
    render(<ProductDetail product={mockProduct} />);
    const minusBtn = screen.getByText('-');
    fireEvent.click(minusBtn);
    // Should still show 1
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders Add to Cart button', () => {
    render(<ProductDetail product={mockProduct} />);
    expect(screen.getByText(/корзин/i)).toBeTruthy();
  });

  it('renders Buy Now button', () => {
    render(<ProductDetail product={mockProduct} />);
    expect(screen.getByText(/купить/i)).toBeTruthy();
  });

  it('calls addItem on Add to Cart click', () => {
    render(<ProductDetail product={mockProduct} />);
    const addBtn = screen.getByText(/корзин/i);
    fireEvent.click(addBtn);
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: expect.any(String),
        title: expect.any(String),
        price: expect.any(Number),
      }),
    );
  });

  it('switches main image when thumbnail is clicked', () => {
    render(<ProductDetail product={mockProduct} />);
    const thumbnails = screen.getAllByRole('img');
    // Click the second thumbnail (index depends on rendering, but find one with alt "Product back")
    const secondThumb = screen.getByAltText('Product back');
    fireEvent.click(secondThumb);
    // Main image should now show the clicked image
    const mainImage = screen.getAllByRole('img')[0];
    expect(mainImage.getAttribute('src')).toBe('/images/product-2.jpg');
  });
});
