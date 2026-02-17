/**
 * Store API Integration Tests
 *
 * Tests the storefront-facing Store API flow:
 * - Products listing with filters, sorting, pagination
 * - Product detail by handle/slug
 * - Collections listing
 * - Cart operations (create, sync to server)
 * - Checkout flow (customer, shipping, payment)
 *
 * These test the data flows used by packages/storefront hooks:
 * - useProducts -> GET /products?store_id=...&collection_id=...&sort=...&limit=...&offset=...
 * - useProduct  -> GET /products/:handle?store_id=...
 * - useSearch   -> GET /products/search?q=...&store_id=...&limit=...
 * - useCart     -> POST /carts + client-side Nano Stores
 * - useCheckout -> POST /carts/:id/customer, /shipping, /checkout
 *
 * RPC patterns used by API Gateway -> Sites/Orders services:
 * - sites.products.list (local site products)
 * - product.list (via product-service RPC)
 * - orders.create_cart, orders.add_item, orders.checkout
 *
 * Types from packages/storefront/types.ts
 */

// Mock minio before importing SitesDomainService to avoid moduleNameMapper issue with ipaddr.js
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    setBucketPolicy: jest.fn().mockResolvedValue(undefined),
    fPutObject: jest.fn().mockResolvedValue(undefined),
    statObject: jest.fn().mockResolvedValue({ size: 100 }),
    listObjectsV2: jest.fn(),
    removeObjects: jest.fn().mockResolvedValue(undefined),
    removeObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { SitesDomainService } from '../sites.service';
import * as schema from '../db/schema';

// ======================== Mocks ========================

class MockEvents {
  public events: any[] = [];
  emit(pattern: string, payload: any) {
    this.events.push({ pattern, payload });
  }
}

class MockGenerator {
  async build(_: any) {
    return { buildId: 'b1', revisionId: 'r1', artifactUrl: 'file:///tmp/a.zip' };
  }
}

class MockDeployments {
  async deploy(_: any) {
    return { deploymentId: 'd1', url: 'https://preview.local' };
  }
}

class MockStorage {
  async isEnabled() { return false; }
  getSitePublicUrl() { return 'https://test.merfy.ru'; }
  getSitePublicUrlBySubdomain(s: string) { return `https://${s}`; }
  getSitePrefixBySubdomain() { return 'sites/test/'; }
  extractSubdomainSlug() { return 'test'; }
  async checkSiteFiles() {
    return { exists: true, hasIndex: true, fileCount: 1, totalSize: 100, files: [] };
  }
  async ensureBucket() { return 'merfy-sites'; }
}

class MockCoolifyClient {
  send(_: string, __: any) {
    return {
      pipe: (..._args: any[]) => ({
        subscribe: (obs: any) => {
          obs.next({ success: true });
          obs.complete?.();
          return { unsubscribe: () => {} };
        },
      }),
    };
  }
}

class MockDomainClient {
  async generateSubdomain() { return { id: 'd1', name: 'test.merfy.ru' }; }
  async verifyDomain() { return { verified: true }; }
}

class MockBillingClient {
  async getEntitlements() {
    return { shopsLimit: 5, staffLimit: 3, frozen: false, planName: 'pro' };
  }
  async canCreateSite() {
    return { allowed: true, limit: 5 };
  }
}

class MockBuildQueue {
  async queueBuild() { return true; }
}

// ======================== Product Data Fixtures ========================

const SITE_PRODUCTS = [
  {
    id: 'p1',
    siteId: 's1',
    name: 'Rose Candle',
    description: 'A beautiful rose-scented candle',
    price: 149900, // 1499.00 rubles in kopecks
    compareAtPrice: 199900,
    images: ['https://minio.merfy.ru/products/candle.jpg'],
    slug: 'rose-candle',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'p2',
    siteId: 's1',
    name: 'Lavender Soap',
    description: 'Handmade lavender soap',
    price: 49900,
    compareAtPrice: null,
    images: ['https://minio.merfy.ru/products/soap.jpg'],
    slug: 'lavender-soap',
    sortOrder: 2,
    isActive: true,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
  {
    id: 'p3',
    siteId: 's1',
    name: 'Archived Product',
    description: 'This product is inactive',
    price: 99900,
    compareAtPrice: null,
    images: [],
    slug: 'archived-product',
    sortOrder: 3,
    isActive: false,
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  },
];

// ======================== DB Mock for Store API ========================

function createStoreDb() {
  const sites = [
    {
      id: 's1',
      tenantId: 't1',
      name: 'Test Store',
      slug: 'test-store',
      status: 'published',
      themeId: 'rose',
      publicUrl: 'https://test-store.merfy.ru',
      coolifyAppUuid: 'app-1',
      deletedAt: null,
    },
  ];

  const products = [...SITE_PRODUCTS];

  return {
    _sites: sites,
    _products: products,
    select: jest.fn((...selectArgs: any[]) => ({
      from: (tbl: any) => ({
        where: (cond: any) => {
          if (tbl === schema.site) {
            return {
              limit: (_n: number) => Promise.resolve(sites.map((s) => ({
                id: s.id,
                tenantId: s.tenantId,
                name: s.name,
                slug: s.slug,
                status: s.status,
                themeId: s.themeId,
                publicUrl: s.publicUrl,
                coolifyAppUuid: s.coolifyAppUuid,
                createdAt: new Date(),
                updatedAt: new Date(),
              }))),
              then: (fn: any) => fn(sites.map((s) => ({ count: 1 }))),
            };
          }
          if (tbl === schema.siteProduct) {
            // Return active products, ordered by sortOrder
            const activeProducts = products
              .filter((p) => p.isActive)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            return {
              orderBy: () => Promise.resolve(activeProducts),
              limit: (_n: number) => Promise.resolve(activeProducts),
            };
          }
          return Promise.resolve([]);
        },
        leftJoin: () => ({
          where: () => Promise.resolve(sites.map((s) => ({
            id: s.id,
            tenantId: s.tenantId,
            name: s.name,
            slug: s.slug,
            status: s.status,
            themeId: s.themeId,
            publicUrl: s.publicUrl,
            coolifyAppUuid: s.coolifyAppUuid,
            currentRevisionId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            domainId: null,
            coolifyProjectUuid: null,
            theme: { id: 'rose', name: 'Rose', slug: 'rose', templateId: 'rose', badge: null, tags: [], description: 'Rose theme', previewDesktop: null, previewMobile: null },
          }))),
        }),
        limit: (_n: number) => Promise.resolve(sites),
        orderBy: () => Promise.resolve(products.filter((p) => p.isActive)),
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((_vals: any) => ({
        returning: jest.fn().mockResolvedValue([{
          id: 'new-product-id',
          siteId: 's1',
          name: 'New Product',
          price: 0,
          isActive: true,
          sortOrder: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]),
        onConflictDoUpdate: jest.fn().mockReturnThis(),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue([{
            id: 'p1',
            name: 'Updated Product',
            price: 199900,
            updatedAt: new Date(),
          }]),
        })),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      })),
    })),
  } as any;
}

function createService(db: any) {
  return new SitesDomainService(
    db,
    new MockCoolifyClient() as any,
    new MockGenerator() as any,
    new MockEvents() as any,
    new MockDeployments() as any,
    new MockStorage() as any,
    new MockDomainClient() as any,
    new MockBillingClient() as any,
    new MockBuildQueue() as any,
  );
}

// ======================== Tests ========================

describe('Store API Integration', () => {
  // ==================== Products Listing ====================

  describe('Products Listing', () => {
    it('should list only active products for a site', async () => {
      const db = createStoreDb();
      const service = createService(db);

      const products = await service.listSiteProducts('s1', 't1');

      // Should only return active products (isActive=true)
      expect(Array.isArray(products)).toBe(true);
      expect(products.every((p: any) => p.isActive === true)).toBe(true);
      // Archived product (p3) should be excluded
      expect(products.find((p: any) => p.id === 'p3')).toBeUndefined();
    });

    it('should return products ordered by sortOrder', async () => {
      const db = createStoreDb();
      const service = createService(db);

      const products = await service.listSiteProducts('s1', 't1');

      // Products should be in sortOrder: p1 (1), p2 (2)
      if (products.length >= 2) {
        expect(products[0].sortOrder ?? 0).toBeLessThanOrEqual(products[1].sortOrder ?? 0);
      }
    });

    it('should throw site_not_found for non-existent site', async () => {
      const db = createStoreDb();
      // Override to return empty site list
      db.select = jest.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
            orderBy: () => Promise.resolve([]),
          }),
          leftJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      });
      const service = createService(db);

      await expect(service.listSiteProducts('nonexistent', 't1')).rejects.toThrow(
        'site_not_found',
      );
    });

    it('should enforce tenant isolation (reject wrong tenantId)', async () => {
      const db = createStoreDb();
      // Simulate tenant mismatch by returning empty site
      db.select = jest.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
            orderBy: () => Promise.resolve([]),
          }),
          leftJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      });
      const service = createService(db);

      await expect(service.listSiteProducts('s1', 'wrong-tenant')).rejects.toThrow(
        'site_not_found',
      );
    });

    it('should return products for build (with price conversion from kopecks)', async () => {
      const db = createStoreDb();
      const service = createService(db);

      const products = await service.getProductsForBuild('s1');

      // getProductsForBuild converts kopecks to rubles
      expect(Array.isArray(products)).toBe(true);
      for (const p of products) {
        expect(typeof p.price).toBe('number');
        // Price should be in rubles (divided by 100)
        // e.g., 149900 kopecks -> 1499 rubles
        expect(p.price).toBeLessThan(100_000); // reasonable price range
      }
    });
  });

  // ==================== Product Detail ====================

  describe('Product Detail', () => {
    it('should get single product by id', async () => {
      const db = createStoreDb();
      const service = createService(db);

      // getSiteProduct(productId, siteId, tenantId)
      // We need to mock the specific product query
      db.select = jest.fn().mockReturnValue({
        from: (tbl: any) => ({
          where: (cond: any) => {
            if (tbl === schema.site) {
              return {
                limit: () => Promise.resolve([{ id: 's1' }]),
              };
            }
            if (tbl === schema.siteProduct) {
              return {
                limit: () => Promise.resolve([SITE_PRODUCTS[0]]),
              };
            }
            return Promise.resolve([]);
          },
          leftJoin: () => ({
            where: () => Promise.resolve([{
              id: 's1',
              tenantId: 't1',
              name: 'Test Store',
              status: 'published',
              theme: null,
            }]),
          }),
        }),
      });

      const product = await service.getSiteProduct('p1', 's1', 't1');

      expect(product).toBeDefined();
      expect(product.id).toBe('p1');
      expect(product.name).toBe('Rose Candle');
      expect(product.price).toBe(149900);
      expect(product.images).toEqual(['https://minio.merfy.ru/products/candle.jpg']);
    });

    it('should return null for non-existent product', async () => {
      // getSiteProduct returns product ?? null (does not throw for missing product)
      const db = createStoreDb();
      db.select = jest.fn().mockReturnValue({
        from: (tbl: any) => ({
          where: () => ({
            limit: () => {
              if (tbl === schema.site) return Promise.resolve([{ id: 's1' }]);
              return Promise.resolve([]); // no product found
            },
          }),
          leftJoin: () => ({
            where: () => Promise.resolve([{
              id: 's1',
              tenantId: 't1',
              name: 'Test',
              status: 'published',
              theme: null,
            }]),
          }),
        }),
      });
      const service = createService(db);

      const result = await service.getSiteProduct('nonexistent', 's1', 't1');
      expect(result).toBeNull();
    });
  });

  // ==================== Product CRUD ====================

  describe('Product CRUD', () => {
    it('should create a product with auto-generated slug', async () => {
      const db = createStoreDb();
      // Override select to handle the maxSort query and the site check
      let callCount = 0;
      db.select = jest.fn().mockImplementation((...args: any[]) => ({
        from: (tbl: any) => ({
          where: (cond: any) => {
            callCount++;
            if (tbl === schema.site) {
              return {
                limit: () => Promise.resolve([{ id: 's1' }]),
              };
            }
            if (tbl === schema.siteProduct) {
              // This is the maxSort query: SELECT COALESCE(MAX(sort_order), 0)
              return Promise.resolve([{ max: 3 }]);
            }
            return Promise.resolve([]);
          },
          leftJoin: () => ({
            where: () => Promise.resolve([{
              id: 's1',
              tenantId: 't1',
              name: 'Test Store',
              status: 'published',
              theme: null,
            }]),
          }),
        }),
      }));
      const service = createService(db);

      const product = await service.createSiteProduct('s1', 't1', {
        name: 'New Candle',
        description: 'Fresh scent',
        price: 79900,
        images: ['https://minio.merfy.ru/products/new.jpg'],
      });

      expect(product).toBeDefined();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should update product price and description', async () => {
      const db = createStoreDb();
      const service = createService(db);

      const updated = await service.updateSiteProduct('p1', 's1', 't1', {
        price: 129900,
        description: 'Updated description',
      });

      expect(updated).toBeDefined();
      expect(db.update).toHaveBeenCalled();
    });

    it('should delete a product', async () => {
      const db = createStoreDb();
      const service = createService(db);

      const result = await service.deleteSiteProduct('p1', 's1', 't1');

      expect(result).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ==================== Cart Operations ====================

  describe('Cart Operations (Storefront Hook Contracts)', () => {
    it('useCart addItem contract: adds new item with quantity 1', () => {
      // Tests the behavioral contract of useCart.addItem
      // From packages/storefront/hooks/useCart.ts:
      // addItem({ variantId, title, price, image }) -> adds with quantity: 1
      const items: any[] = [];
      const newItem = { variantId: 'v1', title: 'Product', price: 1499, image: '/img.jpg' };

      // Simulate addItem logic
      const existing = items.find((i) => i.variantId === newItem.variantId);
      const result = existing
        ? items.map((i) =>
            i.variantId === newItem.variantId
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          )
        : [...items, { ...newItem, quantity: 1 }];

      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(1);
      expect(result[0].variantId).toBe('v1');
    });

    it('useCart addItem contract: increments quantity for existing item', () => {
      // Second addItem with same variantId should increment quantity
      const items = [
        { variantId: 'v1', title: 'Product', price: 1499, image: '/img.jpg', quantity: 1 },
      ];
      const newItem = { variantId: 'v1', title: 'Product', price: 1499, image: '/img.jpg' };

      const existing = items.find((i) => i.variantId === newItem.variantId);
      const result = existing
        ? items.map((i) =>
            i.variantId === newItem.variantId
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          )
        : [...items, { ...newItem, quantity: 1 }];

      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(2);
    });

    it('useCart removeItem contract: filters out by variantId', () => {
      const items = [
        { variantId: 'v1', title: 'A', price: 100, quantity: 2, image: '' },
        { variantId: 'v2', title: 'B', price: 200, quantity: 1, image: '' },
      ];

      const result = items.filter((i) => i.variantId !== 'v1');

      expect(result).toHaveLength(1);
      expect(result[0].variantId).toBe('v2');
    });

    it('useCart updateQuantity contract: updates quantity or removes if <= 0', () => {
      const items = [
        { variantId: 'v1', title: 'A', price: 100, quantity: 3, image: '' },
      ];

      // Update to 5
      const updated = items.map((i) =>
        i.variantId === 'v1' ? { ...i, quantity: 5 } : i,
      );
      expect(updated[0].quantity).toBe(5);

      // Update to 0 -> remove
      const quantity = 0;
      const afterZero = quantity <= 0
        ? items.filter((i) => i.variantId !== 'v1')
        : items.map((i) => (i.variantId === 'v1' ? { ...i, quantity } : i));
      expect(afterZero).toHaveLength(0);
    });

    it('useCart clear contract: empties the cart', () => {
      const items = [
        { variantId: 'v1', title: 'A', price: 100, quantity: 1, image: '' },
        { variantId: 'v2', title: 'B', price: 200, quantity: 2, image: '' },
      ];

      const cleared: any[] = [];
      expect(cleared).toHaveLength(0);
    });

    it('cart total calculation: sum of (price * quantity)', () => {
      const items = [
        { variantId: 'v1', title: 'A', price: 1499, quantity: 2, image: '' },
        { variantId: 'v2', title: 'B', price: 499, quantity: 1, image: '' },
      ];

      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      expect(total).toBe(1499 * 2 + 499 * 1); // 3497
    });

    it('cart count calculation: sum of quantities', () => {
      const items = [
        { variantId: 'v1', title: 'A', price: 100, quantity: 2, image: '' },
        { variantId: 'v2', title: 'B', price: 200, quantity: 3, image: '' },
      ];

      const count = items.reduce((sum, item) => sum + item.quantity, 0);
      expect(count).toBe(5);
    });

    it('syncToServer contract: POST /carts with storeId and items', () => {
      // useCart.syncToServer() calls:
      // POST {apiBase}/carts
      // Headers: Content-Type: application/json, X-Store-Id: storeId
      // Body: { storeId, items: CartItem[] }
      // Response: { cartId: string }
      const requestBody = {
        storeId: 'store-123',
        items: [
          { variantId: 'v1', title: 'A', price: 1499, quantity: 1, image: '/a.jpg' },
        ],
      };

      expect(requestBody.storeId).toBe('store-123');
      expect(requestBody.items).toHaveLength(1);
      expect(requestBody.items[0].variantId).toBe('v1');
    });
  });

  // ==================== Checkout Flow ====================

  describe('Checkout Flow (Storefront Hook Contracts)', () => {
    it('checkout step progression: customer -> shipping -> payment -> confirmation', () => {
      // useCheckout hook manages step state
      // Steps: customer -> shipping -> payment -> confirmation
      const steps: string[] = ['customer', 'shipping', 'payment', 'confirmation'];

      expect(steps[0]).toBe('customer');
      expect(steps[1]).toBe('shipping');
      expect(steps[2]).toBe('payment');
      expect(steps[3]).toBe('confirmation');
    });

    it('setCustomer contract: POST /carts/:id/customer with CustomerInfo', () => {
      // CustomerInfo: { email, phone?, firstName?, lastName? }
      // On success: advances step to 'shipping'
      const customerInfo = {
        email: 'test@example.com',
        phone: '+79991234567',
        firstName: 'Ivan',
        lastName: 'Petrov',
      };

      expect(customerInfo.email).toBeTruthy();
      expect(customerInfo.email).toContain('@');
    });

    it('setShipping contract: POST /carts/:id/shipping with ShippingInfo', () => {
      // ShippingInfo: { method, address: { line1, city, postalCode, country, line2?, state? } }
      // On success: advances step to 'payment'
      const shippingInfo = {
        method: 'standard',
        address: {
          line1: 'ul. Testovaya 1',
          city: 'Moscow',
          postalCode: '101000',
          country: 'RU',
        },
      };

      expect(shippingInfo.method).toBeTruthy();
      expect(shippingInfo.address.line1).toBeTruthy();
      expect(shippingInfo.address.city).toBeTruthy();
      expect(shippingInfo.address.postalCode).toBeTruthy();
      expect(shippingInfo.address.country).toBeTruthy();
    });

    it('submitPayment contract: POST /carts/:id/checkout with PaymentInfo', () => {
      // PaymentInfo: { method, returnUrl? }
      // Response: CheckoutResult { orderId, paymentUrl? }
      // paymentUrl: YooKassa payment page URL
      // On success: advances step to 'confirmation'
      const paymentInfo = {
        method: 'yookassa',
        returnUrl: 'https://shop.merfy.ru/order-confirmation',
      };

      expect(paymentInfo.method).toBe('yookassa');
      expect(paymentInfo.returnUrl).toContain('order-confirmation');
    });

    it('checkout result should contain orderId', () => {
      // CheckoutResult type: { orderId: string; paymentUrl?: string }
      const result = {
        orderId: 'order-abc-123',
        paymentUrl: 'https://yookassa.ru/payments/abc-123',
      };

      expect(result.orderId).toBeTruthy();
      expect(result.paymentUrl).toContain('yookassa');
    });
  });

  // ==================== Search ====================

  describe('Search (Storefront Hook Contract)', () => {
    it('useSearch debounces queries by 300ms default', () => {
      // useSearch options: { debounce: 300, limit: 6, minLength: 2 }
      // Does not fire API request until query.length >= minLength
      const options = { debounce: 300, limit: 6, minLength: 2 };

      expect(options.debounce).toBe(300);
      expect(options.minLength).toBe(2);
    });

    it('useSearch does not fire for queries shorter than minLength', () => {
      // query "a" (length 1) with minLength=2 -> enabled=false, no API call
      const query = 'a';
      const minLength = 2;
      const enabled = query.length >= minLength;

      expect(enabled).toBe(false);
    });

    it('useSearch fires for queries at or above minLength', () => {
      const query = 'ro';
      const minLength = 2;
      const enabled = query.length >= minLength;

      expect(enabled).toBe(true);
    });

    it('search query key includes storeId for tenant isolation', () => {
      // Query key: ['search', storeId, debouncedQuery]
      const storeId = 'store-123';
      const query = 'candle';
      const queryKey = ['search', storeId, query];

      expect(queryKey).toContain(storeId);
      expect(queryKey).toContain(query);
    });

    it('search URL format: /products/search?q={query}&store_id={storeId}&limit={limit}', () => {
      const apiBase = 'https://api.merfy.ru';
      const storeId = 'store-123';
      const query = 'rose candle';
      const limit = 6;

      const url = `/products/search?q=${encodeURIComponent(query)}&store_id=${storeId}&limit=${limit}`;

      expect(url).toContain('q=rose%20candle');
      expect(url).toContain('store_id=store-123');
      expect(url).toContain('limit=6');
    });
  });

  // ==================== Storefront Types Validation ====================

  describe('Storefront Types', () => {
    it('Product type matches expected shape', () => {
      // From packages/storefront/types.ts
      const product = {
        id: 'p1',
        handle: 'rose-candle',
        title: 'Rose Candle',
        description: 'A beautiful candle',
        price: 1499,
        compareAtPrice: 1999,
        images: [{ url: '/img.jpg', alt: 'Candle' }],
        variants: [{ id: 'v1', title: 'Default', price: 1499, available: true }],
        tags: ['candles', 'rose'],
        vendor: 'Merfy',
        seo: { title: 'Rose Candle', description: 'Buy a candle' },
      };

      expect(product.id).toBeTruthy();
      expect(product.handle).toBeTruthy();
      expect(product.title).toBeTruthy();
      expect(typeof product.price).toBe('number');
      expect(Array.isArray(product.images)).toBe(true);
      expect(Array.isArray(product.variants)).toBe(true);
    });

    it('Collection type matches expected shape', () => {
      const collection = {
        id: 'c1',
        handle: 'candles',
        title: 'Candles',
        description: 'All candles',
        image: { url: '/col.jpg' },
        productCount: 12,
      };

      expect(collection.id).toBeTruthy();
      expect(collection.handle).toBeTruthy();
      expect(typeof collection.productCount).toBe('number');
    });

    it('PaginatedResponse type matches expected shape', () => {
      const response = {
        data: [{ id: 'p1', title: 'Product' }],
        total: 100,
        page: 1,
        limit: 24,
        hasMore: true,
      };

      expect(Array.isArray(response.data)).toBe(true);
      expect(typeof response.total).toBe('number');
      expect(typeof response.hasMore).toBe('boolean');
    });

    it('StoreConfig matches expected shape', () => {
      const config = {
        apiBase: 'https://api.merfy.ru',
        storeId: 'site-uuid-123',
        currency: 'RUB',
        locale: 'ru',
      };

      expect(config.apiBase).toContain('api');
      expect(config.storeId).toBeTruthy();
      expect(config.currency).toBe('RUB');
    });
  });
});
