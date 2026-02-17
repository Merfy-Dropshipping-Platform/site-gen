import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StoreConfig, Product, Collection, PaginatedResponse } from '../types';
import { mockProducts } from './mock-data/products';
import { mockCollections } from './mock-data/collections';

/**
 * Internal: Context that is reused from the main provider module.
 * We re-create it here to avoid circular dependency with the real provider.
 */
const StoreContext = React.createContext<StoreConfig>(null!);

export const useStoreConfig = (): StoreConfig => {
  const config = React.useContext(StoreContext);
  if (!config) {
    throw new Error('useStoreConfig must be used within a MockStoreProvider');
  }
  return config;
};

interface MockStoreProviderProps {
  config?: Partial<StoreConfig>;
  products?: Product[];
  collections?: Collection[];
  children: React.ReactNode;
}

/**
 * Mock handler: resolves fetch calls to mock data instead of real API.
 */
function createMockFetch(
  products: Product[],
  collections: Collection[],
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    // Search endpoint
    if (url.includes('/products/search') || (url.includes('/products') && url.includes('q='))) {
      const searchParams = new URL(url, 'http://localhost').searchParams;
      const query = (searchParams.get('q') || '').toLowerCase();
      const limit = parseInt(searchParams.get('limit') || '6', 10);
      const filtered = products.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          (p.description?.toLowerCase().includes(query) ?? false),
      );
      const result: PaginatedResponse<Product> = {
        data: filtered.slice(0, limit),
        total: filtered.length,
        page: 1,
        limit,
        hasMore: filtered.length > limit,
      };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Single product by handle
    const productMatch = url.match(/\/products\/([^/?]+)/);
    if (productMatch && !url.includes('availability')) {
      const handle = productMatch[1];
      const product = products.find((p) => p.handle === handle || p.id === handle);
      if (product) {
        return new Response(JSON.stringify(product), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    // Availability endpoint
    if (url.includes('availability')) {
      return new Response(
        JSON.stringify({ available: true, quantity: 10 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Products list
    if (url.includes('/products')) {
      const searchParams = new URL(url, 'http://localhost').searchParams;
      const collectionId = searchParams.get('collection_id');
      const limit = parseInt(searchParams.get('limit') || '24', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const sort = searchParams.get('sort');

      let filtered = [...products];
      if (collectionId) {
        // Simple mock: filter by tags matching collection handle
        const collection = collections.find((c) => c.id === collectionId);
        if (collection) {
          filtered = filtered.filter((p) =>
            p.tags?.some((t) => collection.handle.includes(t) || t.includes('лето')),
          );
        }
      }

      // Sort
      if (sort === 'price_asc') {
        filtered.sort((a, b) => a.price - b.price);
      } else if (sort === 'price_desc') {
        filtered.sort((a, b) => b.price - a.price);
      } else if (sort === 'newest') {
        filtered.reverse();
      }

      const paginated = filtered.slice(offset, offset + limit);
      const result: PaginatedResponse<Product> = {
        data: paginated,
        total: filtered.length,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: offset + limit < filtered.length,
      };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Collections
    if (url.includes('/collections')) {
      const collHandle = url.match(/\/collections\/([^/?]+)/);
      if (collHandle) {
        const collection = collections.find(
          (c) => c.handle === collHandle[1] || c.id === collHandle[1],
        );
        if (collection) {
          return new Response(JSON.stringify(collection), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }
      return new Response(JSON.stringify(collections), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cart endpoints (POST)
    if (url.includes('/carts')) {
      return new Response(
        JSON.stringify({ cartId: 'mock-cart-1', success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Checkout endpoint
    if (url.includes('/checkout')) {
      return new Response(
        JSON.stringify({
          orderId: 'mock-order-1',
          paymentUrl: 'https://yookassa.ru/checkout/mock',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Default: 404
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };
}

/**
 * MockStoreProvider replaces all fetch calls with mock data.
 * Works without a real backend -- ideal for theme development and testing.
 */
export const MockStoreProvider: React.FC<MockStoreProviderProps> = ({
  config: configOverride,
  products = mockProducts,
  collections = mockCollections,
  children,
}) => {
  const config: StoreConfig = {
    apiBase: 'http://localhost:3114/api/store',
    storeId: 'mock-store-1',
    currency: 'RUB',
    locale: 'ru-RU',
    ...configOverride,
  };

  // Replace global fetch with mock
  const originalFetch = React.useRef(globalThis.fetch);
  React.useEffect(() => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch(products, collections);
    return () => {
      globalThis.fetch = savedFetch;
    };
  }, [products, collections]);

  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            retry: false,
          },
        },
      }),
    [],
  );

  return (
    <StoreContext.Provider value={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </StoreContext.Provider>
  );
};
